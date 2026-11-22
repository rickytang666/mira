import { HttpError, config, prisma } from "wasp/server";
import { processInterview } from "wasp/server/jobs";
import type {
  CreateStudy,
  GetStudies,
  GetStudy,
  UpdateStudy,
  AddSource,
  DeleteSource,
  GetPublicStudy,
  FinishInterview,
  GetReport,
} from "wasp/server/operations";
import type { Question, Source, Study } from "wasp/entities";
import type { FinishInterviewInput, PublicStudy, ReportView } from "../contract";
import { importWebsite } from "../sources";
import { suggestQuestions } from "../agent/suggestQuestions";
import { interviewVariables } from "../agent/studyContext";
import { readSavedReport } from "../report/server";

type CreateStudyInput = { productUrl?: string; description?: string; goal: string; audience?: string };

export const createStudy: CreateStudy<CreateStudyInput, { id: string }> = async (args, context) => {
  const goal = args.goal?.trim();
  if (!goal) throw new HttpError(400, "Add what you want to learn.");
  const description = args.description?.trim() ?? "";
  let productUrl = args.productUrl?.trim() ?? "";
  if (!productUrl && !description) throw new HttpError(400, "Add your product URL or describe it.");
  if (productUrl && !/^https?:\/\//.test(productUrl)) productUrl = `https://${productUrl}`;

  let name = "My product";
  const sources: { kind: string; title: string; content: string; detail: string }[] = [];
  if (productUrl) {
    try {
      const page = await importWebsite({ url: productUrl });
      name = page.title || new URL(productUrl).hostname;
      sources.push({ kind: "url", ...page });
    } catch (error) {
      // A description is enough to continue when the site can't be scraped.
      if (!description) throw error;
      name = new URL(productUrl).hostname;
    }
  }
  if (description) {
    sources.push({ kind: "description", title: "Product description", content: description, detail: `${description.split(/\s+/).length} words` });
  }
  const contextParts = sources.map((source) => source.content);
  const audience = args.audience?.trim() ?? "";
  const studyContext = contextParts.join("\n\n").slice(0, 60000);

  const { questions } = await suggestQuestions({ productName: name, goal, audience, context: studyContext });
  const study = await context.entities.Study.create({
    data: {
      name,
      productUrl,
      goal,
      audience,
      context: studyContext,
      questions: { create: questions.map((text, order) => ({ text, order })) },
      sources: { create: sources },
    },
  });
  return { id: study.id };
};

export const getStudies: GetStudies<void, Pick<Study, "id" | "name" | "goal" | "createdAt">[]> = async (
  _args,
  context,
) => {
  return context.entities.Study.findMany({
    select: { id: true, name: true, goal: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
};

export const getStudy: GetStudy<{ studyId: string }, Study & { questions: Question[]; sources: Source[] }> = async (
  { studyId },
  context,
) => {
  const study = await context.entities.Study.findUnique({
    where: { id: studyId },
    include: { questions: { orderBy: { order: "asc" } }, sources: { orderBy: { createdAt: "asc" } } },
  });
  if (!study) throw new HttpError(404, "Study not found.");
  return study;
};

type UpdateStudyInput = {
  studyId: string;
  name?: string;
  goal?: string;
  audience?: string;
  questions?: { text: string; followUp: boolean }[];
};

export const updateStudy: UpdateStudy<UpdateStudyInput, void> = async (args, context) => {
  const { studyId, questions, ...fields } = args;
  await prisma.$transaction(async tx => {
    await tx.study.update({ where: { id: studyId }, data: { ...fields, reportRevision: { increment: 1 }, reportError: null } });
    if (questions) {
      await tx.question.deleteMany({ where: { studyId } });
      await tx.question.createMany({
        data: questions.filter(q => q.text.trim()).map((q, order) => ({ studyId, text: q.text.trim(), followUp: q.followUp, order })),
      });
    }
  });
};

type AddSourceInput = { studyId: string; kind: string; title: string; content: string; detail: string };

// Study.context is the joined text of its sources, so it is rebuilt on every source change.
async function rebuildStudyContext(studyId: string, entities: { Study: any; Source: any }) {
  const sources: Source[] = await entities.Source.findMany({ where: { studyId }, orderBy: { createdAt: "asc" } });
  const studyContext = sources.map((source) => source.content).join("\n\n").slice(0, 60000);
  await entities.Study.update({ where: { id: studyId }, data: { context: studyContext, reportRevision: { increment: 1 }, reportError: null } });
}

export const addSource: AddSource<AddSourceInput, void> = async (args, context) => {
  await context.entities.Source.create({ data: args });
  await rebuildStudyContext(args.studyId, context.entities);
};

export const deleteSource: DeleteSource<{ sourceId: string }, void> = async ({ sourceId }, context) => {
  const source = await context.entities.Source.delete({ where: { id: sourceId } });
  await rebuildStudyContext(source.studyId, context.entities);
};

export const getPublicStudy: GetPublicStudy<{ studyId: string }, PublicStudy> = async ({ studyId }, context) => {
  const study = await context.entities.Study.findUnique({
    where: { id: studyId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!study) throw new HttpError(404, "This interview link is not valid.");
  return {
    id: study.id,
    name: study.name,
    productUrl: study.productUrl,
    goal: study.goal,
    questions: study.questions.map((q) => q.text),
    dynamicVariables: interviewVariables({ id: study.id, productName: study.name, productUrl: study.productUrl, goal: study.goal, audience: study.audience, context: study.context, questions: study.questions }),
  };
};

export const finishInterview: FinishInterview<FinishInterviewInput, { interviewId: string }> = async (
  { studyId, conversationId, questionSnapshot },
  context,
) => {
  if (!conversationId) throw new HttpError(400, "Missing conversationId.");
  const study = await context.entities.Study.findUnique({ where: { id: studyId }, include: { questions: { orderBy: { order: "asc" } } } });
  if (!study) throw new HttpError(404, "Study not found.");
  if (questionSnapshot && (!Array.isArray(questionSnapshot) || questionSnapshot.length > 50 || questionSnapshot.some(q => typeof q !== 'string' || q.length > 2000))) throw new HttpError(400, 'Invalid question snapshot.');
  const interview = await context.entities.Interview.upsert({
    where: { conversationId }, update: {},
    create: { studyId, conversationId, status: 'processing', questionSnapshot: questionSnapshot ?? study.questions.map(q => q.text) },
  });
  if (interview.studyId !== studyId) throw new HttpError(409, 'Conversation already belongs to another study.');
  // Resubmission is safe, and recovers if enqueueing failed after the row was created.
  if (interview.status !== 'done') await processInterview.submit({ interviewId: interview.id });
  return { interviewId: interview.id };
};

export const getReport: GetReport<{ studyId: string }, ReportView> = async ({ studyId }, context) => {
  const study = await context.entities.Study.findUnique({
    where: { id: studyId },
    include: {
      interviews: { select: { status: true } },
      themes: { orderBy: { count: "desc" }, include: { quotes: { orderBy: { startSec: "asc" } } } },
    },
  });
  if (!study) throw new HttpError(404, "Study not found.");
  const saved = readSavedReport(study.report);
  const done = study.interviews.filter(i => i.status === 'done').length;
  const processing = study.interviews.filter(i => i.status === 'processing' || i.status === 'started').length;
  const metadata = {
    productName: study.name,
    interviewsDone: done,
    interviewsProcessing: processing,
    interviewsFailed: study.interviews.filter(i => i.status === 'failed').length,
    synthesizedInterviews: saved?.value.interviewsDone ?? 0,
    synthesisStatus: study.reportError ? 'failed' as const : saved?.revision === study.reportRevision ? 'ready' as const : done ? 'waiting' as const : processing ? 'processing' as const : 'waiting' as const,
    synthesisError: study.reportError ?? undefined,
  };
  if (saved) return { ...saved.value, ...metadata, goal: study.goal, themes: saved.value.themes.map(theme => ({ ...theme, quotes: theme.quotes.map(quote => ({ ...quote, audioUrl: quote.interviewId ? `${config.serverUrl}/api/interviews/${quote.interviewId}/audio` : quote.audioUrl })) })) };
  return {
    ...metadata,
    studyId: study.id,
    goal: study.goal,
    themes: study.themes.map((theme) => ({
      id: theme.id,
      label: theme.label,
      count: theme.count,
      quotes: theme.quotes.map((quote) => ({
        id: quote.id,
        text: quote.text,
        startSec: quote.startSec,
        endSec: quote.endSec,
        interviewId: quote.interviewId,
        audioUrl: `${config.serverUrl}/api/interviews/${quote.interviewId}/audio`,
      })),
    })),
  };
};

/** Generate a draft using persisted knowledge; the founder reviews and saves it explicitly. */
export async function generateStudyQuestions({ studyId, goal, audience }: { studyId: string; goal?: string; audience?: string }) {
  const study = await prisma.study.findUnique({ where: { id: studyId } });
  if (!study) throw new HttpError(404, 'Study not found.');
  try {
    return await suggestQuestions({ productName: study.name, goal: goal ?? study.goal, audience: audience ?? study.audience, context: study.context });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Could not generate questions.');
  }
}

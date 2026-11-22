import { HttpError, config } from "wasp/server";
import { processInterview } from "wasp/server/jobs";
import type {
  CreateStudy,
  GetStudies,
  GetStudy,
  UpdateStudy,
  GetPublicStudy,
  FinishInterview,
  GetReport,
} from "wasp/server/operations";
import type { Question, Study } from "wasp/entities";
import type { FinishInterviewInput, PublicStudy, ReportView, SuggestQuestionsInput } from "../contract";
import { importWebsite } from "../sources";
import { starterQuestions } from "../store";

// Template questions until the LLM suggestQuestions in src/agent lands.
async function suggestQuestions(input: SuggestQuestionsInput): Promise<string[]> {
  return starterQuestions(input.productName, input.goal, input.audience).map((q) => q.text);
}

type CreateStudyInput = { productUrl?: string; description?: string; goal: string; audience?: string };

export const createStudy: CreateStudy<CreateStudyInput, { id: string }> = async (args, context) => {
  const goal = args.goal?.trim();
  if (!goal) throw new HttpError(400, "Add what you want to learn.");
  const description = args.description?.trim() ?? "";
  let productUrl = args.productUrl?.trim() ?? "";
  if (!productUrl && !description) throw new HttpError(400, "Add your product URL or describe it.");
  if (productUrl && !/^https?:\/\//.test(productUrl)) productUrl = `https://${productUrl}`;

  let name = "My product";
  const contextParts: string[] = [];
  if (productUrl) {
    try {
      const page = await importWebsite({ url: productUrl });
      name = page.title || new URL(productUrl).hostname;
      contextParts.push(page.content);
    } catch (error) {
      // A description is enough to continue when the site can't be scraped.
      if (!description) throw error;
      name = new URL(productUrl).hostname;
    }
  }
  if (description) contextParts.push(description);
  const audience = args.audience?.trim() ?? "";
  const studyContext = contextParts.join("\n\n").slice(0, 60000);

  const questions = await suggestQuestions({ productName: name, goal, audience, context: studyContext });
  const study = await context.entities.Study.create({
    data: {
      name,
      productUrl,
      goal,
      audience,
      context: studyContext,
      questions: { create: questions.map((text, order) => ({ text, order })) },
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

export const getStudy: GetStudy<{ studyId: string }, Study & { questions: Question[] }> = async (
  { studyId },
  context,
) => {
  const study = await context.entities.Study.findUnique({
    where: { id: studyId },
    include: { questions: { orderBy: { order: "asc" } } },
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
  await context.entities.Study.update({ where: { id: studyId }, data: fields });
  if (questions) {
    await context.entities.Question.deleteMany({ where: { studyId } });
    await context.entities.Question.createMany({
      data: questions
        .filter((q) => q.text.trim())
        .map((q, order) => ({ studyId, text: q.text.trim(), followUp: q.followUp, order })),
    });
  }
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
  };
};

export const finishInterview: FinishInterview<FinishInterviewInput, { interviewId: string }> = async (
  { studyId, conversationId },
  context,
) => {
  if (!conversationId) throw new HttpError(400, "Missing conversationId.");
  const study = await context.entities.Study.findUnique({ where: { id: studyId }, select: { id: true } });
  if (!study) throw new HttpError(404, "Study not found.");
  // A repeated call for the same conversation returns the first interview, so a double tap can't double-count themes.
  const existing = await context.entities.Interview.findUnique({ where: { conversationId } });
  if (existing) return { interviewId: existing.id };
  const interview = await context.entities.Interview.create({ data: { studyId, conversationId, status: "processing" } });
  await processInterview.submit({ interviewId: interview.id });
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
  return {
    studyId: study.id,
    goal: study.goal,
    interviewsDone: study.interviews.filter((i) => i.status === "done").length,
    interviewsProcessing: study.interviews.filter((i) => i.status === "processing" || i.status === "started").length,
    themes: study.themes.map((theme) => ({
      id: theme.id,
      label: theme.label,
      count: theme.count,
      quotes: theme.quotes.map((quote) => ({
        id: quote.id,
        text: quote.text,
        startSec: quote.startSec,
        audioUrl: `${config.serverUrl}/api/interviews/${quote.interviewId}/audio`,
      })),
    })),
  };
};

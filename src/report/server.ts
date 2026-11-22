import { prisma, config } from 'wasp/server';
import type { FetchedConversation, ReportView } from '../contract';
import { fetchConversation } from '../jobs/elevenlabsClient';
import { refreshStudyReport, type ReportRepository } from './pipeline';

export const reportRepository: ReportRepository = {
  async load(studyId) {
    const study = await prisma.study.findUniqueOrThrow({ where: { id: studyId }, include: {
      questions: { orderBy: { order: 'asc' } }, interviews: { orderBy: { createdAt: 'asc' } },
    } });
    return {
      revision: study.reportRevision,
      study: { id: study.id, productName: study.name, productUrl: study.productUrl, goal: study.goal, audience: study.audience, context: study.context, questions: study.questions },
      calls: study.interviews.filter(call => call.transcript).map((call, index) => ({
        interviewId: call.id, title: `Participant ${String(index + 1).padStart(2, '0')}`,
        conversation: call.transcript as unknown as FetchedConversation,
        // Older calls lack a snapshot; do not claim they used today's revised questions.
        questions: Array.isArray(call.questionSnapshot) ? call.questionSnapshot.filter((q): q is string => typeof q === 'string') : [],
        audioUrl: `${config.serverUrl}/api/interviews/${call.id}/audio`,
      })),
    };
  },
  async save(studyId, revision, report) {
    return prisma.$transaction(async tx => {
      // The conditional update locks the study row until all evidence is committed.
      const claimed = await tx.study.updateMany({ where: { id: studyId, reportRevision: revision }, data: {
        report: JSON.parse(JSON.stringify({ revision, value: report })), reportError: null,
      } });
      if (!claimed.count) return false;
      await tx.theme.deleteMany({ where: { studyId } });
      for (const theme of report.themes) {
        await tx.theme.create({ data: { studyId, label: theme.label, count: theme.count, quotes: {
          create: theme.quotes.filter(q => q.interviewId && !q.untimed && q.endSec !== undefined).map(q => ({
            interviewId: q.interviewId!, text: q.text, startSec: q.startSec, endSec: q.endSec!,
          })),
        } } });
      }
      return true;
    });
  },
  async fail(studyId, revision, message) {
    await prisma.study.updateMany({ where: { id: studyId, reportRevision: revision }, data: { reportError: message } });
  },
};

export async function rebuildReport(studyId: string, force = false) {
  const study = await prisma.study.findUniqueOrThrow({ where: { id: studyId } });
  const cached = readSavedReport(study.report);
  if (!force && cached?.revision === study.reportRevision && !study.reportError) return cached.value;
  // Upgrade calls completed by Track 1's old placeholder without losing their full evidence.
  const missing = await prisma.interview.findMany({ where: { studyId, status: 'done' } });
  for (const call of missing.filter(call => !call.transcript)) {
    const conversation = await fetchConversation(call.conversationId);
    if (conversation.status !== 'done') throw new Error('A previous call transcript is still processing. Try again shortly.');
    await prisma.$transaction(async tx => {
      await tx.study.update({ where: { id: studyId }, data: { reportRevision: { increment: 1 } } });
      await tx.interview.update({ where: { id: call.id }, data: { transcript: JSON.parse(JSON.stringify(conversation)), durationSecs: conversation.durationSecs } });
    });
  }
  return refreshStudyReport(studyId, reportRepository);
}

export function readSavedReport(value: unknown): { revision: number; value: ReportView } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const saved = value as { revision?: unknown; value?: ReportView };
  return typeof saved.revision === 'number' && saved.value && Array.isArray(saved.value.themes)
    ? { revision: saved.revision, value: saved.value } : undefined;
}

import { prisma, config } from 'wasp/server';
import type { FetchedConversation, ReportView } from '../contract';
import { rebuildStudyReport } from 'wasp/server/jobs';
import { fetchConversation } from '../jobs/elevenlabsClient';
import { oneRebuildAtATime, refreshStudyReport, type ReportRepository } from './pipeline';
import { isSubstantive, participantTitle } from './participants';

export const reportRepository: ReportRepository = {
  async load(studyId) {
    const study = await prisma.study.findUniqueOrThrow({
      where: { id: studyId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        interviews: { orderBy: { createdAt: 'asc' } },
      },
    });
    return {
      revision: study.reportRevision,
      study: {
        id: study.id,
        productName: study.name,
        productUrl: study.productUrl,
        goal: study.goal,
        audience: study.audience,
        context: study.context,
        questions: study.questions,
      },
      calls: study.interviews
        .filter((call) => call.transcript && isSubstantive(call.transcript as unknown as FetchedConversation))
        .map((call, index) => ({
          interviewId: call.id,
          title: participantTitle(index),
          conversation: call.transcript as unknown as FetchedConversation,
          // Older calls lack a snapshot; do not claim they used today's revised questions.
          questions: Array.isArray(call.questionSnapshot)
            ? call.questionSnapshot.filter((q): q is string => typeof q === 'string')
            : [],
          audioUrl: `${config.serverUrl}/api/interviews/${call.id}/audio`,
        })),
    };
  },
  async save(studyId, revision, report) {
    return prisma.$transaction(async (tx) => {
      // The conditional update locks the study row until all evidence is committed.
      const claimed = await tx.study.updateMany({
        where: { id: studyId, reportRevision: revision },
        data: {
          report: JSON.parse(JSON.stringify({ revision, value: report })),
          reportError: null,
        },
      });
      if (!claimed.count) return false;
      await tx.theme.deleteMany({ where: { studyId } });
      for (const theme of report.themes) {
        await tx.theme.create({
          data: {
            studyId,
            label: theme.label,
            count: theme.count,
            quotes: {
              create: theme.quotes
                .filter((q) => q.interviewId && !q.untimed && q.endSec !== undefined)
                .map((q) => ({
                  interviewId: q.interviewId!,
                  text: q.text,
                  startSec: q.startSec,
                  endSec: q.endSec!,
                })),
            },
          },
        });
      }
      return true;
    });
  },
  async fail(studyId, revision, message) {
    await prisma.study.updateMany({ where: { id: studyId, reportRevision: revision }, data: { reportError: message } });
  },
};

// pg-boss 8 prefixes singleton-queue keys with this; the unique index then covers only queued jobs, not active ones.
const SINGLETON_QUEUE_PREFIX = '__pgboss__singleton_queue';

// At most one waiting rebuild per study; a submit while one runs still queues one more, so no interview is missed.
export async function queueReportRebuild(studyId: string) {
  await rebuildStudyReport.submit({ studyId }, { singletonKey: studyId, useSingletonQueue: true });
}

export async function rebuildQueued(studyId: string): Promise<boolean> {
  try {
    // pg-boss has no lookup by singleton key, so read its job table directly.
    const rows = await prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM pgboss.job
      WHERE name = 'rebuildStudyReport' AND singletonkey = ${SINGLETON_QUEUE_PREFIX + studyId} AND state IN ('created', 'retry', 'active')
      LIMIT 1`;
    return rows.length > 0;
  } catch (error) {
    console.warn(`could not read the report rebuild queue: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

export function rebuildReport(studyId: string, force = false) {
  // The saved-report check runs inside the lock, so a waiting rebuild reuses the one that just finished.
  return oneRebuildAtATime(studyId, () => rebuildLatest(studyId, force));
}

async function rebuildLatest(studyId: string, force: boolean) {
  const study = await prisma.study.findUniqueOrThrow({ where: { id: studyId } });
  const cached = readSavedReport(study.report);
  if (!force && cached?.revision === study.reportRevision && !study.reportError) return cached.value;
  // Upgrade calls completed by Track 1's old placeholder without losing their full evidence.
  const missing = await prisma.interview.findMany({ where: { studyId, status: 'done' } });
  for (const call of missing.filter((call) => !call.transcript)) {
    const conversation = await fetchConversation(call.conversationId);
    if (conversation.status !== 'done')
      throw new Error('A previous call transcript is still processing. Try again shortly.');
    await prisma.$transaction(async (tx) => {
      await tx.study.update({ where: { id: studyId }, data: { reportRevision: { increment: 1 } } });
      await tx.interview.update({
        where: { id: call.id },
        data: { transcript: JSON.parse(JSON.stringify(conversation)), durationSecs: conversation.durationSecs },
      });
    });
  }
  return refreshStudyReport(studyId, reportRepository);
}

export function readSavedReport(value: unknown): { revision: number; value: ReportView } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const saved = value as { revision?: unknown; value?: ReportView };
  return typeof saved.revision === 'number' && saved.value && Array.isArray(saved.value.themes)
    ? { revision: saved.revision, value: saved.value }
    : undefined;
}

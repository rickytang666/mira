import { prisma } from 'wasp/server';
import type { ProcessInterview } from 'wasp/server/jobs';
import { fetchConversation } from './elevenlabsClient';
import { rebuildReport } from '../report/server';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const processInterview: ProcessInterview<{ interviewId: string }, { themes: number }> = async ({ interviewId }) => {
  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId } });
  let transcriptSaved = Boolean(interview.transcript);
  try {
    if (!transcriptSaved) {
      await prisma.interview.update({ where: { id: interviewId }, data: { status: 'processing', error: null } });
      let conversation = await fetchConversation(interview.conversationId);
      for (let attempt = 1; attempt < 20 && !['done', 'failed'].includes(conversation.status); attempt++) {
        await sleep(1500);
        conversation = await fetchConversation(interview.conversationId);
      }
      if (conversation.status !== 'done') throw new Error(`Conversation is ${conversation.status}; transcript is not ready.`);
      await prisma.$transaction(async tx => {
        // Lock the study first, matching report commits. Retries replace, never append evidence.
        await tx.study.update({ where: { id: interview.studyId }, data: { reportRevision: { increment: 1 }, reportError: null } });
        await tx.interview.update({ where: { id: interviewId }, data: {
          status: 'done', error: null, durationSecs: conversation.durationSecs,
          transcript: JSON.parse(JSON.stringify(conversation)),
        } });
      });
      transcriptSaved = true;
    }
    const report = await rebuildReport(interview.studyId);
    return { themes: report.themes.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interview processing failed.';
    // A model outage must not erase a successfully fetched call or last-good report.
    if (!transcriptSaved) await prisma.interview.update({ where: { id: interviewId }, data: { status: 'failed', error: message } });
    throw error; // PgBoss retries transient fetching/model failures.
  }
};

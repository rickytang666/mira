import type { FetchedConversation, ReportView } from '../contract';
import type { AgentOptions } from './llm';
import type { StudyResearchContext } from './studyContext';
import { synthesizeCalls } from './synthesizeReport';
import { parseTranscript } from './transcript';

export interface StudyCall {
  interviewId: string;
  title: string;
  conversation: FetchedConversation;
  /** The question list saved when this specific call began. */
  questions: string[];
  audioUrl?: string;
}

/** Background-job entry point. Takes fetched completed calls, never asks a founder to paste text. */
export async function synthesizeStudy(
  study: StudyResearchContext,
  calls: StudyCall[],
  options: AgentOptions = {},
): Promise<ReportView> {
  const unique = [...new Map(calls.map((call) => [call.conversation.conversationId, call])).values()];
  const completed = unique.filter((call) => call.conversation.status === 'done');
  const processing = unique.filter(
    (call) => call.conversation.status === 'processing' || call.conversation.status === 'in-progress',
  ).length;
  const readable = completed.flatMap((call) => {
    try {
      const turns = parseTranscript(JSON.stringify(call.conversation));
      return [{ id: call.interviewId, title: call.title, questions: call.questions, turns }];
    } catch (error) {
      // One malformed call must not freeze the report for every other interview.
      console.warn(
        `skipping interview ${call.interviewId} in report: ${error instanceof Error ? error.message : 'unreadable transcript'}`,
      );
      return [];
    }
  });
  if (!readable.length)
    return {
      studyId: study.id,
      productName: study.productName,
      goal: study.goal,
      interviewsDone: 0,
      interviewsProcessing: processing,
      themes: [],
      updatedAt: new Date().toISOString(),
    };
  const report = await synthesizeCalls(
    {
      studyId: study.id,
      productName: study.productName,
      goal: study.goal,
      audience: study.audience,
      context: study.context,
      questions: study.questions.map((q) => q.text),
    },
    readable,
    options,
  );
  const audio = new Map(completed.map((call) => [call.interviewId, call.audioUrl ?? '']));
  return {
    ...report,
    interviewsProcessing: processing,
    themes: report.themes.map((theme) => ({
      ...theme,
      quotes: theme.quotes.map((quote) => ({ ...quote, audioUrl: audio.get(quote.interviewId ?? '') ?? '' })),
    })),
  };
}

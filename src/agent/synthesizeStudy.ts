import type { FetchedConversation, ReportView } from '../contract';
import type { AgentOptions } from './llm';
import type { StudyResearchContext } from './studyContext';
import { synthesizeReport } from './synthesizeReport';

export interface StudyCall {
  interviewId: string;
  title: string;
  conversation: FetchedConversation;
  /** The question list saved when this specific call began. */
  questions: string[];
  audioUrl?: string;
}

/** Background-job entry point. Takes fetched completed calls, never asks a founder to paste text. */
export async function synthesizeStudy(study: StudyResearchContext, calls: StudyCall[], options: AgentOptions = {}): Promise<ReportView> {
  const unique = [...new Map(calls.map(call => [call.conversation.conversationId, call])).values()];
  const completed = unique.filter(call => call.conversation.status === 'done');
  const processing = unique.filter(call => call.conversation.status === 'processing' || call.conversation.status === 'in-progress').length;
  if (!completed.length) return { studyId: study.id, productName: study.productName, goal: study.goal, interviewsDone: 0, interviewsProcessing: processing, themes: [], updatedAt: new Date().toISOString() };
  const report = await synthesizeReport({
    studyId: study.id, productName: study.productName, goal: study.goal,
    audience: study.audience, context: study.context, questions: study.questions.map(q => q.text),
    calls: completed.map(call => ({
      id: call.interviewId, title: call.title, questions: call.questions,
      transcript: JSON.stringify(call.conversation),
    })),
  }, options);
  const audio = new Map(completed.map(call => [call.interviewId, call.audioUrl ?? '']));
  return { ...report, interviewsProcessing: processing, themes: report.themes.map(theme => ({ ...theme, quotes: theme.quotes.map(quote => ({ ...quote, audioUrl: audio.get(quote.interviewId ?? '') ?? '' })) })) };
}

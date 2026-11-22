import type { InterviewDynamicVariables, SuggestQuestionsInput } from '../contract';

/** Structurally matches the current store and can also be built from persisted Study/Question rows. */
export interface StudyResearchContext {
  id: string;
  productName: string;
  productUrl: string;
  goal: string;
  audience: string;
  context: string;
  questions: { id: string; text: string; followUp: boolean }[];
}
type WorkspaceInput = {
  name: string; goal: string; audience: string;
  sources: { title: string; content: string }[];
  questions: { id: string; text: string; followUp: boolean }[];
};

/** Snapshot at interview start so later founder edits do not change what an earlier call was asked. */
export function snapshotStudy(studyId: string, workspace: WorkspaceInput, productUrl = ''): StudyResearchContext {
  return {
    id: studyId, productName: workspace.name, productUrl,
    goal: workspace.goal, audience: workspace.audience,
    context: workspace.sources.map(source => `${source.title}\n${source.content}`).join('\n\n'),
    questions: workspace.questions.filter(question => question.text.trim()).map(question => ({ ...question, text: question.text.trim() })),
  };
}

export function questionGenerationInput(study: StudyResearchContext): SuggestQuestionsInput {
  return { productName: study.productName, goal: study.goal, audience: study.audience, context: study.context };
}

/** The same final questions are sent to the voice interviewer and retained for report synthesis. */
export function interviewVariables(study: StudyResearchContext): InterviewDynamicVariables {
  if (!study.questions.length) throw new Error('Add interview questions before starting a call.');
  return {
    product_url: study.productUrl, goal: study.goal, study_id: study.id,
    product_context: study.context.slice(0, 40_000), audience: study.audience,
    questions: study.questions.map((q, i) => `${i + 1}. ${q.text}${q.followUp ? '' : ' [Do not ask a follow-up for this question.]'}`).join('\n'),
  };
}

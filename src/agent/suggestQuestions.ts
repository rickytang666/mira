import type { SuggestQuestionsInput, SuggestQuestionsOutput } from '../contract';
import { generateJson, object, requiredText, type AgentOptions } from './llm';

/** Public Track 1 action boundary. Takes joined product context and returns 3–5 strings. */
export async function suggestQuestions(context: SuggestQuestionsInput, options: AgentOptions = {}): Promise<SuggestQuestionsOutput> {
  const input: SuggestQuestionsInput = {
    productName: requiredText(context.productName, 200),
    goal: requiredText(context.goal, 4000),
    audience: context.audience?.slice(0, 2000) ?? '',
    context: requiredText(context.context, 120_000).slice(0, 40_000),
  };
  const result = object(await generateJson({
    system: `You are an experienced user researcher preparing a 60–90 second spoken interview.
Write 3 to 5 concise, open-ended questions grounded in the supplied product context and research goal.
Start with a recent concrete experience, investigate friction and current workarounds, then priorities.
Ask one thing at a time, in one spoken sentence. Avoid leading language, sales pitches, hypothetical willingness to pay, and assumptions that the participant has used the product.
Do not read the research goal back as a question. Let the interviewer ask natural follow-ups.
Return {"questions":["question one?","question two?","question three?"]}.`, input,
  }, options));
  if (!Array.isArray(result.questions) || result.questions.length < 3 || result.questions.length > 5) throw new Error('Analysis must return 3 to 5 questions.');
  const seen = new Set<string>();
  const questions = result.questions.map(value => {
    const text = requiredText(value, 500);
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (seen.has(key)) throw new Error('Analysis returned duplicate questions.');
    seen.add(key);
    return text;
  });
  return { questions };
}

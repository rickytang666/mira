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
    system: `You are an experienced user researcher preparing a 60–90 second spoken interview about this specific product.
Write 3 to 5 short, open-ended questions that serve the research goal.
Read the product context first and pick the concrete specifics that matter for the goal: named features, workflows, setup or onboarding steps, plans or pricing details, integrations, and moments of use.
At least all but one question must name one of those specifics from the context, so each question would make no sense for a different product. Never ask a generic question like "What were you trying to achieve?" or "What challenges did you face?".
Order them as a natural conversation: what they did with the product, where it broke down or surprised them, and what they did instead.
Ask one thing per question, in one spoken sentence of at most 25 words. Keep them open and neutral: do not suggest an answer, assume a feeling, pitch the product, or ask about hypothetical willingness to pay.
Do not read the research goal back as a question. Let the interviewer ask natural follow-ups.
Return {"questions":["question one?","question two?","question three?"]}.`, input,
  }, options));
  if (!Array.isArray(result.questions) || result.questions.length < 3) throw new Error('Analysis must return 3 to 5 questions.');
  const seen = new Set<string>();
  // Extra or repeated questions are trimmed so a judge's study never fails on stage.
  const questions = result.questions.flatMap(value => {
    const text = requiredText(value, 500);
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (seen.has(key)) return [];
    seen.add(key);
    return [text];
  }).slice(0, 5);
  return { questions };
}

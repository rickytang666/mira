import type { InterviewSynthesis, SynthesizeInterviewInput, InterviewTheme } from './internalTypes';
import { parseTranscript } from './transcript';
import { generateJson, object, requiredText, type AgentOptions } from './llm';
import type { SynthesizeInterviewInput as ContractInput, SynthesizeInterviewOutput } from '../contract';

export type SynthesisOptions = AgentOptions & { durationSecs?: number };

/** Public Track 1 job boundary. Compatible with the pulled src/contract.ts. */
export async function synthesizeInterview(
  input: ContractInput,
  options: SynthesisOptions = {},
): Promise<SynthesizeInterviewOutput> {
  if (!Array.isArray(input.turns)) throw new Error('Expected conversation turns.');
  for (const turn of input.turns) {
    if (!Number.isFinite(turn.timeInCallSecs) || turn.timeInCallSecs < 0)
      throw new Error('Each conversation turn needs a non-negative timestamp.');
  }
  if (options.durationSecs !== undefined && (!Number.isFinite(options.durationSecs) || options.durationSecs < 0))
    throw new Error('Invalid recording duration.');
  const analysis = await analyzeTranscript(
    {
      transcript: input.turns.map((turn, index) => ({
        id: `turn-${index}`,
        role: turn.role,
        text: turn.text,
        startSec: turn.timeInCallSecs,
        endSec: null,
      })),
      durationSec: options.durationSecs,
      context: { name: '', goal: input.goal },
      questions: input.questions,
      existingThemes: input.existingThemeLabels.map((label) => ({ label, summary: '' })),
    },
    options,
  );
  return {
    themes: analysis.themes.map((theme) => ({
      label: theme.label,
      quotes: theme.quotes.map((quote) => {
        if (quote.startSec === null || quote.endSec === null)
          throw new Error('Pass durationSecs in synthesis options to bound a quote from the last conversation turn.');
        return { text: quote.text, startSec: quote.startSec, endSec: quote.endSec };
      }),
    })),
  };
}

/** The model selects turn IDs. It never generates quote text or playback offsets. */
export async function analyzeTranscript(
  input: SynthesizeInterviewInput,
  options: AgentOptions = {},
): Promise<InterviewSynthesis> {
  if (Array.isArray(input.transcript) && input.transcript.length === 0)
    return {
      summary: 'No participant responses were captured.',
      themes: [],
      method: 'llm',
      warnings: ['No participant evidence to analyze.'],
    };
  const turns = parseTranscript(input.transcript, input.durationSec);
  const participants = new Map(turns.filter((turn) => turn.role === 'user').map((turn) => [turn.id, turn]));
  if (!participants.size)
    return {
      summary: 'No participant responses were captured.',
      themes: [],
      method: 'llm',
      warnings: ['No participant evidence to analyze.'],
    };
  const raw = object(
    await generateJson(
      {
        system: `You are a careful user researcher. Analyze only evidence from participant (user) turns.
Return {"summary":"brief factual summary","themes":[{"label":"short specific finding","summary":"what this participant experienced","turnIds":["turn-id"]}]}.
Extract at most 5 useful themes, with at most 3 supporting turns each. Return no themes for small talk, refusals, or irrelevant content.
Do not infer a finding from an interviewer question. Preserve uncertainty and distinguish requests from experienced problems.
Reuse existing theme labels only when the meaning truly matches. Prefer descriptive labels that can recur across interviews.
Select complete participant turns as evidence; do not rewrite quotes or generate timestamps. Never claim prevalence from a single interview.`,
        input: {
          context: input.context
            ? {
                ...input.context,
                sources: input.context.sources
                  ?.slice(0, 5)
                  .map((s) => ({ title: s.title, content: s.content.slice(0, 4000) })),
                productContext: input.context.productContext?.slice(0, 10000),
              }
            : undefined,
          questions: input.questions,
          existingThemes: input.existingThemes?.slice(0, 100),
          transcript: turns,
        },
      },
      options,
    ),
  );
  if (!Array.isArray(raw.themes) || raw.themes.length > 5) throw new Error('Analysis returned an invalid theme list.');
  const labels = new Set<string>();
  const themes: InterviewTheme[] = raw.themes.map((value) => {
    const theme = object(value);
    const label = requiredText(theme.label, 120);
    if (labels.has(label.toLowerCase())) throw new Error('Analysis returned duplicate themes.');
    labels.add(label.toLowerCase());
    if (!Array.isArray(theme.turnIds) || theme.turnIds.length < 1 || theme.turnIds.length > 3)
      throw new Error('Each theme needs 1 to 3 evidence turns.');
    const turnIds = [...new Set(theme.turnIds)];
    const quotes = turnIds.map((id) => {
      const turn = typeof id === 'string' ? participants.get(id) : undefined;
      if (!turn) throw new Error('Analysis cited a missing or non-participant turn.');
      return { turnId: turn.id, text: turn.text, startSec: turn.startSec, endSec: turn.endSec };
    });
    return { label, summary: requiredText(theme.summary, 1000), quotes };
  });
  return {
    summary: requiredText(raw.summary, 2000),
    themes,
    method: 'llm',
    warnings: turns.some((t) => t.role === 'user' && t.startSec === null)
      ? ['Some participant turns have no timestamps; playback is disabled for those quotes.']
      : [],
  };
}

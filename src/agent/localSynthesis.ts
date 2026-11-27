import type { InterviewSynthesis, SynthesizeInterviewInput } from './internalTypes';
import { parseTranscript } from './transcript';

/** Explicit offline preview only. Production uses synthesizeInterview, never a silent fallback. */
export function synthesizeLocally(input: SynthesizeInterviewInput): InterviewSynthesis {
  const turns = parseTranscript(input.transcript, input.durationSec).filter(t => t.role === 'user');
  const categories: Array<[string, RegExp]> = [
    ['Setup and onboarding', /\b(setup|onboard\w*|sign.?up|getting started|first time|connect\w*|api key)\b/i],
    ['Reliability and speed', /\b(slow|crash\w*|bug\w*|error\w*|broke|broken|latency|load\w*|wait\w*)\b/i],
    ['Pricing and value', /\b(pric\w*|cost\w*|expensive|cheap|pay|paid|budget|free|subscription)\b/i],
    ['Finding the next step', /\b(confus\w*|unclear|find|found|navigate|navigation|where|understand|documentation|docs)\b/i],
    ['Manual work and alternatives', /\b(manual\w*|spreadsheet|copy|paste|workaround|instead|export\w*|excel)\b/i],
  ];
  const used = new Set<string>();
  const themes = categories.flatMap(([label, pattern]) => {
    const matching = turns.filter(t => t.text.length >= 20 && pattern.test(t.text) && !used.has(t.id)).slice(0, 3);
    for (const t of matching) used.add(t.id);
    return matching.length ? [{ label, summary: 'Review the participant’s words below; this is a keyword grouping.', quotes: matching.map(t => ({ turnId: t.id, text: t.text, startSec: t.startSec, endSec: t.endSec })) }] : [];
  });
  const remaining = turns.filter(t => t.text.length >= 40 && !used.has(t.id)).slice(0, 3);
  if (remaining.length && themes.length < 5) themes.push({ label: 'Other participant feedback', summary: 'Ungrouped participant statements for review.', quotes: remaining.map(t => ({ turnId: t.id, text: t.text, startSec: t.startSec, endSec: t.endSec })) });
  return { summary: `${turns.length} participant responses captured.`, themes, method: 'local', warnings: ['Offline preview: keyword groups, not AI findings.', ...(turns.some(t => t.startSec === null) ? ['Untimed quotes cannot be played. Supply timestamped turns to enable playback.'] : [])] };
}

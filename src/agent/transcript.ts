import type { TranscriptTurn } from './internalTypes';

const MAX_TRANSCRIPT_LENGTH = 120_000;
const roleOf = (role: unknown): TranscriptTurn['role'] | null => {
  if (typeof role !== 'string') return null;
  if (/^(user|participant|respondent|customer|interviewee)$/i.test(role)) return 'user';
  if (/^(agent|assistant|interviewer)$/i.test(role)) return 'agent';
  return null;
};
const seconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Accept normalized turns, ElevenLabs JSON, or [00:12] Participant: text. */
export function parseTranscript(input: string | TranscriptTurn[], durationSec?: number): TranscriptTurn[] {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    if (raw.length > MAX_TRANSCRIPT_LENGTH) throw new Error('Transcript exceeds 120,000 characters.');
    const text = raw.trim();
    if (!text) throw new Error('Paste a transcript first.');
    if (/^[\[{]/.test(text) && !/^\[\d/.test(text)) {
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('Transcript JSON is invalid.');
      }
    } else {
      const lines: TranscriptTurn[] = [];
      // Timestamp optional. Bare text is an untimed participant statement.
      const header =
        /^(?:\[?(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?)\]?\s*)?(?:(user|participant|respondent|customer|interviewee|agent|assistant|interviewer)\s*:\s*)?(.*)$/i;
      for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
        const match = header.exec(line.trim());
        if (!match) continue;
        if (!match[1] && !match[2] && lines.length) {
          lines[lines.length - 1].text += '\n' + line.trim();
          continue;
        }
        const parts = match[1]?.split(':').map(Number);
        if (parts && parts.slice(1).some((n) => n >= 60)) throw new Error('Invalid timestamp: ' + match[1]);
        const startSec = parts ? parts.reduce((total, part) => total * 60 + part, 0) : null;
        lines.push({
          id: `turn-${lines.length}`,
          role: roleOf(match[2]) ?? 'user',
          text: match[3],
          startSec,
          endSec: null,
        });
      }
      raw = lines;
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'transcript' in raw) {
    const obj = raw as { transcript: unknown; metadata?: { call_duration_secs?: number } };
    durationSec ??= obj.metadata?.call_duration_secs;
    raw = obj.transcript;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'turns' in raw) {
    const obj = raw as { turns: unknown; durationSecs?: number };
    durationSec ??= obj.durationSecs;
    raw = obj.turns;
  }
  if (!Array.isArray(raw)) throw new Error('Expected a transcript array or conversation JSON.');
  if (JSON.stringify(raw).length > MAX_TRANSCRIPT_LENGTH) throw new Error('Transcript exceeds 120,000 characters.');
  const ids = new Set<string>();
  const turns: TranscriptTurn[] = raw
    .flatMap((entry, index) => {
      if (!entry || typeof entry !== 'object') throw new Error(`Invalid transcript turn ${index + 1}.`);
      const role = roleOf(entry.role);
      const text = entry.text ?? entry.message;
      // ElevenLabs includes tool-only turns with a null message.
      if (text == null || text === '') return [];
      if (!role || typeof text !== 'string') throw new Error(`Unknown speaker or invalid text in turn ${index + 1}.`);
      const id = typeof entry.id === 'string' ? entry.id : `turn-${index}`;
      if (ids.has(id)) throw new Error('Transcript turn IDs must be unique.');
      ids.add(id);
      const startRaw = entry.startSec ?? entry.time_in_call_secs ?? entry.timeInCallSecs;
      const endRaw = entry.endSec;
      if ((startRaw != null && seconds(startRaw) === null) || (endRaw != null && seconds(endRaw) === null))
        throw new Error('Transcript timestamps must be non-negative finite seconds.');
      return [{ id, role, text: text.trim(), startSec: seconds(startRaw), endSec: seconds(endRaw) }];
    })
    .filter((turn) => turn.text);
  let previous = -1;
  const duration = seconds(durationSec);
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.startSec === null) {
      turn.endSec = null;
      continue;
    }
    if (turn.startSec < previous) throw new Error('Transcript timestamps must be in chronological order.');
    const start = turn.startSec;
    previous = start;
    const next = turns.slice(i + 1).find((t) => t.startSec !== null && t.startSec > start)?.startSec;
    const boundary = next ?? duration;
    if (turn.endSec === null && boundary != null && boundary > turn.startSec) turn.endSec = boundary;
    if (turn.endSec !== null && (turn.endSec <= turn.startSec || (boundary != null && turn.endSec > boundary)))
      throw new Error('A transcript turn ends outside its time range.');
    if (duration !== null && turn.startSec > duration)
      throw new Error('Transcript timestamp exceeds recording duration.');
  }
  if (!turns.length) throw new Error('Transcript contains no spoken text.');
  return turns;
}

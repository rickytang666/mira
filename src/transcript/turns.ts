import type { ReportQuote } from '../agent/internalTypes';

// Type aliases, not interfaces: Wasp query payloads must be SuperJSON-serializable records.
export type TranscriptLine = {
  id: string;
  speaker: 'mira' | 'participant';
  text: string;
  startSec: number | null;
  endSec: number | null;
};

export type InterviewView = {
  studyId: string;
  interviewId: string;
  productName: string;
  participantLabel: string;
  status: string;
  createdAt: string;
  durationSecs: number | null;
  questions: string[];
  turns: TranscriptLine[];
  audioUrl: string | null;
};

const seconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Tolerates any saved shape: a broken turn is dropped or left untimed instead of hiding the whole call. */
export function transcriptLines(saved: unknown): TranscriptLine[] {
  if (!saved || typeof saved !== 'object') return [];
  const { turns, durationSecs } = saved as { turns?: unknown; durationSecs?: unknown };
  if (!Array.isArray(turns)) return [];
  const lines: TranscriptLine[] = turns.flatMap((turn, index) => {
    if (!turn || typeof turn !== 'object') return [];
    const { role, text, timeInCallSecs } = turn as { role?: unknown; text?: unknown; timeInCallSecs?: unknown };
    if (typeof text !== 'string' || !text.trim()) return [];
    return [
      {
        id: `turn-${index}`,
        speaker: role === 'agent' ? 'mira' : 'participant',
        text: text.trim(),
        startSec: seconds(timeInCallSecs),
        endSec: null,
      },
    ];
  });
  const duration = seconds(durationSecs);
  // A turn ends where the next later turn starts, else at the call's end, the same rule quotes use.
  lines.forEach((line, i) => {
    if (line.startSec === null) return;
    const start = line.startSec;
    const next = lines.slice(i + 1).find((l) => l.startSec !== null && l.startSec > start)?.startSec;
    const end = next ?? duration;
    line.endSec = end !== null && end !== undefined && end > start ? end : null;
  });
  return lines;
}

/** Reads the quote's start second from a `?at=` search string. */
export function parseAt(search: string): number | null {
  const raw = new URLSearchParams(search).get('at');
  if (raw === null || raw.trim() === '') return null;
  return seconds(Number(raw));
}

/** The turn a report quote came from: an exact participant start, else the turn playing at that second. */
export function turnAt(lines: TranscriptLine[], at: number | null): number {
  if (at === null) return -1;
  const exact = lines.findIndex(
    (line) => line.speaker === 'participant' && line.startSec !== null && Math.abs(line.startSec - at) < 0.05,
  );
  if (exact !== -1) return exact;
  let found = -1;
  lines.forEach((line, i) => {
    if (line.startSec !== null && line.startSec <= at) found = i;
  });
  return found;
}

export function transcriptHref(studyId: string, interviewId: string, startSec: number | null) {
  const path = `/study/${encodeURIComponent(studyId)}/interviews/${encodeURIComponent(interviewId)}`;
  return startSec === null ? path : `${path}?at=${startSec}`;
}

/** Shapes a turn like a report quote so the report's player plays it from its start to its end. */
export function lineAsQuote(line: TranscriptLine, view: InterviewView): ReportQuote {
  return {
    id: line.id,
    turnId: line.id,
    text: line.text,
    startSec: line.startSec,
    endSec: line.endSec,
    interviewId: view.interviewId,
    participantLabel: view.participantLabel,
    audioUrl: view.audioUrl,
  };
}

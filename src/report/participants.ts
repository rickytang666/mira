import type { FetchedConversation } from '../contract';
import { isSubstantive } from './substantive';

export const participantTitle = (index: number) => `Participant ${String(index + 1).padStart(2, '0')}`;

/** Labels match the report: numbered by creation order among substantive calls only. */
export function participantTitles(interviews: { id: string; createdAt: Date; transcript: unknown }[]) {
  const counted = [...interviews]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .filter((call) => call.transcript && isSubstantive(call.transcript as FetchedConversation));
  return new Map(counted.map((call, index) => [call.id, participantTitle(index)]));
}

/** The question list saved when a call began; non-text entries from older rows are dropped. */
export function savedQuestions(snapshot: unknown): string[] {
  return Array.isArray(snapshot) ? snapshot.filter((q): q is string => typeof q === 'string') : [];
}

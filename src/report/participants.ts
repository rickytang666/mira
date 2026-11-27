import type { FetchedConversation } from '../contract';

// Joke runs and dropped calls stay saved but are kept out of themes and the summary.
const MIN_CALL_SECS = 15;
const MIN_PARTICIPANT_WORDS = 10;
export function isSubstantive(conversation: FetchedConversation): boolean {
  const words = (conversation.turns ?? [])
    .filter((turn) => turn.role === 'user')
    .reduce((sum, turn) => sum + turn.text.trim().split(/\s+/).filter(Boolean).length, 0);
  return (conversation.durationSecs ?? 0) >= MIN_CALL_SECS && words >= MIN_PARTICIPANT_WORDS;
}

export const participantTitle = (index: number) => `Participant ${String(index + 1).padStart(2, '0')}`;

/** Labels match the report: numbered by creation order among substantive calls only. */
export function participantTitles(interviews: { id: string; createdAt: Date; transcript: unknown }[]) {
  const counted = [...interviews]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .filter((call) => call.transcript && isSubstantive(call.transcript as FetchedConversation));
  return new Map(counted.map((call, index) => [call.id, participantTitle(index)]));
}

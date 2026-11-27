import type { FetchedConversation } from '../contract';

// Joke runs and dropped calls stay saved but are kept out of themes and the summary.
const MIN_CALL_SECS = 15;
const MIN_PARTICIPANT_WORDS = 10;

// ICU word breaks split Chinese, Japanese and Thai, which have no spaces, into dictionary words
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

export function countWords(text: string): number {
  let count = 0;
  for (const segment of words.segment(text)) if (segment.isWordLike) count++;
  return count;
}

export function isSubstantive(conversation: FetchedConversation): boolean {
  const participantWords = (conversation.turns ?? [])
    .filter((turn) => turn.role === 'user')
    .reduce((sum, turn) => sum + countWords(turn.text), 0);
  return (conversation.durationSecs ?? 0) >= MIN_CALL_SECS && participantWords >= MIN_PARTICIPANT_WORDS;
}

import type { FetchedConversation } from '../contract';

// Joke runs and dropped calls stay saved but are kept out of themes and the summary.
const MIN_CALL_SECS = 15;
const MIN_PARTICIPANT_WORDS = 10;

// scripts written without spaces; only these go through the segmenter, so "sign-up" stays one English word
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
// ICU word breaks split Chinese, Japanese and Thai into dictionary words
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

export function countWords(text: string): number {
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (UNSPACED_SCRIPT.test(token)) {
      for (const segment of words.segment(token)) if (segment.isWordLike) count++;
    } else if (LETTER_OR_DIGIT.test(token)) {
      count++;
    }
  }
  return count;
}

export function isSubstantive(conversation: FetchedConversation): boolean {
  const participantWords = (conversation.turns ?? [])
    .filter((turn) => turn.role === 'user')
    .reduce((sum, turn) => sum + countWords(turn.text), 0);
  return (conversation.durationSecs ?? 0) >= MIN_CALL_SECS && participantWords >= MIN_PARTICIPANT_WORDS;
}

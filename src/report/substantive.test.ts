import { describe, expect, it } from 'vitest';
import type { FetchedConversation } from '../contract';
import { countWords, isSubstantive } from './substantive';

function call(answers: string[], durationSecs = 60): FetchedConversation {
  return {
    conversationId: 'conv-1',
    status: 'done',
    durationSecs,
    turns: answers.flatMap((text, i) => [
      { role: 'agent' as const, text: 'What happened next?', timeInCallSecs: i * 10 },
      { role: 'user' as const, text, timeInCallSecs: i * 10 + 5 },
    ]),
  };
}

describe('junk-call filter', () => {
  it('keeps a 30-character Chinese answer', () => {
    const answer = '我平时用这个应用听歌，但是推荐的歌曲经常不太适合我的口味啊。';
    expect([...answer]).toHaveLength(30);
    expect(isSubstantive(call([answer]))).toBe(true);
  });

  it('keeps a short Japanese answer', () => {
    expect(isSubstantive(call(['普段は通勤中に音楽を聴いていますが、おすすめがあまり合いません。']))).toBe(true);
  });

  it('drops a 3-word English answer', () => {
    expect(isSubstantive(call(['yes ok sure']))).toBe(false);
  });

  it('drops a Chinese call that only checks the line', () => {
    expect(isSubstantive(call(['喂？喂？听得到吗？']))).toBe(false);
  });

  it('keeps the 10-word threshold for spaced languages', () => {
    expect(isSubstantive(call(['Uso la app cuando voy al trabajo en el']))).toBe(false);
    expect(isSubstantive(call(['Uso la app cuando voy al trabajo en el metro']))).toBe(true);
  });

  it('adds words across participant turns and ignores the agent', () => {
    expect(isSubstantive(call(['I use it on the bus', 'mostly for podcasts and news']))).toBe(true);
    expect(
      isSubstantive({ ...call(['ok']), turns: [{ role: 'agent', text: 'a b c d e f g h i j k', timeInCallSecs: 0 }] }),
    ).toBe(false);
  });

  it('drops calls under 15 seconds however much was said', () => {
    expect(isSubstantive(call(['I use it every day on the bus to work and back'], 14))).toBe(false);
  });

  it('counts mixed scripts and ignores punctuation', () => {
    expect(countWords('我用Spotify听歌')).toBeGreaterThanOrEqual(3);
    expect(countWords('... ?! -')).toBe(0);
    expect(countWords("I don't like the ads.")).toBe(5);
  });

  it('counts spaced words the same way whitespace splitting did', () => {
    expect(countWords('the sign-up flow is real-time, e-mail 10,000 U.S.')).toBe(8);
    expect(isSubstantive(call(['the sign-up flow is real-time, I like', 'e-mail']))).toBe(false);
  });
});

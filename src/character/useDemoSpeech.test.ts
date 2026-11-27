import { describe, expect, it } from 'vitest';
import { buildSpeechTimeline, sampleSpeechTimeline } from './useDemoSpeech';

describe('the text preview timeline', () => {
  it('keeps native UTF-16 character offsets and subtitle words aligned', () => {
    const timeline = buildSpeechTimeline('Hi 👋  there!');
    expect(timeline.words.map((word) => [word.text, word.charIndex])).toEqual([
      ['Hi', 0],
      ['👋', 3],
      ['there!', 7],
    ]);
    for (let i = 0; i < timeline.words.length; i++) {
      expect(sampleSpeechTimeline(timeline, timeline.words[i].start + 1).currentWord).toBe(i);
    }
  });
  it('gives punctuation a closed-mouth pause and leaves no hanging viseme', () => {
    const timeline = buildSpeechTimeline('Hello.');
    const pause = timeline.segments.find((segment) => segment.end - segment.start === 270)!;
    expect(sampleSpeechTimeline(timeline, pause.start + 100).mouthOpen).toBe(0);
    expect(sampleSpeechTimeline(timeline, timeline.duration)).toEqual({
      mouthOpen: 0,
      mouthShape: 'rest',
      currentWord: -1,
    });
  });
  it('stays bounded and deterministic for arbitrary text', () => {
    const text = 'Maybe you could tell me: what worked, and what didn’t?';
    const timeline = buildSpeechTimeline(text);
    expect(buildSpeechTimeline(text)).toEqual(timeline);
    for (let t = 0; t < timeline.duration; t += 7) {
      const frame = sampleSpeechTimeline(timeline, t);
      expect(frame.mouthOpen).toBeGreaterThanOrEqual(0);
      expect(frame.mouthOpen).toBeLessThanOrEqual(1);
      expect(frame.currentWord).toBeGreaterThanOrEqual(0);
      expect(frame.currentWord).toBeLessThan(timeline.words.length);
    }
  });
  it('handles empty input', () => {
    const timeline = buildSpeechTimeline(' \n ');
    expect(timeline.duration).toBe(0);
    expect(sampleSpeechTimeline(timeline, 0).currentWord).toBe(-1);
  });
});

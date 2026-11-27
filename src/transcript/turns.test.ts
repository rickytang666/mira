import { describe, expect, it } from 'vitest';
import { participantTitles } from '../report/participants';
import { type InterviewView, lineAsQuote, parseAt, transcriptHref, transcriptLines, turnAt } from './turns';
import { playable } from '../report/audioPlayer';

const conversation = {
  conversationId: 'c1',
  status: 'done',
  durationSecs: 60,
  turns: [
    { role: 'agent', text: 'Hi, what brought you here?', timeInCallSecs: 0 },
    { role: 'user', text: ' I got stuck connecting my API key. ', timeInCallSecs: 4.5 },
    { role: 'agent', text: 'Tell me more.', timeInCallSecs: 12 },
    { role: 'user', text: 'The docs never said where it goes.', timeInCallSecs: 15 },
  ],
};

describe('transcript turns', () => {
  it('maps roles to speakers and ends each turn where the next begins', () => {
    const lines = transcriptLines(conversation);
    expect(lines.map((l) => [l.speaker, l.startSec, l.endSec])).toEqual([
      ['mira', 0, 4.5],
      ['participant', 4.5, 12],
      ['mira', 12, 15],
      ['participant', 15, 60],
    ]);
    expect(lines[1].text).toBe('I got stuck connecting my API key.');
  });

  it('drops empty turns, keeps bad timestamps untimed, and skips past same-second turns', () => {
    const lines = transcriptLines({
      durationSecs: 10,
      turns: [
        { role: 'agent', text: 'Hello', timeInCallSecs: 2 },
        { role: 'user', text: '   ', timeInCallSecs: 3 },
        { role: 'user', text: 'Same second', timeInCallSecs: 2 },
        { role: 'user', text: 'No time', timeInCallSecs: -1 },
        { role: 'user', text: 'Last', timeInCallSecs: 10 },
        null,
      ],
    });
    expect(lines.map((l) => [l.text, l.startSec, l.endSec])).toEqual([
      ['Hello', 2, 10],
      ['Same second', 2, 10],
      ['No time', null, null],
      ['Last', 10, null],
    ]);
  });

  it('returns no turns for a missing or malformed transcript', () => {
    expect(transcriptLines(null)).toEqual([]);
    expect(transcriptLines({ turns: 'nope' })).toEqual([]);
  });
});

describe('quote to turn', () => {
  const lines = transcriptLines(conversation);
  it('reads the start second from the link', () => {
    expect(parseAt('?at=4.5')).toBe(4.5);
    expect(parseAt('?at=')).toBeNull();
    expect(parseAt('?at=-3')).toBeNull();
    expect(parseAt('?at=abc')).toBeNull();
    expect(parseAt('')).toBeNull();
  });
  it('prefers the participant turn starting at the quote second', () => {
    expect(turnAt(lines, 4.5)).toBe(1);
    expect(turnAt(lines, 15)).toBe(3);
  });
  it('falls back to the turn playing at that second', () => {
    expect(turnAt(lines, 13)).toBe(2);
    expect(turnAt(lines, 0)).toBe(0);
    expect(turnAt(lines, null)).toBe(-1);
    expect(turnAt([], 5)).toBe(-1);
  });
  it('builds the report link with the quote start', () => {
    expect(transcriptHref('s1', 'i1', 4.5)).toBe('/study/s1/interviews/i1?at=4.5');
    expect(transcriptHref('s1', 'i1', null)).toBe('/study/s1/interviews/i1');
    const [line] = transcriptLines(conversation).slice(1);
    expect(turnAt(lines, parseAt(new URL(transcriptHref('s1', 'i1', line.startSec), 'http://x').search))).toBe(1);
  });
});

describe('turn playback', () => {
  const view = {
    interviewId: 'i1',
    participantLabel: 'Participant 01',
    audioUrl: '/api/interviews/i1/audio',
  } as InterviewView;
  it('plays a timed turn from its start to its end', () => {
    const quote = lineAsQuote(transcriptLines(conversation)[1], view);
    expect(quote).toMatchObject({ startSec: 4.5, endSec: 12, audioUrl: '/api/interviews/i1/audio' });
    expect(playable(quote)).toBe(true);
  });
  it('disables an untimed turn or a call without audio', () => {
    const untimed = { id: 't', speaker: 'participant' as const, text: 'x', startSec: null, endSec: null };
    expect(playable(lineAsQuote(untimed, view))).toBe(false);
    expect(playable(lineAsQuote(transcriptLines(conversation)[1], { ...view, audioUrl: null }))).toBe(false);
  });
});

describe('participant labels', () => {
  const long = {
    durationSecs: 30,
    turns: [{ role: 'user', text: 'one two three four five six seven eight nine ten' }],
  };
  it('numbers substantive calls by creation order, matching the report', () => {
    const titles = participantTitles([
      { id: 'b', createdAt: new Date(2), transcript: long },
      { id: 'short', createdAt: new Date(1), transcript: { durationSecs: 5, turns: [] } },
      { id: 'a', createdAt: new Date(0), transcript: long },
      { id: 'pending', createdAt: new Date(3), transcript: null },
    ]);
    expect(Object.fromEntries(titles)).toEqual({ a: 'Participant 01', b: 'Participant 02' });
  });
});

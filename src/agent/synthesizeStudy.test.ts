import { describe, expect, it, vi } from 'vitest';
import type { FetchedConversation } from '../contract';
import type { JsonRequest } from './llm';
import type { StudyResearchContext } from './studyContext';
import { compactTranscript } from './synthesizeReport';
import { type StudyCall, synthesizeStudy } from './synthesizeStudy';
import { parseTranscript } from './transcript';

const study: StudyResearchContext = {
  id: 's1',
  productName: 'Spotify',
  productUrl: 'https://spotify.com',
  goal: 'Learn how people find new music',
  audience: 'Daily listeners',
  context: 'A music streaming app.',
  questions: [{ id: 'q1', text: 'How do you find new music?', followUp: true }],
};

// Speech end to end at about 16 characters a second: a 5 s question, then a 10 s answer, six times.
function ninetySecondCall(n: number): FetchedConversation {
  const turns: FetchedConversation['turns'] = [];
  for (let t = 0; t < 90; t += 15) {
    turns.push({
      role: 'agent',
      text: 'Thanks, that helps. What do you usually do next to find something new to hear?',
      timeInCallSecs: t,
    });
    turns.push({
      role: 'user',
      text: 'Honestly I mostly rely on friends sending me songs, or I look up what played in a coffee shop, since the app keeps playing artists I already know well.',
      timeInCallSecs: t + 5,
    });
  }
  return { conversationId: `c${n}`, status: 'done', durationSecs: 90, turns };
}

const call = (n: number, conversation = ninetySecondCall(n)): StudyCall => ({
  interviewId: `i${n}`,
  title: `Participant ${String(n).padStart(2, '0')}`,
  conversation,
  questions: ['How do you find new music?'],
  audioUrl: `/audio/i${n}`,
});

function answerCiting(callIds: string[]) {
  return {
    summary: 'Participants find music outside the app.',
    themes: [
      {
        label: 'Finds music outside the app',
        summary: 'Friends and public places beat recommendations.',
        evidence: callIds.map((callId) => ({ callId, turnId: 'turn-1' })),
      },
    ],
    recommendations: [{ text: 'Test a share-from-friends shelf.', themeLabels: ['Finds music outside the app'] }],
    questionFindings: [
      {
        questionIndex: 0,
        status: 'answered',
        finding: 'Mostly outside the app.',
        themeLabels: ['Finds music outside the app'],
      },
    ],
  };
}

type SentCall = { id: string; transcript: string };
const sentCalls = (request: JsonRequest) => (request.input as { calls: SentCall[] }).calls;

describe('study report input', () => {
  it('keeps 30 calls of 90 s under the 100,000 character guard', async () => {
    const calls = Array.from({ length: 30 }, (_, i) => call(i + 1));
    const generateJson = vi.fn(async (_request: JsonRequest) => answerCiting(calls.map((c) => c.interviewId)));
    const report = await synthesizeStudy(study, calls, { generateJson });
    const sent = sentCalls(generateJson.mock.calls[0][0]);
    expect(sent).toHaveLength(30);
    const compact = sent.reduce((sum, c) => sum + c.transcript.length, 0);
    const raw = calls.reduce((sum, c) => sum + JSON.stringify(c.conversation).length, 0);
    expect(compact).toBeLessThan(100_000);
    expect(compact).toBeLessThan(raw * 0.8);
    expect(report.interviewsDone).toBe(30);
    expect(report.themes[0].count).toBe(30);
  });

  it('sends plain text answers after their question, without the conversation wrapper', async () => {
    const generateJson = vi.fn(async (_request: JsonRequest) => answerCiting(['i1']));
    const report = await synthesizeStudy(study, [call(1)], { generateJson });
    const [sent] = sentCalls(generateJson.mock.calls[0][0]);
    expect(sent.transcript.split('\n').slice(0, 2)).toEqual([
      'Mira: Thanks, that helps. What do you usually do next to find something new to hear?',
      expect.stringMatching(/^\[turn-1 0:05\] Honestly I mostly rely on friends/),
    ]);
    expect(sent.transcript).not.toMatch(/conversationId|timeInCallSecs|durationSecs|"role"/);
    expect(report.themes[0].quotes[0]).toMatchObject({ startSec: 5, endSec: 15, audioUrl: '/audio/i1' });
  });

  it('skips a call with bad timestamps and still reports the others', async () => {
    const broken = ninetySecondCall(2);
    broken.turns[3].timeInCallSecs = 1; // earlier than the turn before it
    const pastEnd = ninetySecondCall(3);
    pastEnd.durationSecs = 20;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const generateJson = vi.fn(async (_request: JsonRequest) => answerCiting(['i1', 'i4']));
    const report = await synthesizeStudy(study, [call(1), call(2, broken), call(3, pastEnd), call(4)], {
      generateJson,
    });
    expect(sentCalls(generateJson.mock.calls[0][0]).map((c) => c.id)).toEqual(['i1', 'i4']);
    expect(report.interviewsDone).toBe(2);
    expect(report.themes[0].quotes.map((q) => q.interviewId)).toEqual(['i1', 'i4']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('skipping interview i2');
    warn.mockRestore();
  });

  it('returns an empty report without calling the model when no call is readable', async () => {
    const broken = ninetySecondCall(1);
    broken.turns[3].timeInCallSecs = 1;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const generateJson = vi.fn();
    const report = await synthesizeStudy(study, [call(1, broken)], { generateJson });
    expect(generateJson).not.toHaveBeenCalled();
    expect(report).toMatchObject({ interviewsDone: 0, themes: [] });
    warn.mockRestore();
  });
});

describe('compact transcript', () => {
  it('joins back-to-back questions, keeps untimed answers, and drops a closing question', () => {
    const turns = parseTranscript(
      'Interviewer: Hi there.\nInterviewer: What did you try first?\nParticipant: The search bar.\nParticipant: Then I gave up.\nInterviewer: Thanks, bye!',
    );
    expect(compactTranscript(turns)).toBe(
      'Mira: Hi there. What did you try first?\n[turn-2] The search bar.\n[turn-3] Then I gave up.',
    );
  });
  it('keeps only the end of a long lead-in, where the question is', () => {
    const lead = 'You said a lot there. '.repeat(20);
    const turns = parseTranscript(`Interviewer: ${lead}So what would you change?\nParticipant: The home page.`);
    const [question] = compactTranscript(turns).split('\n');
    expect(question.length).toBeLessThan(260);
    expect(question).toMatch(/^Mira: …You said a lot there\..*So what would you change\?$/);
  });
});

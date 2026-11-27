import { describe, expect, it, vi } from 'vitest';
import type { GenerateReportInput } from '../contract';
import { synthesizeReport } from './synthesizeReport';
import { fromReportView } from '../report/fromReportView';
import { playable } from '../report/audioPlayer';

const input: GenerateReportInput = {
  studyId: 'study-1',
  productName: 'Fieldwork',
  goal: 'Understand onboarding',
  calls: [
    {
      id: 'call-1',
      title: 'Alex',
      transcript:
        '[00:00] Interviewer: What happened?\n[00:05] Participant: I could not find the API key settings.\n[00:14] Interviewer: Thanks.',
    },
    {
      id: 'call-2',
      title: 'Sam',
      transcript:
        '[00:00] Interviewer: What happened?\n[00:08] Participant: I needed an example of the API key permissions.\n[00:17] Interviewer: Thanks.',
    },
  ],
};
const answer = () => ({
  summary: 'Both participants had trouble configuring API keys.',
  themes: [
    {
      label: 'Unclear API key setup',
      summary: 'Settings and permissions were hard to understand.',
      evidence: [
        { callId: 'call-1', turnId: 'turn-1' },
        { callId: 'call-2', turnId: 'turn-1' },
      ],
    },
  ],
  recommendations: [
    { text: 'Test a permissions example in the setup screen.', themeLabels: ['Unclear API key setup'] },
  ],
});

describe('multi-call report synthesis', () => {
  it('includes every completed call beyond the old ten-call ceiling', async () => {
    const calls = Array.from({ length: 12 }, (_, i) => ({ ...input.calls[0], id: `call-${i}` }));
    const raw = answer();
    raw.themes[0].evidence = calls.map((call) => ({ callId: call.id, turnId: 'turn-1' }));
    const result = await synthesizeReport({ ...input, calls }, { generateJson: async () => raw });
    expect(result.interviewsDone).toBe(12);
    expect(result.themes[0].count).toBe(12);
  });
  it('requires every founder question to be addressed and repairs findings without supporting evidence', async () => {
    const request = { ...input, questions: ['What blocked setup?', 'Would you pay for it?'] };
    const raw = {
      ...answer(),
      questionFindings: [
        { questionIndex: 1, status: 'unanswered', finding: 'Willingness to pay was not discussed.', themeLabels: [] },
        {
          questionIndex: 0,
          status: 'answered',
          finding: 'Participants struggled with API key setup.',
          themeLabels: ['Unclear API key setup'],
        },
      ],
    };
    const report = await synthesizeReport(request, { generateJson: async () => raw });
    expect(report.questionFindings?.map((f) => f.question)).toEqual(request.questions);
    expect(report.questionFindings?.[1]).toMatchObject({ status: 'unanswered', themeIds: [] });
    raw.questionFindings[1].themeLabels = ['Imaginary finding'];
    const repaired = await synthesizeReport(request, { generateJson: async () => raw });
    expect(repaired.questionFindings?.[0]).toMatchObject({ status: 'unanswered', themeIds: [] });
    await expect(synthesizeReport(request, { generateJson: async () => answer() })).rejects.toThrow(
      'each research question',
    );
  });
  it('builds an evidence-backed report with exact quotes, times, and distinct-call counts', async () => {
    const result = await synthesizeReport(input, { generateJson: async () => answer() });
    expect(result.interviewsDone).toBe(2);
    expect(result.summary).toContain('Both participants');
    expect(result.themes[0].count).toBe(2);
    expect(result.themes[0].quotes[0]).toMatchObject({
      text: 'I could not find the API key settings.',
      startSec: 5,
      endSec: 14,
      interviewId: 'call-1',
      participantLabel: 'Alex',
    });
    expect(result.recommendations?.[0].themeIds).toEqual([result.themes[0].id]);
  });
  it('asks for English labels and keeps non-English quotes verbatim', async () => {
    const spanish = 'No encontré la configuración de la clave de API, tuve que preguntar en Discord.';
    const raw = answer();
    raw.themes[0].evidence = [{ callId: 'es', turnId: 'turn-1' }];
    const generateJson = vi.fn(async (_request: { system: string }) => raw);
    const report = await synthesizeReport(
      {
        ...input,
        calls: [
          {
            id: 'es',
            title: 'Lucía',
            transcript: `[00:00] Interviewer: ¿Qué pasó?\n[00:04] Participant: ${spanish}\n[00:12] Interviewer: Gracias.`,
          },
        ],
      },
      { generateJson },
    );
    expect(generateJson.mock.calls[0][0].system).toMatch(/theme labels.*in English/);
    expect(generateJson.mock.calls[0][0].system).toMatch(/verbatim in their original language/);
    expect(report.themes[0].label).toBe('Unclear API key setup');
    expect(report.themes[0].quotes[0]).toMatchObject({ text: spanish, startSec: 4, endSec: 12 });
  });
  it('does not inflate counts or duplicate quotes for repeated evidence', async () => {
    const raw = answer();
    raw.themes[0].evidence.push(raw.themes[0].evidence[0]);
    const result = await synthesizeReport(input, { generateJson: async () => raw });
    expect(result.themes[0].count).toBe(2);
    expect(result.themes[0].quotes).toHaveLength(2);
  });
  it.each([
    { callId: 'call-1', turnId: 'turn-0' },
    { callId: 'made-up', turnId: 'turn-1' },
  ])('drops unsupported evidence %j', async (evidence) => {
    const raw = answer();
    raw.themes[0].evidence = [evidence, { callId: 'call-2', turnId: 'turn-1' }];
    const partial = await synthesizeReport(input, { generateJson: async () => raw });
    expect(partial.themes[0].count).toBe(1);
    expect(partial.themes[0].quotes.map((q) => q.interviewId)).toEqual(['call-2']);
    raw.themes[0].evidence = [evidence];
    const unsupported = await synthesizeReport(input, { generateJson: async () => raw });
    expect(unsupported.themes).toEqual([]);
    expect(unsupported.recommendations).toEqual([]);
  });
  it('keeps untimed quotes readable but never enables invented playback', async () => {
    const raw = answer();
    raw.themes[0].evidence = [{ callId: 'plain', turnId: 'turn-0' }];
    const report = await synthesizeReport(
      {
        ...input,
        calls: [
          { id: 'plain', title: 'Plain text', transcript: 'Participant: I could not find the API key settings.' },
        ],
      },
      { generateJson: async () => raw },
    );
    const quote = fromReportView(report).themes[0].quotes[0];
    expect(quote.startSec).toBeNull();
    expect(playable({ ...quote, audioUrl: '/audio/file.mp3' })).toBe(false);
  });
  it('drops recommendations that are not connected to a finding', async () => {
    const raw = answer();
    raw.recommendations[0].themeLabels = ['Imaginary finding'];
    const result = await synthesizeReport(input, { generateJson: async () => raw });
    expect(result.themes).toHaveLength(1);
    expect(result.recommendations).toEqual([]);
  });
  it('matches theme labels regardless of case and spacing', async () => {
    const raw = {
      ...answer(),
      themes: [answer().themes[0], { ...answer().themes[0], label: 'unclear  API key SETUP' }],
      recommendations: [{ text: 'Test a permissions example.', themeLabels: ['  UNCLEAR api   key setup '] }],
      questionFindings: [
        { questionIndex: 0, status: 'answered', finding: 'Setup was hard.', themeLabels: ['unclear api key setup'] },
      ],
    };
    const result = await synthesizeReport(
      { ...input, questions: ['What blocked setup?'] },
      { generateJson: async () => raw },
    );
    expect(result.themes.map((theme) => theme.label)).toEqual(['Unclear API key setup']);
    expect(result.recommendations?.[0].themeIds).toEqual([result.themes[0].id]);
    expect(result.questionFindings?.[0]).toMatchObject({ status: 'answered', themeIds: [result.themes[0].id] });
  });
  it('rejects duplicate calls before sending data to the provider', async () => {
    const generateJson = vi.fn();
    await expect(
      synthesizeReport({ ...input, calls: [input.calls[0], input.calls[0]] }, { generateJson }),
    ).rejects.toThrow('unique ID');
    expect(generateJson).not.toHaveBeenCalled();
  });
  it('does not generate a fictional report for interviewer-only transcripts', async () => {
    const generateJson = vi.fn();
    const result = await synthesizeReport(
      { ...input, calls: [{ id: 'no-user', title: 'Empty call', transcript: 'Interviewer: Is anyone there?' }] },
      { generateJson },
    );
    expect(result.themes).toEqual([]);
    expect(result.summary).toContain('no participant responses');
    expect(generateJson).not.toHaveBeenCalled();
  });
  it('allows an honest no-findings result for irrelevant participant text', async () => {
    const result = await synthesizeReport(
      { ...input, calls: [{ id: 'bye', title: 'Short call', transcript: 'Participant: Bye.' }] },
      { generateJson: async () => ({ summary: 'No product feedback was captured.', themes: [], recommendations: [] }) },
    );
    expect(result.themes).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });
});

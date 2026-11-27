import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTranscript } from './transcript';
import { suggestQuestions } from './suggestQuestions';
import { sampleTranscript } from '../report/fixtures';
import { generateJson, type JsonRequest } from './llm';

describe('transcript normalization', () => {
  it('preserves speaker roles and derives end times from the next turn', () => {
    const turns = parseTranscript(sampleTranscript, 45);
    expect(turns[1]).toMatchObject({
      role: 'user',
      startSec: 5,
      endSec: 14,
      text: 'I got stuck connecting my API key. I could not tell which permissions it needed.',
    });
    expect(turns.at(-1)?.endSec).toBe(45);
  });
  it('supports ElevenLabs JSON and skips tool-only turns', () => {
    const turns = parseTranscript(
      JSON.stringify({
        metadata: { call_duration_secs: 20 },
        transcript: [
          { role: 'agent', message: null, time_in_call_secs: 0 },
          { role: 'user', message: 'It was slow.', time_in_call_secs: 5 },
        ],
      }),
    );
    expect(turns).toEqual([{ id: 'turn-1', role: 'user', text: 'It was slow.', startSec: 5, endSec: 20 }]);
  });
  it('never fabricates timestamps for pasted plain text or multiline turns', () => {
    expect(parseTranscript('Participant: I could not find it.\nI tried twice.')[0]).toMatchObject({
      startSec: null,
      endSec: null,
      text: 'I could not find it.\nI tried twice.',
    });
  });
  it('accepts the published FetchedConversation shape when pasted as JSON', () => {
    const result = parseTranscript(
      JSON.stringify({
        conversationId: 'one',
        status: 'done',
        durationSecs: 15,
        turns: [{ role: 'user', text: 'It was confusing.', timeInCallSecs: 4 }],
      }),
    );
    expect(result[0]).toMatchObject({ role: 'user', startSec: 4, endSec: 15 });
  });
  it('rejects invalid, out-of-order, and duplicate-ID turns', () => {
    expect(() => parseTranscript('[00:90] User: hi')).toThrow('timestamp');
    expect(() => parseTranscript('[00:10] User: hi\n[00:05] Agent: hi')).toThrow('chronological');
    expect(() => parseTranscript('[00:10] User: hi', 5)).toThrow('duration');
    expect(() => parseTranscript('User: hi\rthere')).toThrow('could not be read');
    expect(() =>
      parseTranscript(
        JSON.stringify([
          { id: 'a', role: 'user', text: 'one' },
          { id: 'a', role: 'user', text: 'two' },
        ]),
      ),
    ).toThrow('unique');
  });
});

describe('LLM transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends structured context and parses the JSON answer', async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] })),
    );
    vi.stubGlobal('fetch', request);
    expect(
      await generateJson({ system: 'Return JSON.', input: { context: 'test' } }, { apiKey: 'test-secret' }),
    ).toEqual({ ok: true });
    expect(request.mock.calls[0]).toMatchObject([
      'https://openrouter.ai/api/v1/chat/completions',
      { headers: { Authorization: 'Bearer test-secret' } },
    ]);
  });
  it('rejects truncated output and hides provider error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] })),
    );
    await expect(generateJson({ system: '', input: {} }, { apiKey: 'test' })).rejects.toThrow('complete answer');
    vi.stubGlobal('fetch', async () => new Response('private provider payload', { status: 401 }));
    await expect(generateJson({ system: '', input: {} }, { apiKey: 'test' })).rejects.toThrow('HTTP 401');
  });
});

describe('question generation', () => {
  const context = {
    productName: 'Fieldwork',
    goal: 'Learn about onboarding',
    audience: 'New users',
    context: 'Interviews users and generates reports.',
  };
  it('passes product context and goal and returns editable questions', async () => {
    const generateJson = vi.fn(async (_request: JsonRequest) => ({
      questions: ['What happened last time?', 'Where did you get stuck?', 'What did you try next?'],
    }));
    const { questions } = await suggestQuestions(context, { generateJson });
    expect(questions).toHaveLength(3);
    expect(questions.every((q) => typeof q === 'string')).toBe(true);
    expect(generateJson.mock.calls[0]?.[0]).toMatchObject({ input: context });
  });
  it('rejects missing context and too few questions', async () => {
    await expect(suggestQuestions({ ...context, context: '' })).rejects.toThrow('missing');
    await expect(suggestQuestions(context, { generateJson: async () => ({ questions: [] }) })).rejects.toThrow(
      '3 to 5',
    );
  });
  it('drops duplicate questions and trims extras to 5', async () => {
    expect(
      await suggestQuestions(context, {
        generateJson: async () => ({ questions: ['Same?', 'same', 'Other?', 'Third?'] }),
      }),
    ).toEqual({ questions: ['Same?', 'Other?', 'Third?'] });
    const many = ['One?', 'Two?', 'Three?', 'Four?', 'Five?', 'Six?'];
    expect(await suggestQuestions(context, { generateJson: async () => ({ questions: many }) })).toEqual({
      questions: many.slice(0, 5),
    });
  });
});

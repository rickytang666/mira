import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTranscript } from './transcript';
import { analyzeTranscript, synthesizeInterview } from './synthesizeInterview';
import { suggestQuestions } from './suggestQuestions';
import { createElevenLabsClient, ElevenLabsError } from './elevenlabsClient';
import { synthesizeLocally } from './localSynthesis';
import { sampleTranscript } from '../report/fixtures';
import { generateJson, type JsonRequest } from './llm';

describe('transcript normalization', () => {
  it('preserves speaker roles and derives end times from the next turn', () => {
    const turns = parseTranscript(sampleTranscript, 45);
    expect(turns[1]).toMatchObject({ role: 'user', startSec: 5, endSec: 14, text: 'I got stuck connecting my API key. I could not tell which permissions it needed.' });
    expect(turns.at(-1)?.endSec).toBe(45);
  });
  it('supports ElevenLabs JSON and skips tool-only turns', () => {
    const turns = parseTranscript(JSON.stringify({ metadata: { call_duration_secs: 20 }, transcript: [{ role: 'agent', message: null, time_in_call_secs: 0 }, { role: 'user', message: 'It was slow.', time_in_call_secs: 5 }] }));
    expect(turns).toEqual([{ id: 'turn-1', role: 'user', text: 'It was slow.', startSec: 5, endSec: 20 }]);
  });
  it('never fabricates timestamps for pasted plain text or multiline turns', () => {
    expect(parseTranscript('Participant: I could not find it.\nI tried twice.')[0]).toMatchObject({ startSec: null, endSec: null, text: 'I could not find it.\nI tried twice.' });
  });
  it('accepts the published FetchedConversation shape when pasted as JSON', () => {
    const result = parseTranscript(JSON.stringify({ conversationId: 'one', status: 'done', durationSecs: 15, turns: [{ role: 'user', text: 'It was confusing.', timeInCallSecs: 4 }] }));
    expect(result[0]).toMatchObject({ role: 'user', startSec: 4, endSec: 15 });
  });
  it('rejects invalid, out-of-order, and duplicate-ID turns', () => {
    expect(() => parseTranscript('[00:90] User: hi')).toThrow('timestamp');
    expect(() => parseTranscript('[00:10] User: hi\n[00:05] Agent: hi')).toThrow('chronological');
    expect(() => parseTranscript('[00:10] User: hi', 5)).toThrow('duration');
    expect(() => parseTranscript(JSON.stringify([{ id: 'a', role: 'user', text: 'one' }, { id: 'a', role: 'user', text: 'two' }]))).toThrow('unique');
  });
});

describe('synthesis evidence', () => {
  it('copies exact participant text and original timestamps, ignoring generated quote fields', async () => {
    const output = await analyzeTranscript({ transcript: sampleTranscript }, { generateJson: async () => ({ summary: 'Setup was confusing.', themes: [{ label: 'Setup', summary: 'The permissions were unclear.', turnIds: ['turn-1'], quotes: [{ text: 'invented', startSec: 99 }] }] }) });
    expect(output.themes[0].quotes[0]).toEqual({ turnId: 'turn-1', text: 'I got stuck connecting my API key. I could not tell which permissions it needed.', startSec: 5, endSec: 14 });
  });
  it.each(['turn-0', 'nonexistent'])('rejects unsupported evidence %s', async turnId => {
    await expect(analyzeTranscript({ transcript: sampleTranscript }, { generateJson: async () => ({ summary: 'x', themes: [{ label: 'x', summary: 'x', turnIds: [turnId] }] }) })).rejects.toThrow('non-participant');
  });
  it('does not call a model when there are no participant responses', async () => {
    const generateJson = vi.fn();
    expect((await analyzeTranscript({ transcript: 'Interviewer: Hello?' }, { generateJson })).themes).toEqual([]);
    expect(generateJson).not.toHaveBeenCalled();
    expect((await analyzeTranscript({ transcript: [] }, { generateJson })).themes).toEqual([]);
  });
  it('can return zero themes for irrelevant content', async () => {
    expect((await analyzeTranscript({ transcript: 'User: Thanks, bye.' }, { generateJson: async () => ({ summary: 'No relevant feedback.', themes: [] }) })).themes).toEqual([]);
  });
  it('exposes the offline preview honestly and only quotes participants', () => {
    const result = synthesizeLocally({ transcript: sampleTranscript });
    expect(result.method).toBe('local');
    expect(result.themes.map(t => t.label)).toContain('Setup and onboarding');
    expect(result.themes.flatMap(t => t.quotes).every(q => parseTranscript(sampleTranscript).find(t => t.id === q.turnId)?.role === 'user')).toBe(true);
  });
});

describe('LLM transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends structured context and parses the JSON answer', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] })));
    vi.stubGlobal('fetch', request);
    expect(await generateJson({ system: 'Return JSON.', input: { context: 'test' } }, { apiKey: 'test-secret' })).toEqual({ ok: true });
    expect(request.mock.calls[0]).toMatchObject(['https://openrouter.ai/api/v1/chat/completions', { headers: { Authorization: 'Bearer test-secret' } }]);
  });
  it('rejects truncated output and hides provider error bodies', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] })));
    await expect(generateJson({ system: '', input: {} }, { apiKey: 'test' })).rejects.toThrow('complete answer');
    vi.stubGlobal('fetch', async () => new Response('private provider payload', { status: 401 }));
    await expect(generateJson({ system: '', input: {} }, { apiKey: 'test' })).rejects.toThrow('HTTP 401');
  });
});

describe('question generation', () => {
  const context = { productName: 'Fieldwork', goal: 'Learn about onboarding', audience: 'New users', context: 'Interviews users and generates reports.' };
  it('passes product context and goal and returns editable questions', async () => {
    const generateJson = vi.fn(async (_request: JsonRequest) => ({ questions: ['What happened last time?', 'Where did you get stuck?', 'What did you try next?'] }));
    const { questions } = await suggestQuestions(context, { generateJson });
    expect(questions).toHaveLength(3);
    expect(questions.every(q => typeof q === 'string')).toBe(true);
    expect(generateJson.mock.calls[0]?.[0]).toMatchObject({ input: context });
  });
  it('rejects missing context and duplicate or insufficient questions', async () => {
    await expect(suggestQuestions({ ...context, context: '' })).rejects.toThrow('missing');
    await expect(suggestQuestions(context, { generateJson: async () => ({ questions: [] }) })).rejects.toThrow('3 to 5');
    await expect(suggestQuestions(context, { generateJson: async () => ({ questions: ['Same?', 'Same?', 'Other?'] }) })).rejects.toThrow('duplicate');
  });
});

describe('published synthesis contract', () => {
  const input = { goal: 'Understand setup', questions: ['Where did you get stuck?'], existingThemeLabels: ['Setup'], turns: [{ role: 'user' as const, text: 'I could not understand the permissions.', timeInCallSecs: 4 }] };
  const generate = async () => ({ summary: 'Setup was unclear.', themes: [{ label: 'Setup', summary: 'Permissions were unclear.', turnIds: ['turn-0'] }] });
  it('accepts timeInCallSecs and returns precisely the shared output shape', async () => {
    const generateJson = vi.fn(async (_request: JsonRequest) => generate());
    expect(await synthesizeInterview(input, { durationSecs: 12, generateJson })).toEqual({ themes: [{ label: 'Setup', quotes: [{ text: input.turns[0].text, startSec: 4, endSec: 12 }] }] });
    expect(generateJson.mock.calls[0]?.[0]).toMatchObject({ input: { questions: input.questions, existingThemes: [{ label: 'Setup', summary: '' }] } });
  });
  it('does not invent the end of the final turn when duration is missing', async () => {
    await expect(synthesizeInterview(input, { generateJson: generate })).rejects.toThrow('durationSecs');
  });
  it('uses the next turn boundary without needing recording duration', async () => {
    const result = await synthesizeInterview({ ...input, turns: [...input.turns, { role: 'agent', text: 'Thank you.', timeInCallSecs: 10 }] }, { generateJson: generate });
    expect(result.themes[0].quotes[0].endSec).toBe(10);
  });
});

describe('ElevenLabs server adapter', () => {
  it('authenticates requests and normalizes completed transcripts', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ conversation_id: 'conv_1', status: 'done', has_audio: true, metadata: { call_duration_secs: 12 }, transcript: [{ role: 'user', message: 'Hello', time_in_call_secs: 3 }] })));
    const result = await createElevenLabsClient({ apiKey: 'test-key', fetch: request }).getTranscript('conv_1');
    expect(result.transcript[0]).toMatchObject({ startSec: 3, endSec: 12 });
    expect(request.mock.calls[0]).toMatchObject(['https://api.elevenlabs.io/v1/convai/conversations/conv_1', { headers: { 'xi-api-key': 'test-key' } }]);
  });
  it.each([['processing', true], ['failed', false]])('classifies %s correctly', async (status, retryable) => {
    const client = createElevenLabsClient({ apiKey: 'test', fetch: async () => new Response(JSON.stringify({ status })) });
    await expect(client.getTranscript('conv_1')).rejects.toMatchObject({ retryable });
  });
  it.each([[401, false], [404, true], [429, true], [503, true]])('classifies HTTP %s correctly', async (status, retryable) => {
    const client = createElevenLabsClient({ apiKey: 'test', fetch: async () => new Response('', { status, headers: { 'retry-after': '8' } }) });
    await expect(client.getTranscript('conv_1')).rejects.toMatchObject({ status, retryable, retryAfterSec: 8 });
  });
  it('returns audio bytes without returning the API key and rejects JSON masquerading as audio', async () => {
    const client = createElevenLabsClient({ apiKey: 'test', fetch: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }) });
    expect(new Uint8Array(await (await client.getAudio('conv_1')).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const broken = createElevenLabsClient({ apiKey: 'test', fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) });
    await expect(broken.getAudio('conv_1')).rejects.toBeInstanceOf(ElevenLabsError);
  });
});

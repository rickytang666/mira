import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateJson } from './llm';

const prompt = { system: 'Return JSON with questions.', input: { goal: 'Understand setup' } };
const success = () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"questions":["What happened?"]}' } }] }));

describe('OpenRouter configuration and failures', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('uses server credentials, defaults to free routing, and requires JSON support', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');
    vi.stubEnv('OPENROUTER_MODEL', '');
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => success());
    vi.stubGlobal('fetch', fetch);
    await expect(generateJson(prompt)).resolves.toEqual({ questions: ['What happened?'] });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request.headers).toMatchObject({ Authorization: 'Bearer test-openrouter-key' });
    expect(JSON.parse(request.body as string)).toMatchObject({ model: 'openrouter/free', response_format: { type: 'json_object' }, provider: { require_parameters: true }, messages: [{ role: 'system' }, { role: 'user', content: JSON.stringify(prompt.input) }] });
  });

  it('honors a configured model and explicit server overrides', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'env-key');
    vi.stubEnv('OPENROUTER_MODEL', 'vendor/configured-model');
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => success());
    vi.stubGlobal('fetch', fetch);
    await generateJson(prompt);
    expect(JSON.parse(fetch.mock.calls[0][1].body as string).model).toBe('vendor/configured-model');
    await generateJson(prompt, { apiKey: 'override-key', model: 'vendor/other-model' });
    expect(fetch.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer override-key' });
    expect(JSON.parse(fetch.mock.calls[1][1].body as string).model).toBe('vendor/other-model');
  });

  it('fails before fetching without a key and does not reuse an OpenAI credential', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', ' ');
    vi.stubEnv('OPENAI_API_KEY', 'unrelated-key');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(generateJson(prompt)).rejects.toThrow('OPENROUTER_API_KEY in .env.server');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[401, 'OPENROUTER_API_KEY'], [402, 'credits'], [429, 'rate limited'], [503, 'retry']])('explains HTTP %i without disclosing the provider payload', async (status, advice) => {
    vi.stubGlobal('fetch', async () => new Response('PRIVATE TRANSCRIPT', { status }));
    const error = await generateJson(prompt, { apiKey: 'test-key' }).catch(error => error as Error);
    if (!(error instanceof Error)) throw new Error('Expected the request to fail.');
    expect(error.message).toContain(advice);
    expect(error.message).not.toContain('PRIVATE');
  });

  it('rejects in-band provider errors and malformed model JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 429, message: 'PRIVATE TRANSCRIPT' } })));
    await expect(generateJson(prompt, { apiKey: 'test-key' })).rejects.toThrow('rate limited');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] })));
    await expect(generateJson(prompt, { apiKey: 'test-key' })).rejects.toThrow('invalid JSON');
  });
});

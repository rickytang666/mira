import { describe, expect, it, vi } from 'vitest';
import { ADDITIONAL_LANGUAGES, readAgentTexts } from '../agent/config.ts';
import { describeSetupError, setupAgent } from './setup-agent.ts';

const texts = readAgentTexts();

function mockFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

function sentRequest(fetchMock: ReturnType<typeof mockFetch>) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  return { url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) };
}

async function setupError(status: number, body: unknown, agentId?: string): Promise<string> {
  const error = await setupAgent({ apiKey: 'test-key', agentId, texts, fetch: mockFetch(status, body) }).catch(
    (e: unknown) => e,
  );
  return describeSetupError(error, agentId);
}

describe('agent texts', () => {
  it('reads the first message and prompt from agent/', () => {
    expect(texts.firstMessage).toMatch(/^Hi, I'm Mira/);
    expect(texts.systemPrompt).toMatch(/^You are a warm, sharp user researcher/);
    expect(texts.systemPrompt).toMatch(/\{\{product_context\}\}$/);
  });

  it('keeps the prompt as written, not reflowed like markdown', () => {
    expect(texts.systemPrompt).toMatch(/^How to run the interview:\n- Ask one question/m);
    expect(texts.systemPrompt).toMatch(/^Ending:$/m);
    expect(texts.systemPrompt).toMatch(/\nBackground on the product.*:\n\{\{product_context\}\}$/);
  });
});

describe('setupAgent', () => {
  it('creates an agent when no ID is set', async () => {
    const fetchMock = mockFetch(200, { agent_id: 'agent_new' });
    const result = await setupAgent({ apiKey: 'test-key', texts, fetch: fetchMock });

    expect(result).toEqual({ action: 'created', agentId: 'agent_new' });
    const { url, method, body } = sentRequest(fetchMock);
    expect(method).toBe('POST');
    expect(url).toBe('https://api.elevenlabs.io/v1/convai/agents/create?enable_versioning=false');
    expect(body.name).toBe('Mira');
    expect(body.conversation_config.agent.first_message).toBe(texts.firstMessage);
    expect(body.conversation_config.agent.prompt.prompt).toBe(texts.systemPrompt);
  });

  it('updates the agent instead of creating one when an ID is set', async () => {
    const fetchMock = mockFetch(200, {
      agent_id: 'agent_123',
      name: 'Mira',
      conversation_config: { agent: { prompt: { prompt: texts.systemPrompt } } },
      metadata: { created_at_unix_secs: 1, updated_at_unix_secs: 2 },
    });
    const result = await setupAgent({ apiKey: 'test-key', agentId: ' agent_123 ', texts, fetch: fetchMock });

    expect(result).toEqual({ action: 'updated', agentId: 'agent_123' });
    const { url, method, body } = sentRequest(fetchMock);
    expect(method).toBe('PATCH');
    expect(url).toBe('https://api.elevenlabs.io/v1/convai/agents/agent_123?enable_versioning_if_not_enabled=false');
    expect(body.conversation_config.agent.prompt.prompt).toBe(texts.systemPrompt);
  });

  it('sends the documented dashboard settings', async () => {
    const fetchMock = mockFetch(200, { agent_id: 'agent_new' });
    await setupAgent({ apiKey: 'test-key', texts, fetch: fetchMock });

    const { body } = sentRequest(fetchMock);
    const config = body.conversation_config;
    expect(config.tts).toEqual({
      voice_id: 'ZanLYTrbe2MUsXisnpwn',
      model_id: 'eleven_v4_turbo',
      expressive_mode: true,
    });
    expect(config.agent.prompt).toMatchObject({ llm: 'deepseek-v41-flash', temperature: 0, max_tokens: -1 });
    expect(config.agent.prompt.built_in_tools.end_call).toMatchObject({
      name: 'end_call',
      params: { system_tool_type: 'end_call' },
    });
    expect(config.turn).toEqual({ turn_eagerness: 'normal' });
    expect(config.conversation).toEqual({ max_duration_seconds: 600 });
    expect(body.platform_settings).toEqual({ auth: { enable_auth: false }, privacy: { record_voice: true } });
  });

  it('greets in English and lets language detection switch to every preset', async () => {
    const fetchMock = mockFetch(200, { agent_id: 'agent_new' });
    await setupAgent({ apiKey: 'test-key', texts, fetch: fetchMock });

    const config = sentRequest(fetchMock).body.conversation_config;
    expect(config.agent.language).toBe('en');
    expect(config.agent.prompt.built_in_tools.language_detection).toEqual({
      type: 'system',
      name: 'language_detection',
      description: '',
      params: { system_tool_type: 'language_detection', only_at_conversation_start: true },
    });
    expect(Object.keys(config.language_presets).sort()).toEqual([...ADDITIONAL_LANGUAGES].sort());
    expect(config.language_presets).not.toHaveProperty('en');
    expect(config.language_presets.es).toEqual({ overrides: {} });
    expect(texts.firstMessage).toMatch(/answer in any language/);
    expect(texts.systemPrompt).toMatch(/call the language_detection tool/);
  });

  it('sends the API key header', async () => {
    const fetchMock = mockFetch(200, { agent_id: 'agent_new' });
    await setupAgent({ apiKey: 'test-key', texts, fetch: fetchMock });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('xi-api-key')).toBe('test-key');
  });
});

describe('describeSetupError', () => {
  it('names the missing permission', async () => {
    const message = await setupError(401, {
      detail: {
        status: 'missing_permissions',
        message: 'The API key you used is missing the permission convai_write to execute this operation.',
      },
    });
    expect(message).toMatch(/missing the convai_write permission/);
    expect(message).toMatch(/ElevenLabs said: The API key you used/);
  });

  it('treats a bare 403 as a missing permission', async () => {
    expect(await setupError(403, {})).toMatch(/missing the convai_write permission/);
  });

  it('points at the key when it is rejected', async () => {
    const message = await setupError(401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } });
    expect(message).toMatch(/rejected ELEVENLABS_API_KEY/);
  });

  it('points at the agent ID when the agent does not exist', async () => {
    const message = await setupError(404, { detail: { status: 'not_found', message: 'Agent not found' } }, 'agent_x');
    expect(message).toMatch(/No agent with ID agent_x/);
    expect(message).toMatch(/clear it to create a new agent/);
  });

  it('falls back to the status and API message', async () => {
    const message = await setupError(422, { detail: 'bad field' });
    expect(message).toBe('ElevenLabs returned HTTP 422. ElevenLabs said: bad field');
  });
});

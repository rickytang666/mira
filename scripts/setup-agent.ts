import { ElevenLabsClient, ElevenLabsError, ElevenLabsTimeoutError } from '@elevenlabs/elevenlabs-js';
import { type AgentTexts, buildAgentConfig, readAgentTexts } from '../agent/config.ts';

export type SetupResult = { action: 'created' | 'updated'; agentId: string };

export async function setupAgent(options: {
  apiKey: string;
  agentId?: string;
  texts: AgentTexts;
  fetch?: typeof fetch;
}): Promise<SetupResult> {
  const client = new ElevenLabsClient({ apiKey: options.apiKey, fetch: options.fetch, maxRetries: 0 });
  const config = buildAgentConfig(options.texts);
  const agentId = options.agentId?.trim();
  // the API now defaults versioning on, and once on it can't be turned off, so opt out explicitly
  if (agentId) {
    await client.conversationalAi.agents.update(agentId, { ...config, enableVersioningIfNotEnabled: false });
    return { action: 'updated', agentId };
  }
  const created = await client.conversationalAi.agents.create({ ...config, enableVersioning: false });
  return { action: 'created', agentId: created.agentId };
}

function apiDetail(body: unknown): { status?: string; message?: string } {
  if (typeof body !== 'object' || body === null || !('detail' in body)) return {};
  const detail = body.detail;
  if (typeof detail === 'string') return { message: detail };
  if (typeof detail !== 'object' || detail === null) return {};
  const { status, message } = detail as Record<string, unknown>;
  return {
    status: typeof status === 'string' ? status : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

export function describeSetupError(error: unknown, agentId?: string): string {
  if (error instanceof ElevenLabsTimeoutError) return 'ElevenLabs did not respond in time. Try again.';
  if (!(error instanceof ElevenLabsError)) return error instanceof Error ? error.message : String(error);
  const { status, message } = apiDetail(error.body);
  const said = message ? ` ElevenLabs said: ${message}` : '';
  if (status === 'missing_permissions' || (error.statusCode === 403 && !status))
    return `Your ElevenLabs API key is missing the convai_write permission (ElevenLabs Agents: write), which creating and updating agents needs. Edit the key's permissions in the ElevenLabs dashboard, or make a new key with it.${said}`;
  if (error.statusCode === 401) return `ElevenLabs rejected ELEVENLABS_API_KEY. Check the key in .env.server.${said}`;
  if (error.statusCode === 404 && agentId)
    return `No agent with ID ${agentId} on this ElevenLabs account. Fix REACT_APP_ELEVENLABS_AGENT_ID in .env.client, or clear it to create a new agent.${said}`;
  return `ElevenLabs returned HTTP ${error.statusCode ?? 'error'}.${said || ` ${error.message}`}`;
}

async function main(): Promise<number> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set ELEVENLABS_API_KEY in .env.server first.');
    return 1;
  }
  const agentId = process.env.REACT_APP_ELEVENLABS_AGENT_ID?.trim() || undefined;
  try {
    const result = await setupAgent({ apiKey, agentId, texts: readAgentTexts() });
    if (result.action === 'updated') {
      console.log(`Updated agent ${result.agentId} to match agent/.`);
    } else {
      console.log(`Created agent ${result.agentId}. Add this line to .env.client:`);
      console.log(`REACT_APP_ELEVENLABS_AGENT_ID=${result.agentId}`);
    }
    return 0;
  } catch (error) {
    console.error(describeSetupError(error, agentId));
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main();

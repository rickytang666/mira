import type { FetchedConversation, TranscriptTurn } from '../contract';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1/convai/conversations';
export const ELEVENLABS_TIMEOUT_MS = 30_000;

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set in .env.server');
  return key;
}

// The signal also covers reading the body, so a stalled download times out too.
async function request<T>(
  label: string,
  url: string,
  accept: string,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  try {
    const response = await fetch(url, {
      headers: { 'xi-api-key': apiKey(), Accept: accept },
      signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${label} returned ${response.status}`);
    return await read(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error(`${label} timed out after ${ELEVENLABS_TIMEOUT_MS / 1000} s`);
    throw error;
  }
}

function mediaType(response: Response): string | undefined {
  return response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || undefined;
}

export function miraAgentId(): string {
  const id = process.env.ELEVENLABS_AGENT_ID;
  if (!id) throw new Error('ELEVENLABS_AGENT_ID is not set in .env.server');
  return id;
}

type RawConversation = {
  conversation_id: string;
  agent_id?: string;
  status: FetchedConversation['status'];
  metadata?: { call_duration_secs?: number };
  transcript?: { role: 'user' | 'agent'; message?: string | null; time_in_call_secs: number }[];
};

export async function fetchConversation(conversationId: string): Promise<FetchedConversation> {
  const raw = await request(
    `ElevenLabs conversation ${conversationId}`,
    `${ELEVENLABS_API}/${encodeURIComponent(conversationId)}`,
    'application/json',
    async (response) => {
      const type = mediaType(response);
      if (type && type !== 'application/json')
        throw new Error(`ElevenLabs conversation ${conversationId} returned ${type}, not JSON`);
      return (await response.json()) as RawConversation;
    },
  );
  const turns: TranscriptTurn[] = (raw.transcript ?? [])
    .filter((turn) => turn.message && turn.message.trim())
    .map((turn) => ({ role: turn.role, text: turn.message!.trim(), timeInCallSecs: turn.time_in_call_secs }));
  return {
    conversationId: raw.conversation_id,
    agentId: raw.agent_id,
    status: raw.status,
    durationSecs: raw.metadata?.call_duration_secs ?? turns.at(-1)?.timeInCallSecs ?? 0,
    turns,
  };
}

export async function fetchConversationAudio(conversationId: string): Promise<{ bytes: Buffer; contentType: string }> {
  return request(
    `ElevenLabs audio ${conversationId}`,
    `${ELEVENLABS_API}/${encodeURIComponent(conversationId)}/audio`,
    'audio/*',
    async (response) => {
      const type = mediaType(response);
      if (type && !type.startsWith('audio/') && type !== 'application/octet-stream')
        throw new Error(`ElevenLabs audio ${conversationId} returned ${type}, not audio`);
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'audio/mpeg',
      };
    },
  );
}

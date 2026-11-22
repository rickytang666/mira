import type { TranscriptTurn } from './internalTypes';
import { parseTranscript } from './transcript';

export class ElevenLabsError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSec?: number;
  constructor(message: string, status: number, retryable: boolean, retryAfterSec?: number) {
    super(message); this.name = 'ElevenLabsError';
    this.status = status; this.retryable = retryable; this.retryAfterSec = retryAfterSec;
  }
}

export interface ConversationTranscript {
  conversationId: string;
  status: 'done';
  hasAudio: boolean;
  durationSec?: number;
  transcript: TranscriptTurn[];
}

export interface ElevenLabsOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/** Server-only. Let the job runner retry retryable errors; no sleeping worker loops. */
export function createElevenLabsClient(options: ElevenLabsOptions = {}) {
  async function request(conversationId: string, audio = false): Promise<Response> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(conversationId)) throw new Error('Invalid conversation ID.');
    const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('Set ELEVENLABS_API_KEY on the server.');
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}${audio ? '/audio' : ''}`, {
        headers: { 'xi-api-key': apiKey, Accept: audio ? 'audio/*' : 'application/json' }, signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ElevenLabsError('Could not reach ElevenLabs. Retry the job.', 0, true);
    }
    if (!response.ok) {
      const retryHeader = response.headers.get('retry-after');
      const retrySeconds = retryHeader === null ? NaN : Number(retryHeader);
      const retryAfterSec = Number.isFinite(retrySeconds) ? Math.max(0, retrySeconds) : undefined;
      throw new ElevenLabsError(`ElevenLabs returned HTTP ${response.status}${response.status === 401 || response.status === 403 ? '; check the server key and conversation permissions' : ''}.`, response.status, response.status === 404 || response.status === 429 || response.status >= 500, retryAfterSec);
    }
    return response;
  }

  async function getTranscript(conversationId: string): Promise<ConversationTranscript> {
    const response = await request(conversationId);
    const body = await response.json() as Record<string, unknown>;
    if (body.status === 'failed') throw new ElevenLabsError('The ElevenLabs conversation failed.', 422, false);
    if (['initiated', 'in-progress', 'processing'].includes(String(body.status))) throw new ElevenLabsError('The conversation transcript is still processing.', 409, true, 5);
    if (body.status !== 'done' || body.conversation_id !== conversationId) throw new ElevenLabsError('Unexpected conversation response.', 502, false);
    const metadata = body.metadata as { call_duration_secs?: unknown } | undefined;
    const duration = metadata?.call_duration_secs;
    const durationSec = typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : undefined;
    // Empty completed calls are legitimate and should not be retried indefinitely.
    const transcript = Array.isArray(body.transcript) && body.transcript.length === 0 ? [] : parseTranscript(JSON.stringify(body), durationSec);
    return { conversationId, status: 'done', hasAudio: body.has_audio === true, durationSec, transcript };
  }

  /** Forward/persist this body in Track 1's authorized audio route. Do not expose the key. */
  async function getAudio(conversationId: string): Promise<Response> {
    const response = await request(conversationId, true);
    const type = response.headers.get('content-type')?.split(';')[0];
    if (type && !type.startsWith('audio/') && type !== 'application/octet-stream') throw new ElevenLabsError('ElevenLabs did not return an audio recording.', 502, true);
    if (!response.body) throw new ElevenLabsError('The audio recording is not ready.', 409, true, 5);
    return response;
  }

  return { getTranscript, getAudio };
}

export const elevenlabsClient = createElevenLabsClient();

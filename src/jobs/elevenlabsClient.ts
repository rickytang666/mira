import type { FetchedConversation, TranscriptTurn } from "../contract";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/convai/conversations";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set in .env.server");
  return key;
}

type RawConversation = {
  conversation_id: string;
  status: FetchedConversation["status"];
  metadata?: { call_duration_secs?: number };
  transcript?: { role: "user" | "agent"; message?: string | null; time_in_call_secs: number }[];
};

export async function fetchConversation(conversationId: string): Promise<FetchedConversation> {
  const response = await fetch(`${ELEVENLABS_API}/${encodeURIComponent(conversationId)}`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!response.ok) throw new Error(`ElevenLabs conversation ${conversationId} returned ${response.status}`);
  const raw = (await response.json()) as RawConversation;
  const turns: TranscriptTurn[] = (raw.transcript ?? [])
    .filter((turn) => turn.message && turn.message.trim())
    .map((turn) => ({ role: turn.role, text: turn.message!.trim(), timeInCallSecs: turn.time_in_call_secs }));
  return {
    conversationId: raw.conversation_id,
    status: raw.status,
    durationSecs: raw.metadata?.call_duration_secs ?? turns.at(-1)?.timeInCallSecs ?? 0,
    turns,
  };
}

export async function fetchConversationAudio(conversationId: string): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(`${ELEVENLABS_API}/${encodeURIComponent(conversationId)}/audio`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!response.ok) throw new Error(`ElevenLabs audio ${conversationId} returned ${response.status}`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

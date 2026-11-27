import { config } from 'wasp/server';

// Matches the audio api route in main.wasp.ts, which proxies the recording so the ElevenLabs key stays on the server.
export const interviewAudioUrl = (interviewId: string) => `${config.serverUrl}/api/interviews/${interviewId}/audio`;

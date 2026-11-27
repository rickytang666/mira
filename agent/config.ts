import { readFileSync } from 'node:fs';
import type { ElevenLabs } from '@elevenlabs/elevenlabs-js';

export const AGENT_NAME = 'Mira';

// language_detection can only switch to a preset; this is the dashboard's "All" set besides English
export const ADDITIONAL_LANGUAGES = [
  'ar',
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'es',
  'fi',
  'fil',
  'fr',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'ms',
  'nl',
  'no',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sv',
  'ta',
  'tr',
  'uk',
  'vi',
  'zh',
] as const;

export interface AgentTexts {
  firstMessage: string;
  systemPrompt: string;
}

export function readAgentTexts(dir = new URL('.', import.meta.url)): AgentTexts {
  const read = (name: string) => readFileSync(new URL(name, dir), 'utf8').trimEnd();
  return { firstMessage: read('first-message.txt'), systemPrompt: read('system-prompt.txt') };
}

export function buildAgentConfig(
  texts: AgentTexts,
): Required<
  Pick<
    ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost,
    'name' | 'conversationConfig' | 'platformSettings'
  >
> {
  return {
    name: AGENT_NAME,
    conversationConfig: {
      agent: {
        language: 'en',
        firstMessage: texts.firstMessage,
        prompt: {
          prompt: texts.systemPrompt,
          llm: 'deepseek-v41-flash',
          temperature: 0,
          // -1 is the API's "no limit"
          maxTokens: -1,
          builtInTools: {
            endCall: { type: 'system', name: 'end_call', description: '', params: { systemToolType: 'end_call' } },
            languageDetection: {
              type: 'system',
              name: 'language_detection',
              description: '',
              // switching only in the first two participant turns, so a foreign brand name can't flip a call midway
              params: { systemToolType: 'language_detection', onlyAtConversationStart: true },
            },
          },
        },
      },
      tts: { voiceId: 'ZanLYTrbe2MUsXisnpwn', modelId: 'eleven_v4_turbo', expressiveMode: true },
      turn: { turnEagerness: 'normal' },
      conversation: { maxDurationSeconds: 600 },
      // no overrides: every language keeps the multilingual v4 voice and the English greeting
      languagePresets: Object.fromEntries(ADDITIONAL_LANGUAGES.map((code) => [code, { overrides: {} }])),
    },
    platformSettings: {
      // the phone connects with the agent ID only, so the agent must stay public
      auth: { enableAuth: false },
      // the report plays quote clips from the recording
      privacy: { recordVoice: true },
    },
  };
}

// Data contract for Idea 49.
// Only what crosses a boundary between tracks. Changing it is a team announcement.

// ---- Track 3: src/agent/suggestQuestions.ts (plain TypeScript, no Wasp imports) ----

export type SuggestQuestionsInput = {
  productName: string;
  goal: string;
  audience: string;
  context: string; // joined Source.content from the knowledge base (importWebsite in src/sources.ts already scrapes the URL)
};

export type SuggestQuestionsOutput = {
  questions: string[]; // 3 to 5, each one spoken sentence
};

// ---- Track 1: src/jobs/elevenlabsClient.ts ----

// Mirrors GET /v1/convai/conversations/{id}: transcript[].role, .message, .time_in_call_secs.
export type TranscriptTurn = {
  role: 'agent' | 'user';
  text: string;
  timeInCallSecs: number;
};

export type FetchedConversation = {
  conversationId: string;
  status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed'; // job retries until "done"
  agentId?: string;
  durationSecs: number;
  turns: TranscriptTurn[];
};

// ---- Track 2 <-> ElevenLabs agent prompt: dynamic variables passed to startSession ----

export type InterviewDynamicVariables = {
  product_url: string;
  goal: string;
  questions: string; // numbered, newline-separated
  product_context?: string;
  audience?: string;
  study_id?: string;
};

// ---- Track 1 operations (Wasp), consumed by tracks 2 and 3 ----

export type PublicStudy = {
  // getPublicStudy({ studyId }), no login
  id: string;
  productUrl: string;
  goal: string;
  questions: string[];
  dynamicVariables?: InterviewDynamicVariables;
  name: string;
  logo?: string | null; // founder's logo as a data URL, drawn on the character's shirt
};

export type FinishInterviewInput = {
  // finishInterview action, no login; enqueues processInterview
  studyId: string;
  conversationId: string;
  questionSnapshot?: string[]; // capture getPublicStudy.questions when the call starts
};

export type ReportView = {
  // getReport({ studyId }), founder only
  studyId: string;
  goal: string;
  interviewsDone: number;
  interviewsProcessing: number;
  interviewsFailed?: number;
  synthesisStatus?: 'waiting' | 'processing' | 'ready' | 'failed';
  synthesisError?: string;
  synthesizedInterviews?: number;
  // Optional report enrichment; existing getReport consumers remain compatible.
  productName?: string;
  summary?: string;
  updatedAt?: string;
  recommendations?: { text: string; themeIds: string[] }[];
  questionFindings?: {
    question: string;
    status: 'answered' | 'partial' | 'unanswered';
    finding: string;
    themeIds: string[];
  }[];
  themes: {
    id: string;
    label: string;
    summary?: string;
    count: number;
    quotes: {
      id: string;
      text: string;
      startSec: number;
      endSec?: number;
      interviewId?: string;
      participantLabel?: string;
      // Untimed pasted text keeps its quote but cannot enable playback.
      untimed?: boolean;
      audioUrl: string; // server-proxied, the ElevenLabs key never reaches the browser
    }[];
  }[];
};

export type GenerateReportInput = {
  studyId: string;
  productName: string;
  goal: string;
  context?: string; // imported knowledge; background, never participant evidence
  audience?: string;
  questions?: string[]; // founder's final edited question list
  calls: { id: string; title: string; transcript: string; questions?: string[] }[];
};

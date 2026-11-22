// Data contract for Idea 49.
// Only what crosses a boundary between tracks. Changing it is a team announcement.

// ---- Track C: src/agent/suggestQuestions.ts (plain TypeScript, no Wasp imports) ----

export type SuggestQuestionsInput = {
  productName: string;
  goal: string;
  audience: string;
  context: string; // joined Source.content from the knowledge base (importWebsite already scrapes the URL)
};

export type SuggestQuestionsOutput = {
  questions: string[]; // 3 to 5, each one spoken sentence
};

// ---- Track C: src/agent/elevenlabsClient.ts ----

// Mirrors GET /v1/convai/conversations/{id}: transcript[].role, .message, .time_in_call_secs (verified 11:50).
export type TranscriptTurn = {
  role: "agent" | "user";
  text: string;
  timeInCallSecs: number;
};

export type FetchedConversation = {
  conversationId: string;
  status: "in-progress" | "processing" | "done" | "failed"; // job retries until "done"
  durationSecs: number;
  turns: TranscriptTurn[];
};

// ---- Track C: src/agent/synthesizeInterview.ts ----

export type SynthesizeInterviewInput = {
  goal: string;
  questions: string[];
  turns: TranscriptTurn[];
  existingThemeLabels: string[]; // reuse a label when the idea matches, so counts add up across interviews
};

export type SynthesizedQuote = {
  text: string; // verbatim from a user turn
  startSec: number; // that user turn's timeInCallSecs
  endSec: number; // next turn's timeInCallSecs, or durationSecs
};

export type SynthesizeInterviewOutput = {
  themes: { label: string; quotes: SynthesizedQuote[] }[]; // each theme counts once per interview
};

// ---- Track B <-> ElevenLabs agent prompt: dynamic variables passed to startSession ----

export type InterviewDynamicVariables = {
  product_url: string;
  goal: string;
  questions: string; // numbered, newline-separated
};

// ---- Track A operations (Wasp), consumed by B and D ----

export type PublicStudy = {
  // getPublicStudy({ studyId }), no login
  id: string;
  productUrl: string;
  goal: string;
  questions: string[];
};

export type FinishInterviewInput = {
  // finishInterview action, no login; enqueues processInterview
  studyId: string;
  conversationId: string;
};

export type ReportView = {
  // getReport({ studyId }), founder only
  studyId: string;
  goal: string;
  interviewsDone: number;
  interviewsProcessing: number;
  themes: {
    id: string;
    label: string;
    count: number;
    quotes: {
      id: string;
      text: string;
      startSec: number;
      audioUrl: string; // server-proxied, the ElevenLabs key never reaches the browser
    }[];
  }[];
};

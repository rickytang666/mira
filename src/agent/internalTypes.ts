/** Internal analysis/preview models. Public cross-track types live in ../contract.ts. */
export interface ProductContext {
  name: string;
  goal: string;
  audience?: string;
  productUrl?: string;
  productContext?: string;
  sources?: Array<{ title: string; content: string }>;
}

export interface SuggestedQuestion {
  id: string;
  text: string;
  followUp: boolean;
}

export interface TranscriptTurn {
  id: string;
  role: 'user' | 'agent';
  text: string;
  /** null means unknown; never invent an offset for pasted plain text. */
  startSec: number | null;
  endSec: number | null;
}

export interface ExtractedQuote {
  turnId: string;
  text: string;
  startSec: number | null;
  endSec: number | null;
}

export interface InterviewTheme {
  /** Reuse an existing label when the meaning matches, for cross-interview grouping. */
  label: string;
  summary: string;
  quotes: ExtractedQuote[];
}

export interface InterviewSynthesis {
  summary: string;
  themes: InterviewTheme[];
  method: 'llm' | 'local';
  warnings: string[];
}

export interface SynthesizeInterviewInput {
  transcript: string | TranscriptTurn[];
  context?: ProductContext;
  durationSec?: number;
  existingThemes?: Array<{ label: string; summary: string }>;
  questions?: string[];
}

export interface InterviewResult {
  id: string;
  status: 'started' | 'processing' | 'done' | 'failed';
  participantLabel?: string;
  /** Same-origin authenticated proxy or short-lived signed recording URL; never API credentials. */
  audioUrl?: string | null;
  synthesis?: InterviewSynthesis | null;
}

export interface ReportQuote extends ExtractedQuote {
  id: string;
  interviewId: string;
  participantLabel: string;
  audioUrl: string | null;
}

export interface ReportTheme {
  id: string;
  label: string;
  summary: string;
  /** Number of distinct completed interviews containing the theme, NOT number of quotes. */
  count: number;
  quotes: ReportQuote[];
}

export interface StudyReport {
  studyId: string;
  productName: string;
  goal: string;
  completedCount: number;
  processingCount: number;
  failedCount: number;
  themes: ReportTheme[];
  updatedAt: string;
  summary?: string;
  synthesizedInterviews?: number;
  recommendations?: { text: string; themeIds: string[] }[];
  questionFindings?: { question: string; status: 'answered' | 'partial' | 'unanswered'; finding: string; themeIds: string[] }[];
}

export type ReportLoader = (studyId: string, signal: AbortSignal) => Promise<StudyReport>;

/** Internal analysis/preview models. Public cross-track types live in ../contract.ts. */
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
  questionFindings?: {
    question: string;
    status: 'answered' | 'partial' | 'unanswered';
    finding: string;
    themeIds: string[];
  }[];
}

export type ReportLoader = (studyId: string, signal: AbortSignal) => Promise<StudyReport>;

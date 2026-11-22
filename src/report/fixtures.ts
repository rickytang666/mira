import type { InterviewResult } from '../agent/internalTypes';
import type { ReportView } from '../contract';
import { buildReport } from './buildReport';

export const sampleTranscript = `[00:00] Interviewer: Tell me about the last time you tried setting up the product.
[00:05] Participant: I got stuck connecting my API key. I could not tell which permissions it needed.
[00:14] Interviewer: What did you do next?
[00:17] Participant: I copied everything into a spreadsheet instead. That took another twenty minutes.
[00:27] Interviewer: What would have helped?
[00:30] Participant: An example showing the exact permissions would have helped me finish the setup.
[00:39] Interviewer: Thank you.`;

const quote = (turnId: string, text: string, startSec: number, endSec: number) => ({ turnId, text, startSec, endSec });
/** Deliberately fictional. Never mixed into a live study or passed to persistence. */
export const sampleInterviews: InterviewResult[] = [
  { id: 'sample-1', participantLabel: 'Participant 01', status: 'done', synthesis: { method: 'local', warnings: [], summary: 'Sample interview.', themes: [
    { label: 'Setup needs a clearer next step', summary: 'Participants describe uncertainty when connecting their first integration.', quotes: [quote('t1', 'I got stuck connecting my API key. I could not tell which permissions it needed.', 5, 14)] },
    { label: 'Spreadsheets fill the gaps', summary: 'Manual workarounds keep the task moving when the product gets in the way.', quotes: [quote('t2', 'I copied everything into a spreadsheet instead. That took another twenty minutes.', 17, 27)] },
  ] } },
  { id: 'sample-2', participantLabel: 'Participant 02', status: 'done', synthesis: { method: 'local', warnings: [], summary: 'Sample interview.', themes: [
    { label: 'Setup needs a clearer next step', summary: 'Participants describe uncertainty when connecting their first integration.', quotes: [quote('t1', 'I had the key, but I was not sure where to put it. An example would have saved me a lot of time.', 9, 20)] },
  ] } },
  { id: 'sample-3', participantLabel: 'Participant 03', status: 'done', synthesis: { method: 'local', warnings: [], summary: 'Sample interview.', themes: [
    { label: 'Setup needs a clearer next step', summary: 'Participants describe uncertainty when connecting their first integration.', quotes: [quote('t1', 'Once the integration worked, everything made sense. Getting there was the hard part.', 12, 22)] },
    { label: 'Spreadsheets fill the gaps', summary: 'Manual workarounds keep the task moving when the product gets in the way.', quotes: [quote('t2', 'I still export the results to compare them side by side in my spreadsheet.', 33, 43)] },
  ] } },
];

export const sampleStudy = { id: 'sample-study', name: 'Fieldwork', goal: 'Understand what gets in the way of a successful first experience.' };
export const sampleReport = buildReport(sampleStudy, sampleInterviews, '2026-11-22T17:00:00.000Z');

/** Fixture in the exact getReport contract, suitable for wiring before the query lands. */
export const sampleReportView: ReportView = {
  studyId: sampleReport.studyId,
  goal: sampleReport.goal,
  interviewsDone: sampleReport.completedCount,
  interviewsProcessing: sampleReport.processingCount,
  productName: 'Fieldwork',
  updatedAt: sampleReport.updatedAt,
  questionFindings: [
    { question: 'What gets in the way of completing setup?', status: 'answered', finding: 'All three sample participants described friction with the first integration. Finding the right settings and understanding permissions are concrete places to improve.', themeIds: [sampleReport.themes[0].id] },
    { question: 'What would make people stop using spreadsheets?', status: 'partial', finding: 'Two participants still use spreadsheets, but these calls do not establish which product change would replace their workaround. Watch the comparison workflow in a follow-up.', themeIds: [sampleReport.themes[1].id] },
  ],
  summary: 'The value becomes clear once people get through setup. Across these three sample conversations, connecting the first integration was the shared stumbling block. Two participants turned to spreadsheets to keep their work moving—a useful place to investigate where the product is losing momentum.',
  recommendations: [
    { text: 'Test a guided setup example that shows the exact permissions required for the first integration.', themeIds: [sampleReport.themes[0].id] },
    { text: 'Watch a participant compare their results in a spreadsheet to understand what is missing in the product.', themeIds: [sampleReport.themes[1].id] },
  ],
  themes: sampleReport.themes.map(theme => ({
    id: theme.id, label: theme.label, summary: theme.summary, count: theme.count,
    quotes: theme.quotes.map(quote => ({
      id: quote.id, text: quote.text, startSec: quote.startSec!, endSec: quote.endSec ?? undefined, audioUrl: quote.audioUrl ?? '', interviewId: quote.interviewId, participantLabel: quote.participantLabel,
    })),
  })),
};

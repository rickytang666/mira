import type { ReportView } from '../contract';
import type { StudyReport } from '../agent/internalTypes';

/** The database-facing ReportView stays unchanged; presentation adds no invented evidence. */
export function fromReportView(view: ReportView, productName = 'Research report'): StudyReport {
  return {
    studyId: view.studyId,
    productName: view.productName ?? productName,
    goal: view.goal,
    completedCount: view.interviewsDone,
    processingCount: view.interviewsProcessing,
    failedCount: view.interviewsFailed ?? 0,
    updatedAt: view.updatedAt ?? new Date().toISOString(),
    summary: view.summary,
    recommendations: view.recommendations,
    questionFindings: view.questionFindings,
    synthesizedInterviews: view.synthesizedInterviews,
    themes: view.themes.map(theme => ({
      id: theme.id, label: theme.label, count: theme.count, summary: theme.summary ?? '',
      quotes: theme.quotes.map(quote => ({
        id: quote.id, turnId: quote.id, text: quote.text,
        startSec: quote.untimed ? null : quote.startSec, endSec: quote.endSec ?? null,
        audioUrl: quote.audioUrl || null,
        // ReportView does not provide speaker/interview metadata: do not fabricate it.
        interviewId: quote.interviewId ?? '', participantLabel: quote.participantLabel ?? 'Participant quote',
      })),
    })),
  };
}

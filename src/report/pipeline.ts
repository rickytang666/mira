import type { AgentOptions } from '../agent/llm';
import type { StudyResearchContext } from '../agent/studyContext';
import { synthesizeStudy, type StudyCall } from '../agent/synthesizeStudy';
import type { ReportView } from '../contract';

export interface ReportSnapshot {
  study: StudyResearchContext;
  calls: StudyCall[];
  revision: number;
}
export interface ReportRepository {
  load(studyId: string): Promise<ReportSnapshot>;
  save(studyId: string, revision: number, report: ReportView): Promise<boolean>;
  fail(studyId: string, revision: number, message: string): Promise<void>;
}

/** Generate outside the transaction; commit only if no newer call or study edit has landed. */
export async function refreshStudyReport(studyId: string, repository: ReportRepository, options: AgentOptions = {}) {
  // A busy study can change during an LLM request. Retry against the fresh full dataset.
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await repository.load(studyId);
    try {
      const report = await synthesizeStudy(snapshot.study, snapshot.calls, options);
      if (await repository.save(studyId, snapshot.revision, report)) return report;
    } catch (error) {
      await repository.fail(
        studyId,
        snapshot.revision,
        error instanceof Error ? error.message : 'Report generation failed.',
      );
      throw error;
    }
  }
  throw new Error('New interviews arrived during report generation. Please refresh the report again.');
}

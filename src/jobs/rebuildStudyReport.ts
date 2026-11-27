import type { RebuildStudyReport } from 'wasp/server/jobs';
import { rebuildReport } from '../report/server';

export const rebuildStudyReport: RebuildStudyReport<{ studyId: string }, { themes: number }> = async ({ studyId }) => {
  await rebuildReport(studyId);
  // Submits made while this job ran were dropped by its singleton key, so cover anything that landed meanwhile.
  const report = await rebuildReport(studyId);
  return { themes: report.themes.length };
};

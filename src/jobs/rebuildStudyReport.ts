import type { RebuildStudyReport } from 'wasp/server/jobs';
import { rebuildReport } from '../report/server';

export const rebuildStudyReport: RebuildStudyReport<{ studyId: string }, { themes: number }> = async ({ studyId }) => {
  const report = await rebuildReport(studyId);
  return { themes: report.themes.length };
};

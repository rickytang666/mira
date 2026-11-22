import { HttpError } from 'wasp/server';
import type { GenerateReportInput } from '../contract';
import { synthesizeReport } from '../agent/synthesizeReport';
import { rebuildReport } from './server';

/** Developer/test action. Normal reports read persisted calls through regenerateStudyReport. */
export async function generateInterviewReport(input: GenerateReportInput) {
  try { return await synthesizeReport(input); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Could not generate the report.'); }
}

export async function regenerateStudyReport({ studyId }: { studyId: string }) {
  if (!studyId) throw new HttpError(400, 'Missing study.');
  try { return await rebuildReport(studyId, true); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Could not update the report.'); }
}

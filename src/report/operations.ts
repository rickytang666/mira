import { HttpError } from 'wasp/server';
import { rebuildReport } from './server';

export async function regenerateStudyReport({ studyId }: { studyId: string }) {
  if (!studyId) throw new HttpError(400, 'Missing study.');
  try {
    return await rebuildReport(studyId, true);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Could not update the report.');
  }
}

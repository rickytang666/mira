import { finishInterview } from 'wasp/client/operations';

// Hands the finished conversation to track 1, which enqueues processInterview.
// finishInterview upserts on conversationId, so retrying is safe.
// A local copy of every ID is kept so nothing is lost if the server is unreachable mid-demo.

export type FinishedInterview = { studyId: string; conversationId: string; questionSnapshot: string[] };

const key = 'fieldwork.finishedInterviews.v1';

function keepLocalCopy(entry: FinishedInterview & { saved: boolean }) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(
      key,
      JSON.stringify([...(Array.isArray(list) ? list : []), { ...entry, at: new Date().toISOString() }]),
    );
  } catch {
    // Storage blocked (private mode): the server call is what matters.
  }
}

export async function reportFinished(entry: FinishedInterview): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await finishInterview(entry);
      keepLocalCopy({ ...entry, saved: true });
      return true;
    } catch (err) {
      console.warn('[interview] finishInterview failed', attempt + 1, err);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  keepLocalCopy({ ...entry, saved: false });
  return false;
}

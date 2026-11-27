// Local record of finished interviews, so one the server never got can be resent on the next page load.
// Kept free of wasp imports so it runs under vitest.

export type FinishedInterview = { studyId: string; conversationId: string; questionSnapshot: string[] };
type StoredInterview = FinishedInterview & { saved: boolean; at: string };
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const key = 'fieldwork.finishedInterviews.v1';
const keepSaved = 20;

function isStored(value: unknown): value is StoredInterview {
  const v = value as Partial<StoredInterview> | null;
  return (
    !!v &&
    typeof v.studyId === 'string' &&
    typeof v.conversationId === 'string' &&
    !!v.conversationId &&
    Array.isArray(v.questionSnapshot)
  );
}

// Older builds appended one row per report, so a conversation can appear more than once.
function readStored(store: KeyValueStore | null): StoredInterview[] {
  if (!store) return [];
  try {
    const list: unknown = JSON.parse(store.getItem(key) || '[]');
    if (!Array.isArray(list)) return [];
    const byId = new Map<string, StoredInterview>();
    for (const row of list.filter(isStored)) {
      const prior = byId.get(row.conversationId);
      byId.delete(row.conversationId);
      byId.set(row.conversationId, { ...row, saved: !!row.saved || !!prior?.saved });
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

/** Saved never flips back to unsaved. Unsaved rows are always kept; only the newest saved ones are. */
export function markStored(store: KeyValueStore | null, entry: FinishedInterview, saved: boolean) {
  if (!store) return;
  const rows = readStored(store);
  const prior = rows.find((r) => r.conversationId === entry.conversationId);
  const next = [
    ...rows.filter((r) => r.conversationId !== entry.conversationId),
    { ...entry, saved: saved || !!prior?.saved, at: new Date().toISOString() },
  ];
  const savedRows = next.filter((r) => r.saved);
  const drop = new Set(savedRows.slice(0, Math.max(0, savedRows.length - keepSaved)));
  try {
    store.setItem(key, JSON.stringify(next.filter((r) => !drop.has(r))));
  } catch {
    // Storage blocked (private mode): the server call is what matters.
  }
}

export function isStoredSaved(store: KeyValueStore | null, conversationId: string): boolean {
  return readStored(store).some((r) => r.conversationId === conversationId && r.saved);
}

export function unsavedStored(store: KeyValueStore | null): FinishedInterview[] {
  return readStored(store)
    .filter((r) => !r.saved)
    .map(({ studyId, conversationId, questionSnapshot }) => ({ studyId, conversationId, questionSnapshot }));
}

/** A keepalive request to the finishInterview route, which survives the page unloading where a normal one is dropped. */
export function finishRequest(apiUrl: string, entry: FinishedInterview): [string, RequestInit] {
  return [
    `${apiUrl}/operations/finish-interview`,
    {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      // Wasp operation routes take a superjson envelope; plain strings need no meta.
      body: JSON.stringify({ json: entry }),
    },
  ];
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The server read the entry and refused it (study deleted, conversation in another study), so resending can't help.
export function isFinalRejection(status: unknown): boolean {
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** finishInterview upserts on conversationId, so retrying and replaying are safe. */
export async function deliver(
  entry: FinishedInterview,
  send: (entry: FinishedInterview) => Promise<unknown>,
  store: KeyValueStore | null,
  wait: (ms: number) => Promise<void> = pause,
): Promise<boolean> {
  markStored(store, entry, false);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await send(entry);
      markStored(store, entry, true);
      return true;
    } catch (err) {
      console.warn('[interview] finishInterview failed', attempt + 1, err);
      if (isFinalRejection((err as { statusCode?: unknown } | null)?.statusCode)) {
        // Marked saved only to stop replaying it on every page load.
        markStored(store, entry, true);
        return false;
      }
      await wait(1000 * (attempt + 1));
    }
  }
  return false;
}

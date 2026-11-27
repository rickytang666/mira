import { config } from 'wasp/client';
import { finishInterview } from 'wasp/client/operations';
import {
  deliver,
  type FinishedInterview,
  finishRequest,
  isFinalRejection,
  isStoredSaved,
  type KeyValueStore,
  markStored,
  unsavedStored,
} from './finishedStore';

// Hands the finished conversation to the server, which enqueues processInterview.
// A local copy of every ID is kept until the server confirms it, and replayed on the next page load.

export type { FinishedInterview };

function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function reportFinished(entry: FinishedInterview): Promise<boolean> {
  return deliver(entry, finishInterview, browserStore());
}

/** For pagehide: the unsaved local copy stays behind in case the keepalive request is dropped too. */
export function reportFinishedOnUnload(entry: FinishedInterview) {
  const store = browserStore();
  if (isStoredSaved(store, entry.conversationId)) return;
  markStored(store, entry, false);
  const [url, init] = finishRequest(config.apiUrl, entry);
  fetch(url, init).then(
    (res) => {
      if (res.ok || isFinalRejection(res.status)) markStored(store, entry, true);
    },
    () => {},
  );
}

export async function replayUnfinished() {
  for (const entry of unsavedStored(browserStore())) await reportFinished(entry);
}

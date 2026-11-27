import { describe, expect, it, vi } from 'vitest';
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

function memoryStore(initial?: unknown): KeyValueStore & { raw: () => unknown } {
  let value: string | null = initial === undefined ? null : JSON.stringify(initial);
  return {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
    raw: () => (value ? JSON.parse(value) : null),
  };
}

const entry = (id: string): FinishedInterview => ({ studyId: 's1', conversationId: id, questionSnapshot: ['q1'] });
const noWait = () => Promise.resolve();

describe('finished interview store', () => {
  it('lists unsaved conversations for replay and drops them once saved', () => {
    const store = memoryStore();
    markStored(store, entry('a'), false);
    markStored(store, entry('b'), false);
    expect(unsavedStored(store).map((e) => e.conversationId)).toEqual(['a', 'b']);
    markStored(store, entry('a'), true);
    expect(unsavedStored(store)).toEqual([entry('b')]);
    expect(isStoredSaved(store, 'a')).toBe(true);
  });

  it('never marks a saved conversation unsaved again', () => {
    const store = memoryStore();
    markStored(store, entry('a'), true);
    markStored(store, entry('a'), false);
    expect(isStoredSaved(store, 'a')).toBe(true);
    expect(unsavedStored(store)).toEqual([]);
  });

  it('reads the older append-only format, treating any saved row as saved', () => {
    const store = memoryStore([
      { ...entry('a'), saved: false, at: '1' },
      { ...entry('a'), saved: true, at: '2' },
      { ...entry('b'), saved: false, at: '3' },
      { junk: true },
    ]);
    expect(unsavedStored(store)).toEqual([entry('b')]);
  });

  it('keeps every unsaved row while trimming old saved ones', () => {
    const store = memoryStore();
    markStored(store, entry('keep'), false);
    for (let i = 0; i < 30; i++) markStored(store, entry(`s${i}`), true);
    const rows = store.raw() as { saved: boolean }[];
    expect(rows.filter((r) => r.saved)).toHaveLength(20);
    expect(unsavedStored(store)).toEqual([entry('keep')]);
  });

  it('survives blocked or corrupt storage', () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => markStored(blocked, entry('a'), false)).not.toThrow();
    expect(unsavedStored(blocked)).toEqual([]);
    expect(unsavedStored(memoryStore('not json'))).toEqual([]);
    expect(unsavedStored(null)).toEqual([]);
  });
});

describe('deliver', () => {
  it('leaves an unsaved copy while the request is in flight, then marks it saved', async () => {
    const store = memoryStore();
    let resolve = () => {};
    const send = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const done = deliver(entry('a'), send, store, noWait);
    expect(unsavedStored(store)).toEqual([entry('a')]);
    resolve();
    expect(await done).toBe(true);
    expect(isStoredSaved(store, 'a')).toBe(true);
  });

  it('retries three times and keeps the copy for replay when the server is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore();
    const send = vi.fn(() => Promise.reject(new Error('offline')));
    expect(await deliver(entry('a'), send, store, noWait)).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    expect(unsavedStored(store)).toEqual([entry('a')]);
  });

  it('stops retrying and replaying once the server refuses the entry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore();
    const send = vi.fn(() => Promise.reject(Object.assign(new Error('Study not found.'), { statusCode: 404 })));
    expect(await deliver(entry('a'), send, store, noWait)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(unsavedStored(store)).toEqual([]);
  });

  it('keeps retrying on timeouts, rate limits, and server errors', () => {
    expect([404, 409, 400].every(isFinalRejection)).toBe(true);
    expect([408, 429, 500, 503, undefined].some(isFinalRejection)).toBe(false);
  });
});

describe('finishRequest', () => {
  it('posts a keepalive superjson envelope to the finishInterview route', () => {
    const [url, init] = finishRequest('http://api.test', entry('a'));
    expect(url).toBe('http://api.test/operations/finish-interview');
    expect(init).toMatchObject({ method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(init.body as string)).toEqual({ json: entry('a') });
  });
});

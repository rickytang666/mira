import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ELEVENLABS_TIMEOUT_MS, fetchConversation, fetchConversationAudio } from './elevenlabsClient';
import { createAudioCache, interviewAudio, parseRange } from './interviewAudio';

const audio = (size: number) => ({ bytes: Buffer.alloc(size), contentType: 'audio/mpeg' });

function audioResponse(bytes: Buffer, contentType = 'audio/mpeg') {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': contentType } });
}

beforeEach(() => {
  vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseRange', () => {
  it.each([
    ['bytes=0-', 1000, { start: 0, end: 999 }],
    ['bytes=100-199', 1000, { start: 100, end: 199 }],
    ['bytes=-500', 1000, { start: 500, end: 999 }],
    ['bytes=-5000', 1000, { start: 0, end: 999 }],
    ['bytes=900-5000', 1000, { start: 900, end: 999 }],
    ['bytes=999-999', 1000, { start: 999, end: 999 }],
    ['bytes=999999-', 1000, 'unsatisfiable'],
    ['bytes=1000-1200', 1000, 'unsatisfiable'],
    ['bytes=-0', 1000, 'unsatisfiable'],
    ['bytes=0-', 0, 'unsatisfiable'],
    [undefined, 1000, null],
    ['', 1000, null],
    ['bytes=-', 1000, null],
    ['bytes=abc-def', 1000, null],
    ['items=0-10', 1000, null],
    ['bytes=0-10,20-30', 1000, null],
    ['bytes=200-100', 1000, null],
  ] as const)('%s on %i bytes', (header, length, expected) => {
    expect(parseRange(header, length)).toEqual(expected);
  });
});

describe('createAudioCache', () => {
  it('shares one download between parallel misses', async () => {
    const load = vi.fn(async () => audio(10));
    const cache = createAudioCache(100, load);
    const [a, b] = await Promise.all([cache.get('i1', 'c1'), cache.get('i1', 'c1')]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('evicts least recently used recordings once total bytes pass the cap', async () => {
    const load = vi.fn(async (id: string) => audio(id === 'big' ? 60 : 40));
    const cache = createAudioCache(100, load);
    await cache.get('a', 'a');
    await cache.get('b', 'b');
    await cache.get('a', 'a'); // touch a so b is the oldest
    await cache.get('big', 'big');
    expect(cache.keys()).toEqual(['a', 'big']);
    expect(cache.totalBytes()).toBe(100);
    await cache.get('b', 'b');
    expect(load).toHaveBeenCalledTimes(4);
    expect(cache.totalBytes()).toBeLessThanOrEqual(100);
  });

  it('does not keep a recording larger than the cap', async () => {
    const cache = createAudioCache(100, async () => audio(150));
    await cache.get('huge', 'huge');
    expect(cache.keys()).toEqual([]);
    expect(cache.totalBytes()).toBe(0);
  });

  it('drops a failed download so the next request retries', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(audio(10));
    const cache = createAudioCache(100, load);
    await expect(cache.get('i1', 'c1')).rejects.toThrow('boom');
    await expect(cache.get('i1', 'c1')).resolves.toEqual(audio(10));
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('ElevenLabs fetches', () => {
  it('times out a hung request', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
      ),
    );
    const pending = fetchConversationAudio('conv1');
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(pending).rejects.toThrow('ElevenLabs audio conv1 timed out after 30 s');
    expect(timeout).toHaveBeenCalledWith(ELEVENLABS_TIMEOUT_MS);
  });

  it('rejects audio that is not audio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => audioResponse(Buffer.from('<html>'), 'text/html; charset=utf-8')),
    );
    await expect(fetchConversationAudio('conv1')).rejects.toThrow('returned text/html, not audio');
  });

  it('rejects a conversation that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })),
    );
    await expect(fetchConversation('conv1')).rejects.toThrow('returned text/html, not JSON');
  });

  it('returns audio bytes and passes the timeout signal', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => audioResponse(Buffer.from([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchConversationAudio('conv1');
    expect([...result.bytes]).toEqual([1, 2, 3]);
    expect(result.contentType).toBe('audio/mpeg');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('interviewAudio route', () => {
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

  async function call(interviewId: string, range?: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => audioResponse(bytes)),
    );
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200,
      body: undefined as Buffer | undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      end(body?: Buffer) {
        this.body = body;
      },
    };
    const req = { params: { interviewId }, headers: range ? { range } : {} };
    const context = {
      entities: { Interview: { findUnique: async () => ({ id: interviewId, conversationId: `conv-${interviewId}` }) } },
    };
    // biome-ignore lint/suspicious/noExplicitAny: Wasp's Express types are not needed for a stubbed request
    await interviewAudio(req as any, res as any, context as any);
    return { status: res.statusCode, headers, body: res.body };
  }

  it('serves the whole file without a Range header', async () => {
    const { status, headers, body } = await call('r1');
    expect(status).toBe(200);
    expect(headers['Content-Length']).toBe('1000');
    expect(body?.length).toBe(1000);
  });

  it('serves the last bytes for a suffix range', async () => {
    const { status, headers, body } = await call('r2', 'bytes=-500');
    expect(status).toBe(206);
    expect(headers['Content-Range']).toBe('bytes 500-999/1000');
    expect(headers['Content-Length']).toBe('500');
    expect(body?.equals(bytes.subarray(500))).toBe(true);
  });

  it('returns 416 for a start past the end', async () => {
    const { status, headers, body } = await call('r3', 'bytes=999999-');
    expect(status).toBe(416);
    expect(headers['Content-Range']).toBe('bytes */1000');
    expect(body).toBeUndefined();
  });
});

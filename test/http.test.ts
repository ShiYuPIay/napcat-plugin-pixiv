import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { applyConfig, resetConfig } from '../src/config.ts';
import { fetchJson, MAX_JSON_RESPONSE_BYTES } from '../src/services/http.ts';

const realFetch = globalThis.fetch;

function stubFetch(impl: (init: RequestInit | undefined) => Promise<Response>): void {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => impl(init)) as typeof fetch;
}

beforeEach(() => resetConfig());
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('a non-2xx status is reported with its code', async () => {
  stubFetch(async () => new Response('busy', { status: 503 }));
  await assert.rejects(fetchJson('Lolicon', 'https://example.test/x'), /Lolicon HTTP 503/);
});

test('a body that is not JSON is reported as invalid JSON', async () => {
  stubFetch(async () => new Response('<html>blocked</html>', { status: 200 }));
  await assert.rejects(fetchJson('Lolicon', 'https://example.test/x'), /Lolicon returned invalid JSON/);
});

test('a non-JSON content type is rejected before parsing its body', async () => {
  stubFetch(async () => new Response('<html>blocked</html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }));
  await assert.rejects(
    fetchJson('Lolicon', 'https://example.test/x'),
    /Lolicon returned an unexpected content type/,
  );
});

test('an oversized declared Content-Length is rejected before reading the body', async () => {
  let cancelled = false;
  stubFetch(async () => new Response(new ReadableStream<Uint8Array>({
    cancel() { cancelled = true; },
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(MAX_JSON_RESPONSE_BYTES + 1),
    },
  }));
  await assert.rejects(
    fetchJson('Lolicon', 'https://example.test/x'),
    /Lolicon response exceeds 2097152 byte limit/,
  );
  assert.equal(cancelled, true);
});

test('a streamed response is cancelled when its byte limit is exceeded', async () => {
  stubFetch(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_JSON_RESPONSE_BYTES + 1));
      controller.close();
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(
    fetchJson('Lolicon', 'https://example.test/x'),
    /Lolicon response exceeds 2097152 byte limit/,
  );
});

test('caller cancellation and the configured request timeout both reach fetch', async () => {
  const caller = new AbortController();
  stubFetch(async (init) => {
    assert.notEqual(init?.signal, caller.signal);
    caller.abort(new Error('caller cancelled'));
    assert.equal(init?.signal?.aborted, true);
    throw init?.signal?.reason;
  });
  await assert.rejects(
    fetchJson('Lolicon', 'https://example.test/x', { signal: caller.signal }),
    /Lolicon request failed: caller cancelled/,
  );
});

test('a timeout while reading the body is a request failure, not invalid JSON', async () => {
  stubFetch(async (init) => {
    const signal = init?.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason));
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  });
  applyConfig({ requestTimeoutMs: 1_000 });

  // AbortSignal.timeout() uses an unref'd timer; keep the event loop alive for it.
  const keepAlive = setTimeout(() => {}, 5_000);
  try {
    await assert.rejects(
      fetchJson('Lolicon', 'https://example.test/x'),
      (error: Error) =>
        /request failed/.test(error.message)
        && /timeout/i.test(error.message)
        && !/invalid JSON/.test(error.message),
    );
  } finally {
    clearTimeout(keepAlive);
  }
});

test('an empty body is reported as invalid JSON', async () => {
  stubFetch(async () => new Response('', { status: 200 }));
  await assert.rejects(fetchJson('Lolicon', 'https://example.test/x'), /Lolicon returned invalid JSON/);
});

test('JSON that is not an object is rejected', async () => {
  for (const body of ['null', '[]', '"text"', '42']) {
    stubFetch(async () => new Response(body, { status: 200 }));
    await assert.rejects(
      fetchJson('Lolicon', 'https://example.test/x'),
      /Lolicon returned an unexpected JSON payload/,
      body,
    );
  }
});

test('an API-level error field fails the request with the upstream message', async () => {
  const cases: Array<[unknown, RegExp]> = [
    ['bad key', /Lolicon API error: bad key/],
    [{ message: 'rate limited' }, /Lolicon API error: rate limited/],
    [{ user_message: '作品已删除' }, /Lolicon API error: 作品已删除/],
    [{}, /Lolicon API error: unknown error/],
    [true, /Lolicon API error: unknown error/],
  ];
  for (const [error, pattern] of cases) {
    stubFetch(async () => new Response(JSON.stringify({ error, data: [] }), { status: 200 }));
    await assert.rejects(fetchJson('Lolicon', 'https://example.test/x'), pattern, JSON.stringify(error));
  }
});

test('an empty or null error field is a successful response', async () => {
  for (const error of ['', null, false]) {
    stubFetch(async () => new Response(JSON.stringify({ error, data: [1] }), { status: 200 }));
    assert.deepEqual(await fetchJson('Lolicon', 'https://example.test/x'), { error, data: [1] });
  }
});

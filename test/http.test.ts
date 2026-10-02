import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { applyConfig, resetConfig } from '../src/config.ts';
import { fetchJson } from '../src/services/http.ts';

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

test('a timeout while reading the body is a request failure, not invalid JSON', async () => {
  // Headers arrive, then the body stalls until the request timeout aborts it.
  stubFetch(async (init) => {
    const signal = init?.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason));
      },
    });
    return new Response(body, { status: 200 });
  });
  applyConfig({ requestTimeoutMs: 1_000 });

  // AbortSignal.timeout() uses an unref'd timer; keep the event loop alive for it.
  const keepAlive = setTimeout(() => {}, 5_000);
  try {
    await assert.rejects(
      fetchJson('Lolicon', 'https://example.test/x'),
      (error: Error) =>
        /request failed/.test(error.message) &&
        /timeout/i.test(error.message) &&
        !/invalid JSON/.test(error.message),
    );
  } finally {
    clearTimeout(keepAlive);
  }
});

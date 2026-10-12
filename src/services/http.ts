import { getConfig } from '../config.ts';

export const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;

function describeApiError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error !== null && typeof error === 'object') {
    const { message, user_message: userMessage } = error as {
      message?: unknown;
      user_message?: unknown;
    };
    for (const text of [message, userMessage]) {
      if (typeof text === 'string' && text) return text;
    }
  }
  return 'unknown error';
}

function isJsonContentType(value: string): boolean {
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json'
    || mediaType === 'text/json'
    || mediaType === 'text/plain'
    || (mediaType.startsWith('application/') && mediaType.endsWith('+json'));
}

async function responseText(response: Response, label: string): Promise<string> {
  const contentType = response.headers.get('content-type');
  if (contentType && !isJsonContentType(contentType)) {
    try { await response.body?.cancel(); } catch { /* Ignore a concurrent stream failure. */ }
    const error = new Error(`${label} returned an unexpected content type`);
    error.name = 'UnexpectedContentTypeError';
    throw error;
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_JSON_RESPONSE_BYTES) {
    try { await response.body?.cancel(); } catch { /* Ignore a concurrent stream failure. */ }
    const error = new Error(`${label} response exceeds ${MAX_JSON_RESPONSE_BYTES} byte limit`);
    error.name = 'ResponseTooLargeError';
    throw error;
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* Ignore a concurrent stream failure. */ }
        const error = new Error(`${label} response exceeds ${MAX_JSON_RESPONSE_BYTES} byte limit`);
        error.name = 'ResponseTooLargeError';
        throw error;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Error && ['ResponseTooLargeError', 'UnexpectedContentTypeError'].includes(error.name)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} request failed: ${message}`);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchJson<T>(
  label: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(getConfig().requestTimeoutMs);
  const signal = init.signal ? AbortSignal.any([timeoutSignal, init.signal]) : timeoutSignal;
  let response: Response;

  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} request failed: ${message}`);
  }

  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* Ignore a concurrent stream failure. */ }
    throw new Error(`${label} HTTP ${response.status}`);
  }

  const text = await responseText(response, label);
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }

  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`${label} returned an unexpected JSON payload`);
  }

  // Lolicon reports failures as { error: "..." } with HTTP 200 and sends an
  // empty string on success; Pixiv-style endpoints use { error: { message } }.
  const { error } = json as { error?: unknown };
  if (error) {
    throw new Error(`${label} API error: ${describeApiError(error)}`);
  }

  return json as T;
}

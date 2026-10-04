import { getConfig } from '../config.ts';

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

export async function fetchJson<T>(
  label: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const timeout = getConfig().requestTimeoutMs;
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} request failed: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    // The timeout also covers reading the body, so a stalled or reset
    // connection lands here too and must not be reported as bad JSON.
    if (error instanceof SyntaxError) {
      throw new Error(`${label} returned invalid JSON`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} request failed: ${message}`);
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

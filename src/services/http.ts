import { getConfig } from '../config.ts';

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

  try {
    return await response.json() as T;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

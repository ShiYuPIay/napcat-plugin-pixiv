import type { LoggerLike } from '../types.ts';

const TAG = '[napcat-plugin-pixiv]';
let boundLogger: LoggerLike | null = null;
const URL_IN_TEXT = /\b(?:https?|wss?):\/\/[^\s<>"'`]+/gi;
const SECRET_FIELDS = /(["']?(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|client[_-]?secret|secret|password|passwd|passphrase|pwd|authorization|cookie|set-cookie|session|credential|bearer|jwt|signature|sig)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi;
const SECRET_PHRASES = /(access[_\s-]?token|refresh[_\s-]?token|token|api[_\s-]?key|client[_\s-]?secret|password|passwd|passphrase|authorization|cookie|session|credential)\s+(?:is\s+)?([A-Za-z0-9._~+/=-]{8,})/gi;

export function redactUrlForLog(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = 'redacted';
    if (url.password) url.password = 'redacted';
    for (const key of new Set(url.searchParams.keys())) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (/(?:token|secret|password|passwd|passphrase|pwd|authorization|auth|key|cookie|session|credential|bearer|jwt|signature|sig)$/.test(normalized)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    // URL fragments are not sent to the server and may contain OAuth credentials.
    if (url.hash) url.hash = '';
    return url.toString();
  } catch {
    return '[invalid URL]';
  }
}

export function redactSensitiveText(value: string): string {
  let safe = value.replace(URL_IN_TEXT, (url) => redactUrlForLog(url));
  safe = safe.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]');
  safe = safe.replace(/\b((?:authorization|set-cookie|cookie)\s*[:=]\s*)[^\r\n]+/gi, '$1[redacted]');
  safe = safe.replace(SECRET_FIELDS, '$1[redacted]');
  return safe.replace(SECRET_PHRASES, '$1 [redacted]');
}

export function bindLogger(logger?: LoggerLike | null): void {
  boundLogger = logger ?? null;
}

function emit(level: 'info' | 'warn' | 'error', message: string): void {
  const logger = boundLogger;
  const safeMessage = redactSensitiveText(message);
  if (logger) {
    const fn =
      (level === 'info' ? logger.info ?? logger.log : logger[level]) ??
      logger.log;
    if (typeof fn === 'function') {
      fn.call(logger, safeMessage);
      return;
    }
  }

  const fallback =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    console.log;
  fallback(`${TAG} ${safeMessage}`);
}

export const log = {
  info: (message: string) => emit('info', message),
  warn: (message: string) => emit('warn', message),
  error: (message: string) => emit('error', message),
};

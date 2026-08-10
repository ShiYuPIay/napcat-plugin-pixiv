import type { LoggerLike } from '../types.ts';

const TAG = '[napcat-plugin-pixiv]';
let boundLogger: LoggerLike | null = null;

export function bindLogger(logger?: LoggerLike | null): void {
  boundLogger = logger ?? null;
}

function emit(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
  const logger = boundLogger;
  if (logger) {
    const fn =
      (level === 'info' ? logger.info ?? logger.log : logger[level]) ??
      logger.log;
    if (typeof fn === 'function') {
      fn.call(logger, message);
      return;
    }
  }

  const fallback =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    level === 'debug' ? console.debug :
    console.log;
  fallback(`${TAG} ${message}`);
}

export const log = {
  info: (message: string) => emit('info', message),
  warn: (message: string) => emit('warn', message),
  error: (message: string) => emit('error', message),
  debug: (message: string) => emit('debug', message),
};

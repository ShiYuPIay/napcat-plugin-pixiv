const TAG = '[Plugin: napcat-plugin-pixiv]';

// NapCat provides ctx.logger in newer versions — adopt it so log lines carry
// NapCat's own [Plugin: X] prefix. Until then, fall back to colored console.
let napcatLogger = null;

export function bindLogger(logger) {
  if (logger && typeof logger.info === 'function') napcatLogger = logger;
}

function emit(level, consoleFn, color, msg) {
  if (napcatLogger && typeof napcatLogger[level] === 'function') {
    napcatLogger[level](msg);
    return;
  }
  consoleFn(`${color}[${level.toUpperCase()}] ${TAG} ${msg}\x1b[0m`);
}

export const log = {
  info:  msg => emit('info',  console.log,   '\x1b[90m', msg),
  warn:  msg => emit('warn',  console.warn,  '\x1b[33m', msg),
  error: msg => emit('error', console.error, '\x1b[31m', msg),
};

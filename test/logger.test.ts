import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindLogger, log, redactUrlForLog } from '../src/core/logger.ts';

test('redactUrlForLog removes URL credentials and sensitive query values', () => {
  const result = redactUrlForLog(
    'wss://alice:password-value@example.com:3001/onebot?access_token=token-value&api_key=key-value&mode=universal',
  );

  assert.doesNotMatch(result, /alice|password-value|token-value|key-value/);
  assert.match(result, /example\.com:3001\/onebot/);
  assert.match(result, /mode=universal/);
});

test('redactUrlForLog never returns malformed URL input verbatim', () => {
  assert.equal(redactUrlForLog('not a URL?access_token=secret-value'), '[invalid URL]');
});

test('the logger redacts credentials embedded in URLs, headers and error text', () => {
  const messages: string[] = [];
  bindLogger({ log: (message) => messages.push(message) });
  try {
    log.error(
      'connect failed: wss://bot.example/ws?access_token=url-secret; Authorization: Bearer bearer-secret; cookie: sid=cookie-secret; password=pass-secret\nAuthorization: Basic basic-secret',
    );
    log.warn('upstream error: Invalid token unstructured-secret-value');
  } finally {
    bindLogger(null);
  }

  assert.equal(messages.length, 2);
  assert.doesNotMatch(messages.join('\n'), /url-secret|bearer-secret|cookie-secret|pass-secret|basic-secret|unstructured-secret-value/);
  assert.match(messages[0], /bot\.example\/ws/);
});

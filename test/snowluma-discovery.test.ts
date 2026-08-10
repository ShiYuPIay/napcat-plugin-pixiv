import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEffectiveWsServer } from '../src/runtime/snowluma-discovery.ts';

test('account overlay inherits the global ws accessToken by adapter name', () => {
  const globalConfig = {
    networks: {
      wsServers: [{
        name: 'ws-default',
        enabled: true,
        host: '127.0.0.1',
        port: 3001,
        path: '/',
        role: 'Universal',
        accessToken: 'global-secret',
      }],
    },
  };
  const accountConfig = {
    mode: 'overlay',
    networks: {
      wsServers: [{
        name: 'ws-default',
        host: '0.0.0.0',
      }],
    },
  };

  const result = resolveEffectiveWsServer(globalConfig, accountConfig);
  assert.ok(result);
  assert.equal(result.accessToken, 'global-secret');
  assert.equal(result.host, '0.0.0.0');
  assert.equal(result.port, 3001);
  assert.equal(result.role, 'Universal');
});

test('snapshot account config does not accidentally inherit a global token', () => {
  const globalConfig = {
    networks: {
      wsServers: [{
        name: 'ws-default',
        port: 3001,
        role: 'Universal',
        accessToken: 'global-secret',
      }],
    },
  };
  const accountConfig = {
    mode: 'snapshot',
    networks: {
      wsServers: [{
        name: 'ws-default',
        port: 3001,
        role: 'Universal',
        accessToken: '',
      }],
    },
  };

  const result = resolveEffectiveWsServer(globalConfig, accountConfig);
  assert.ok(result);
  assert.equal(result.accessToken, '');
});

test('Api-only ws server is rejected because the plugin also needs message events', () => {
  const result = resolveEffectiveWsServer({
    networks: {
      wsServers: [{
        name: 'api-only',
        port: 3001,
        role: 'Api',
        accessToken: 'x',
      }],
    },
  });
  assert.equal(result, null);
});

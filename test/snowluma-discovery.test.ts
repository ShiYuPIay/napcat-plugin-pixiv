import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEffectiveWsServer } from '../src/runtime/snowluma-discovery.ts';

test('account overlay without wsServers keeps the global ws server and token', () => {
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
      httpServers: [],
    },
  };

  const result = resolveEffectiveWsServer(globalConfig, accountConfig);
  assert.ok(result);
  assert.equal(result.accessToken, 'global-secret');
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.port, 3001);
});

test('same-name account ws adapter replaces the global adapter rather than field-merging it', () => {
  const globalConfig = {
    networks: {
      wsServers: [{
        name: 'ws-default',
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
        port: 3101,
        path: '/account',
        role: 'Universal',
      }],
    },
  };

  const result = resolveEffectiveWsServer(globalConfig, accountConfig);
  assert.ok(result);
  assert.equal(result.accessToken, '');
  assert.equal(result.host, '0.0.0.0');
  assert.equal(result.port, 3101);
  assert.equal(result.path, '/account');
});

test('invalid same-name account adapter is ignored and does not erase the valid global adapter', () => {
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
  assert.equal(result.port, 3001);
});

test('snapshot account config does not include the global token', () => {
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

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import {
  isLoopbackUrl,
  resolveEffectiveWsServer,
  resolveSnowLumaConnection,
} from '../src/runtime/snowluma-discovery.ts';

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

test('only loopback hosts count as local', () => {
  for (const url of ['ws://localhost:3001', 'ws://127.0.0.1:3001/', 'ws://127.1.2.3/', 'ws://[::1]:3001/']) {
    assert.equal(isLoopbackUrl(url), true, url);
  }
  for (const url of [
    'ws://remote.example:3001/', 'ws://10.0.0.5:3001/', 'ws://0.0.0.0:3001/',
    'ws://127.0.0.1.evil.example/', 'ws://localhost.evil.example/', 'not a url', '',
  ]) {
    assert.equal(isLoopbackUrl(url), false, url);
  }
});

// A stand-in `docker` that answers the two calls discovery makes, with a known token.
const FAKE_DOCKER = `#!/usr/bin/env node
const [command] = process.argv.slice(2);
if (command === 'exec') {
  process.stdout.write(JSON.stringify({
    configDir: '/app/data/config',
    global: { networks: { wsServers: [{ name: 'ws-default', port: 3001, path: '/', role: 'Universal', accessToken: 'local-secret' }] } },
    accounts: [],
  }));
} else if (command === 'port') {
  process.stdout.write('0.0.0.0:3001\\n');
} else {
  process.exit(1);
}
`;

function withFakeDocker(run: () => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'fake-docker-'));
  const bin = join(dir, 'docker');
  writeFileSync(bin, FAKE_DOCKER);
  chmodSync(bin, 0o755);
  const realPath = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${realPath ?? ''}`;
  try {
    run();
  } finally {
    process.env.PATH = realPath;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('connection resolution only lends the Docker token to local URLs', { skip: process.platform === 'win32' }, () => {
  withFakeDocker(() => {
    const discovered = resolveSnowLumaConnection({ env: {} });
    assert.equal(discovered.url, 'ws://127.0.0.1:3001/');
    assert.equal(discovered.accessToken, 'local-secret');

    const localUrl = resolveSnowLumaConnection({ env: { ONEBOT_WS_URL: 'ws://127.0.0.1:3101/custom' } });
    assert.equal(localUrl.url, 'ws://127.0.0.1:3101/custom');
    assert.equal(localUrl.accessToken, 'local-secret');

    const remoteUrl = resolveSnowLumaConnection({ env: { ONEBOT_WS_URL: 'ws://remote.example:3001/' } });
    assert.equal(remoteUrl.url, 'ws://remote.example:3001/');
    assert.equal(remoteUrl.accessToken, '', 'the local token must not be sent to another host');

    const remoteWithToken = resolveSnowLumaConnection({
      env: { NAPCAT_WS_URL: 'ws://remote.example:3001/', NAPCAT_WS_TOKEN: 'remote-secret' },
    });
    assert.equal(remoteWithToken.accessToken, 'remote-secret');

    const tokenOnly = resolveSnowLumaConnection({ env: { ONEBOT_ACCESS_TOKEN: 'explicit' } });
    assert.equal(tokenOnly.url, 'ws://127.0.0.1:3001/');
    assert.equal(tokenOnly.accessToken, 'explicit');
  });
});

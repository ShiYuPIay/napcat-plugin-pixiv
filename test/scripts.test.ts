import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceInstaller = resolve(repositoryRoot, 'scripts/ensure-snowluma-service.sh');

test('systemd installer rejects newline injection in container and QQ values', () => {
  for (const [key, value, expected] of [
    ['SNOWLUMA_CONTAINER', 'snowluma\nEnvironment=EVIL=1', 'SNOWLUMA_CONTAINER'],
    ['SNOWLUMA_UIN', '12345\nEnvironment=EVIL=1', 'SNOWLUMA_UIN'],
  ]) {
    const result = spawnSync('bash', [serviceInstaller], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, [key]: value },
    });

    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(expected));
    assert.doesNotMatch(result.stderr, /缺少命令|root 权限/);
  }
});

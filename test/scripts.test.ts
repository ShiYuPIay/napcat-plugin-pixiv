import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { boundedRetryValue } from '../scripts/doctor-snowluma-retry.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceInstaller = resolve(repositoryRoot, 'scripts/ensure-snowluma-service.sh');
const migrationScript = resolve(repositoryRoot, 'scripts/migrate-legacy-snowluma.mjs');

test('SnowLuma doctor retry settings reject values that overflow or exceed safe limits', () => {
  assert.equal(boundedRetryValue(undefined, 6, 1, 20), 6);
  assert.equal(boundedRetryValue('12', 6, 1, 20), 12);
  assert.equal(boundedRetryValue('0', 6, 1, 20), 1);
  assert.equal(boundedRetryValue('21', 6, 1, 20), 6);
  assert.equal(boundedRetryValue('999999999999999999999999999999999999', 6, 1, 20), 6);
  assert.equal(boundedRetryValue('Infinity', 6, 1, 20), 6);
  assert.equal(boundedRetryValue('-1', 6, 1, 20), 6);
});

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

test('systemd runtime uses a dedicated account, systemd credentials, and a protected release', () => {
  const source = readFileSync(serviceInstaller, 'utf8');
  assert.match(source, /User=\$SERVICE_USER/);
  assert.match(source, /LoadCredential=onebot-connection:\$CREDENTIAL_FILE/);
  assert.match(source, /Environment=ONEBOT_CONNECTION_FILE=%d\/onebot-connection/);
  assert.match(source, /ProtectSystem=strict/);
  assert.match(source, /ExecStart=\$RELEASE_DIR\/runtime\/node \$RELEASE_DIR\/dist\/snowluma\.mjs\n/);
  assert.doesNotMatch(source, /docker\.sock/);
});

test('legacy migration failure stops deployment instead of returning success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fake-migration-docker-'));
  const docker = join(dir, 'docker');
  writeFileSync(docker, `#!/usr/bin/env node
const mode = process.env.FAKE_DOCKER_MODE;
const [command] = process.argv.slice(2);
if (command === 'exec') {
  if (mode === 'exec-fails') process.exit(9);
  process.stdout.write(JSON.stringify({ changed: mode === 'restart-fails' ? [{ file: '/app/config/onebot.json', backup: '/app/config/onebot.json.bak' }] : [], warning: mode === 'no-config' ? 'onebot config directory not found' : undefined }));
} else if (command === 'restart' && mode === 'restart-fails') {
  process.exit(7);
}
`);
  chmodSync(docker, 0o755);
  const env = { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH ?? ''}` };
  try {
    const readFailed = spawnSync(process.execPath, [migrationScript], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...env, FAKE_DOCKER_MODE: 'exec-fails' },
    });
    assert.notEqual(readFailed.status, 0);
    assert.match(readFailed.stderr, /迁移失败，部署已中止/);

    const restartFailed = spawnSync(process.execPath, [migrationScript], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...env, FAKE_DOCKER_MODE: 'restart-fails' },
    });
    assert.notEqual(restartFailed.status, 0);
    assert.match(restartFailed.stderr, /迁移失败，部署已中止/);

    const noConfig = spawnSync(process.execPath, [migrationScript], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...env, FAKE_DOCKER_MODE: 'no-config' },
    });
    assert.equal(noConfig.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy config migration preserves file metadata and rolls back a partial multi-file commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-metadata-'));
  const docker = join(dir, 'docker');
  const successDir = join(dir, 'success');
  const rollbackDir = join(dir, 'rollback');
  const config = (uin: string) => JSON.stringify({ networks: { wsClients: [{ name: 'Pixiv', enabled: true, uin }] } }, null, 2);
  writeFileSync(docker, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const mode = process.env.FAKE_DOCKER_MODE;
const [command] = process.argv.slice(2);
if (command === 'exec') {
  let script = process.argv[6].replace("'/app/data/config'", JSON.stringify(process.env.FAKE_CONFIG_DIR));
  if (mode === 'rename-fails') {
    script = script.replace('    fs.renameSync(item.temp, item.file);', "    if (item.file.endsWith('onebot_123.json')) throw new Error('injected rename failure');\\n    fs.renameSync(item.temp, item.file);");
  }
  const result = spawnSync(process.execPath, ['-e', script, process.argv[7] || ''], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status ?? 1);
}
`);
  chmodSync(docker, 0o755);
  const env = {
    ...process.env,
    PATH: `${dir}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_DOCKER_MODE: 'success',
  };
  try {
    mkdirSync(successDir);
    const file = join(successDir, 'onebot.json');
    writeFileSync(file, config('global'), { mode: 0o640 });
    chmodSync(file, 0o640);
    const before = statSync(file);

    const migrated = spawnSync(process.execPath, [migrationScript], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...env, FAKE_CONFIG_DIR: successDir },
    });
    assert.equal(migrated.status, 0, migrated.stderr);
    const after = statSync(file);
    assert.equal(after.uid, before.uid);
    assert.equal(after.gid, before.gid);
    assert.equal(after.mode & 0o7777, before.mode & 0o7777);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).networks.wsClients[0].enabled, false);
    const backup = readdirSync(successDir).find((name) => name.startsWith('onebot.json.bak-napcat-plugin-pixiv-'));
    assert.ok(backup, 'the original config is retained as a backup');
    assert.equal(statSync(join(successDir, backup)).mode & 0o7777, before.mode & 0o7777);

    mkdirSync(rollbackDir);
    const files = ['onebot.json', 'onebot_123.json'];
    const snapshots = files.map((name) => {
      const path = join(rollbackDir, name);
      writeFileSync(path, config(name), { mode: 0o640 });
      chmodSync(path, 0o640);
      return { path, content: readFileSync(path, 'utf8'), stat: statSync(path) };
    });
    const failedCommit = spawnSync(process.execPath, [migrationScript], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...env, FAKE_DOCKER_MODE: 'rename-fails', FAKE_CONFIG_DIR: rollbackDir },
    });
    assert.notEqual(failedCommit.status, 0);
    for (const snapshot of snapshots) {
      assert.equal(readFileSync(snapshot.path, 'utf8'), snapshot.content);
      const restored = statSync(snapshot.path);
      assert.equal(restored.uid, snapshot.stat.uid);
      assert.equal(restored.gid, snapshot.stat.gid);
      assert.equal(restored.mode & 0o7777, snapshot.stat.mode & 0o7777);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

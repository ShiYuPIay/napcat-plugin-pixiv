import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { plugin_cleanup, plugin_init } from '../src/index.ts';
import { applyConfig, resetConfig } from '../src/config.ts';
import { checkCooldown, clearCooldowns } from '../src/core/cooldown.ts';
import type { NapCatPluginContext } from '../src/napcat-plugin-types.ts';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string | undefined> };

test('routine check has no implicit SnowLuma postcheck and deployment stays explicit', () => {
  assert.ok(packageJson.scripts.check);
  assert.equal(packageJson.scripts.postcheck, undefined);
  assert.match(packageJson.scripts['deploy:snowluma'] ?? '', /deploy-snowluma\.sh/);
  assert.equal(existsSync(new URL('../scripts/postcheck-snowluma.mjs', import.meta.url)), false);
});

test('plugin init and cleanup reset cooldown state', async () => {
  const configApi = {
    boolean: (...args: unknown[]) => args,
    text: (...args: unknown[]) => args,
    select: (...args: unknown[]) => args,
    number: (...args: unknown[]) => args,
    combine: (...args: unknown[]) => args,
  };
  const logger = { info() {}, warn() {}, error() {} };
  const ctx = { NapCatConfig: configApi, logger, configPath: null } as unknown as NapCatPluginContext;

  clearCooldowns();
  resetConfig();
  applyConfig({ rateLimitSecs: 60 });
  assert.equal(checkCooldown('user-1', 100_000), 0);
  assert.equal(checkCooldown('user-1', 100_001), 60);

  await plugin_cleanup!(ctx);
  assert.equal(checkCooldown('user-1', 100_001), 0, 'cleanup clears state from the unloaded instance');

  assert.equal(checkCooldown('user-2', 200_000), 0);
  await plugin_init(ctx);
  assert.equal(checkCooldown('user-2', 200_001), 0, 'init does not inherit stale module-level state');
  await plugin_cleanup!(ctx);
  resetConfig();
});

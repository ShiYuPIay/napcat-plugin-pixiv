import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string | undefined> };

test('routine check has no implicit SnowLuma postcheck and deployment stays explicit', () => {
  assert.ok(packageJson.scripts.check);
  assert.equal(packageJson.scripts.postcheck, undefined);
  assert.match(packageJson.scripts['deploy:snowluma'] ?? '', /deploy-snowluma\.sh/);
  assert.equal(existsSync(new URL('../scripts/postcheck-snowluma.mjs', import.meta.url)), false);
});

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { PluginConfig } from './types.ts';

export const DEFAULT_CONFIG: Readonly<PluginConfig> = Object.freeze({
  enabled: true,
  prefix: '#pixiv',
  r18: 0,
  num: 5,
  excludeAI: true,
  enableForward: true,
  rateLimitSecs: 15,
  blockedKeywords: '萝莉,loli,ロリ,正太,shota,ショタ,未成年,幼女,小学生,乱伦',
  adminUsers: '',
  loliconApi: 'https://api.lolicon.app/setu/v2',
  hibiApi: 'https://api.obfs.dev/api/pixiv',
  imageProxy: 'i.pixiv.re',
  requestTimeoutMs: 8_000,
});

let currentConfig: PluginConfig = { ...DEFAULT_CONFIG };
let configFilePath: string | null = null;
let environmentSource: NodeJS.ProcessEnv | null = null;

// Number() would turn true, [1], null and '' into 1, 1, 0 and 0, so only real
// numbers and plain decimal strings (" 7 " is fine) count as integers.
function toInteger(value: unknown): number | null {
  let parsed = Number.NaN;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) {
    parsed = Number(value.trim());
  }
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'on', 'yes', '是', '开'].includes(normalized)) return true;
  if (['false', '0', 'off', 'no', '否', '关'].includes(normalized)) return false;
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const parsed = toInteger(value);
  return parsed !== null && parsed >= min && parsed <= max ? parsed : null;
}

function validHttpUrl(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return text.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function validPrefix(value: unknown): string | null {
  const text = stringValue(value);
  return text && text.length <= 32 ? text : null;
}

function validImageProxy(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const host = text.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? host : null;
}

function validAdminUsers(value: unknown): string | null {
  let text: string;
  if (typeof value === 'string') {
    text = value.trim();
  } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    text = String(value);
  } else {
    return null;
  }

  if (!text) return '';
  return text.split(/[,，\s]+/).every((id) => /^\d{1,20}$/.test(id)) ? text : null;
}

type ConfigKey = keyof PluginConfig;
type Validator<K extends ConfigKey = ConfigKey> = (value: unknown) => PluginConfig[K] | null;

const validators: { [K in ConfigKey]: Validator<K> } = {
  enabled: toBoolean,
  prefix: validPrefix,
  r18: (value) => boundedInteger(value, 0, 2) as PluginConfig['r18'] | null,
  num: (value) => boundedInteger(value, 1, 20),
  excludeAI: toBoolean,
  enableForward: toBoolean,
  rateLimitSecs: (value) => boundedInteger(value, 0, 86_400),
  blockedKeywords: (value) => typeof value === 'string' ? value : null,
  adminUsers: validAdminUsers,
  loliconApi: validHttpUrl,
  hibiApi: validHttpUrl,
  imageProxy: validImageProxy,
  requestTimeoutMs: (value) => boundedInteger(value, 1_000, 60_000),
};

type ConfigValidation = {
  config: PluginConfig;
  applied: Partial<PluginConfig>;
  invalid: string[];
};

function validateConfig(
  partial: Record<string, unknown> | null | undefined,
  base: PluginConfig,
): ConfigValidation {
  const config = { ...base };
  const applied: Partial<PluginConfig> = {};
  const invalid: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(partial ?? {})) {
    if (!Object.hasOwn(validators, rawKey)) {
      invalid.push(rawKey);
      continue;
    }

    const key = rawKey as ConfigKey;
    const value = validators[key](rawValue);
    if (value === null) {
      invalid.push(rawKey);
      continue;
    }

    (config as Record<ConfigKey, PluginConfig[ConfigKey]>)[key] = value;
    (applied as Record<ConfigKey, PluginConfig[ConfigKey]>)[key] = value;
  }

  return { config, applied, invalid };
}

export function getConfig(): Readonly<PluginConfig> {
  return currentConfig;
}

export function resetConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
  environmentSource = null;
}

export function setConfigPath(path?: string | null): void {
  configFilePath = path ? resolve(path) : null;
}

export function applyConfig(
  partial: Record<string, unknown> | null | undefined,
): { applied: Partial<PluginConfig>; invalid: string[] } {
  const result = validateConfig(partial, currentConfig);
  currentConfig = result.config;
  return { applied: result.applied, invalid: result.invalid };
}

type EnvironmentOverrides = {
  values: Record<string, unknown>;
  variables: Map<string, string>;
};

function environmentOverrides(env: NodeJS.ProcessEnv): EnvironmentOverrides {
  const values: Record<string, unknown> = {};
  const variables = new Map<string, string>();
  const mappings: Array<[keyof PluginConfig, string]> = [
    ['enabled', 'PIXIV_ENABLED'],
    ['prefix', 'PIXIV_PREFIX'],
    ['r18', 'PIXIV_R18'],
    ['num', 'PIXIV_NUM'],
    ['excludeAI', 'PIXIV_EXCLUDE_AI'],
    ['enableForward', 'PIXIV_ENABLE_FORWARD'],
    ['rateLimitSecs', 'PIXIV_COOLDOWN'],
    ['blockedKeywords', 'PIXIV_BLOCKED_KEYWORDS'],
    ['adminUsers', 'PIXIV_ADMIN_USERS'],
    ['loliconApi', 'PIXIV_LOLICON_API'],
    ['hibiApi', 'PIXIV_HIBI_API'],
    ['imageProxy', 'PIXIV_IMAGE_PROXY'],
    ['requestTimeoutMs', 'PIXIV_REQUEST_TIMEOUT_MS'],
  ];

  for (const [key, variable] of mappings) {
    if (env[variable] === undefined) continue;
    values[key] = env[variable];
    variables.set(key, variable);
  }
  return { values, variables };
}

function applyEnvironmentTo(
  base: PluginConfig,
  env: NodeJS.ProcessEnv,
): ConfigValidation {
  const { values, variables } = environmentOverrides(env);
  const result = validateConfig(values, base);
  return {
    ...result,
    invalid: result.invalid.map((key) => variables.get(key) ?? key),
  };
}

function isConfigObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function loadConfig(path = configFilePath): { applied: Partial<PluginConfig>; invalid: string[] } | null {
  if (!path) return null;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { applied: {}, invalid: ['<config-json>'] };
  }
  if (!isConfigObject(parsed)) return { applied: {}, invalid: ['<config-json>'] };

  const fileResult = validateConfig(parsed, { ...DEFAULT_CONFIG });
  const environmentResult = environmentSource
    ? applyEnvironmentTo(fileResult.config, environmentSource)
    : null;
  currentConfig = environmentResult?.config ?? fileResult.config;
  return {
    applied: { ...fileResult.applied, ...environmentResult?.applied },
    invalid: [...fileResult.invalid, ...(environmentResult?.invalid ?? [])],
  };
}

export function saveConfig(
  partial: Partial<PluginConfig> = currentConfig,
  path = configFilePath,
): boolean {
  if (!path) return false;

  const checked = validateConfig(partial as Record<string, unknown>, currentConfig);
  if (checked.invalid.length > 0) return false;

  let existing: Record<string, unknown> = {};
  try {
    if (existsSync(path)) {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!isConfigObject(parsed)) return false;
      existing = parsed;
    }
  } catch {
    // Do not overwrite an existing unreadable or malformed configuration.
    return false;
  }

  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | null = null;
  try {
    mkdirSync(dirname(path), { recursive: true });
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify({ ...existing, ...checked.applied }, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, path);
    return true;
  } catch {
    if (descriptor !== null) {
      try { closeSync(descriptor); } catch { /* Ignore cleanup errors. */ }
    }
    try { unlinkSync(temporaryPath); } catch { /* The temp file may not exist. */ }
    return false;
  }
}

type ReloadResult =
  | { ok: true; invalid: string[] }
  | { ok: false; reason: string };

/**
 * Re-reads the config file the way startup does: defaults, then the file, then
 * PIXIV_* overrides. An unusable file leaves the running configuration untouched.
 */
export function reloadConfig(): ReloadResult {
  if (!configFilePath) return { ok: false, reason: '未设置配置文件路径' };

  let file: unknown;
  try {
    file = JSON.parse(readFileSync(configFilePath, 'utf8')) as unknown;
  } catch {
    return { ok: false, reason: '配置文件不存在或不是有效 JSON，已保留当前配置' };
  }
  if (!isConfigObject(file)) {
    return { ok: false, reason: '配置文件必须是 JSON 对象，已保留当前配置' };
  }

  const fileResult = validateConfig(file, { ...DEFAULT_CONFIG });
  const environmentResult = environmentSource
    ? applyEnvironmentTo(fileResult.config, environmentSource)
    : null;
  currentConfig = environmentResult?.config ?? fileResult.config;
  return { ok: true, invalid: [...fileResult.invalid, ...(environmentResult?.invalid ?? [])] };
}

/** Applies PIXIV_* overrides and returns the names of the variables that were rejected. */
export function applyEnvironment(env: NodeJS.ProcessEnv = process.env): string[] {
  environmentSource = env;
  const result = applyEnvironmentTo(currentConfig, env);
  currentConfig = result.config;
  return result.invalid;
}

export function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export function getBlockedKeywords(): string[] {
  return currentConfig.blockedKeywords
    .split(/[,，]/)
    .map(normalizeText)
    .filter(Boolean);
}

export function isBlockedText(value: unknown): boolean {
  const text = normalizeText(value);
  return Boolean(text) && getBlockedKeywords().some((word) => text.includes(word));
}

export function getAdminUsers(): string[] {
  return currentConfig.adminUsers
    .split(/[,，\s]+/)
    .map((value) => value.trim())
    .filter((value) => /^\d{1,20}$/.test(value));
}

export function isAdmin(userId: unknown): boolean {
  return getAdminUsers().includes(String(userId ?? ''));
}

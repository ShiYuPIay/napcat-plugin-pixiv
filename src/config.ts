import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

function toInteger(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
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
  adminUsers: (value) =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : null,
  loliconApi: validHttpUrl,
  hibiApi: validHttpUrl,
  imageProxy: validImageProxy,
  requestTimeoutMs: (value) => boundedInteger(value, 1_000, 60_000),
};

export function getConfig(): Readonly<PluginConfig> {
  return currentConfig;
}

export function resetConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

export function setConfigPath(path?: string | null): void {
  configFilePath = path ? resolve(path) : null;
}

export function getConfigPath(): string | null {
  return configFilePath;
}

export function applyConfig(
  partial: Record<string, unknown> | null | undefined,
): { applied: Partial<PluginConfig>; invalid: string[] } {
  const applied: Partial<PluginConfig> = {};
  const invalid: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(partial ?? {})) {
    if (!(rawKey in validators)) {
      invalid.push(rawKey);
      continue;
    }

    const key = rawKey as ConfigKey;
    const value = validators[key](rawValue);
    if (value === null) {
      invalid.push(rawKey);
      continue;
    }

    (currentConfig as Record<ConfigKey, PluginConfig[ConfigKey]>)[key] = value;
    (applied as Record<ConfigKey, PluginConfig[ConfigKey]>)[key] = value;
  }

  return { applied, invalid };
}

export function loadConfig(path = configFilePath): { applied: Partial<PluginConfig>; invalid: string[] } | null {
  if (!path) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return applyConfig(parsed);
  } catch {
    return { applied: {}, invalid: ['<config-json>'] };
  }
}

export function saveConfig(
  partial: Partial<PluginConfig> = currentConfig,
  path = configFilePath,
): boolean {
  if (!path) return false;

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    // New file, or invalid old file: write a clean configuration.
  }

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...existing, ...partial }, null, 2)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function applyEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const mapped: Record<string, unknown> = {};
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
    if (env[variable] !== undefined) mapped[key] = env[variable];
  }
  applyConfig(mapped);
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
    .filter((value) => /^\d+$/.test(value));
}

export function isAdmin(userId: unknown): boolean {
  return getAdminUsers().includes(String(userId ?? ''));
}

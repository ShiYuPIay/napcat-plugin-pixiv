import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Defaults & live config ────────────────────────────────────────────────────

export const DEFAULTS = Object.freeze({
  r18:             0,     // 0=非R18, 1=仅R18, 2=混合
  num:             5,     // 每次返回图片数 (1-10)
  excludeAI:       true,  // 排除 AI 生成作品
  enableForward:   true,  // 优先合并转发
  rateLimitSecs:   15,    // 每人冷却秒数 (0=关闭)
  // 屏蔽关键词（逗号分隔）：同时匹配搜索词与作品标签/标题
  blockedKeywords: '萝莉,loli,ロリ,正太,shota,ショタ,未成年,幼女,小学生,乱伦',
  adminUsers:      '',    // 管理员 QQ 号（逗号分隔），可使用 #pixiv设置
});

export const Config = { ...DEFAULTS };

/** Test helper: restore all defaults. */
export function resetConfig() {
  Object.assign(Config, DEFAULTS);
}

// ── Validation ────────────────────────────────────────────────────────────────

const toInt = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toBool = v => {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'on', '开', '是', 'yes'].includes(s)) return true;
  if (['false', '0', 'off', '关', '否', 'no'].includes(s)) return false;
  return null;
};

const inRange = (n, min, max) => (n !== null && n >= min && n <= max ? n : null);

const VALIDATORS = {
  r18:             v => inRange(toInt(v), 0, 2),
  num:             v => inRange(toInt(v), 1, 10),
  excludeAI:       toBool,
  enableForward:   toBool,
  rateLimitSecs:   v => inRange(toInt(v), 0, 86400),
  blockedKeywords: v => (typeof v === 'string' ? v : null),
  adminUsers:      v => (typeof v === 'string' || typeof v === 'number' ? String(v) : null),
};

/**
 * Validate and merge a partial config into the live Config.
 * Unknown keys and invalid values are skipped and reported, never applied.
 */
export function applyConfig(partial) {
  const applied = {};
  const invalid = [];
  for (const [key, raw] of Object.entries(partial ?? {})) {
    const validate = VALIDATORS[key];
    const value = validate ? validate(raw) : null;
    if (value === null) {
      invalid.push(key);
      continue;
    }
    Config[key] = value;
    applied[key] = value;
  }
  return { applied, invalid };
}

// ── Keyword blocking & admins ─────────────────────────────────────────────────

/** NFKC-fold, lowercase and strip whitespace so 全角/大小写/空格 can't bypass. */
export function normalizeText(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

/** Runtime-parsed, normalized blocked keyword list. */
export function getBlockedList() {
  return Config.blockedKeywords.split(/[,，]/).map(normalizeText).filter(Boolean);
}

/** True when the text (keyword, tag or title) matches any blocked keyword. */
export function isBlockedText(text) {
  const t = normalizeText(text);
  if (!t) return false;
  return getBlockedList().some(kw => t.includes(kw));
}

export function getAdminList() {
  return Config.adminUsers
    .split(/[,，\s]+/)
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s));
}

export function isAdmin(uid) {
  return getAdminList().includes(String(uid));
}

// ── Persistence (config.json next to package.json) ────────────────────────────

const CONFIG_FILE = process.env.NAPCAT_PIXIV_CONFIG
  || fileURLToPath(new URL('../config.json', import.meta.url));

/** Load config.json overrides (written by #pixiv设置 or hand-edited). */
export function loadConfigFile() {
  let raw;
  try {
    raw = readFileSync(CONFIG_FILE, 'utf8');
  } catch {
    return null; // no overrides file — defaults/panel config stay in effect
  }
  try {
    return applyConfig(JSON.parse(raw));
  } catch {
    return { applied: {}, invalid: ['<config.json 解析失败>'] };
  }
}

/** Merge the given overrides into config.json. Returns false when unwritable. */
export function saveConfigFile(partial) {
  let current = {};
  try {
    current = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch { /* fresh or unreadable file — start over */ }
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...partial }, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort adoption of WebUI/panel-saved config. NapCat versions differ in
 * where (and whether) they hand plugin config to the plugin, so probe the
 * shapes seen in the wild rather than assuming one contract.
 */
export function adoptCtxConfig(ctx) {
  const candidates = [ctx?.config, ctx?.pluginConfig, ctx?.configData, ctx?.pluginData?.config];
  for (const c of candidates) {
    if (c && typeof c === 'object' && !Array.isArray(c)) return applyConfig(c);
  }
  return null;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export const CMD_PREFIX = '#pixiv';

export const CMD = {
  RECOMMEND:  '#pixiv推荐',
  REC_ALIAS:  '#pixivrec',
  DAILY:      '#pixiv日榜',
  WEEKLY:     '#pixiv周榜',
  MONTHLY:    '#pixiv月榜',
  STATUS:     '#pixivstatus',
  SETTINGS:   '#pixiv设置',
  HELP:       '#pixivhelp',
  HELP_ALIAS: '#pixiv帮助',
};

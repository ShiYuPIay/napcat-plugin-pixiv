import { execFileSync } from 'node:child_process';

interface JsonRecord {
  [key: string]: unknown;
}

interface DockerConfigBundle {
  configDir: string;
  global: JsonRecord | null;
  accounts: Array<{
    file: string;
    uin: string;
    config: JsonRecord;
  }>;
}

export interface EffectiveWsServer {
  name: string;
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  role: string;
  accessToken: string;
}

export interface SnowLumaConnection {
  url: string;
  accessToken: string;
  source: string;
  uin?: string;
  role?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function wsServers(config: JsonRecord | null | undefined): JsonRecord[] {
  if (!config) return [];
  const networks = isRecord(config.networks) ? config.networks : null;
  return records(networks?.wsServers ?? config.wsServers);
}

function serverName(server: JsonRecord): string {
  return typeof server.name === 'string' && server.name.trim()
    ? server.name.trim()
    : 'ws-default';
}

function sameServer(left: JsonRecord, right: JsonRecord): boolean {
  if (typeof left.name === 'string' && typeof right.name === 'string') {
    return left.name === right.name;
  }
  return Number(left.port ?? 3001) === Number(right.port ?? 3001) &&
    String(left.path ?? '/') === String(right.path ?? '/');
}

function effectiveServerRecords(
  globalConfig: JsonRecord | null,
  accountConfig?: JsonRecord | null,
): JsonRecord[] {
  const globalServers = wsServers(globalConfig).map((server) => ({ ...server }));
  if (!accountConfig) return globalServers;

  const accountServers = wsServers(accountConfig);
  if (accountConfig.mode === 'snapshot') {
    return accountServers.map((server) => ({ ...server }));
  }
  if (!accountServers.length) return globalServers;

  const merged = [...globalServers];
  for (const overlay of accountServers) {
    const index = merged.findIndex((base) => sameServer(base, overlay));
    if (index >= 0) {
      merged[index] = { ...merged[index], ...overlay };
    } else {
      merged.push({ ...overlay });
    }
  }
  return merged;
}

export function resolveEffectiveWsServer(
  globalConfig: JsonRecord | null,
  accountConfig?: JsonRecord | null,
): EffectiveWsServer | null {
  const candidates = effectiveServerRecords(globalConfig, accountConfig)
    .filter((server) => server.enabled !== false);

  const selected = candidates.find(
    (server) => String(server.role ?? 'Universal').toLowerCase() === 'universal',
  );
  if (!selected) return null;

  const port = Number(selected.port ?? 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  const rawPath = typeof selected.path === 'string' && selected.path.trim()
    ? selected.path.trim()
    : '/';
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  return {
    name: serverName(selected),
    enabled: true,
    host: typeof selected.host === 'string' ? selected.host : '127.0.0.1',
    port,
    path,
    role: String(selected.role ?? 'Universal'),
    accessToken: typeof selected.accessToken === 'string' ? selected.accessToken : '',
  };
}

const DOCKER_DISCOVERY_SCRIPT = String.raw`
const fs = require('fs');
const path = require('path');
const dirs = [
  '/app/data/config',
  '/app/snowluma-data/config',
  '/app/config',
];
const configDir = dirs.find((dir) => fs.existsSync(path.join(dir, 'onebot.json')) || (
  fs.existsSync(dir) && fs.readdirSync(dir).some((name) => /^onebot_\d+\.json$/.test(name))
));
if (!configDir) {
  process.stdout.write(JSON.stringify({ error: 'onebot config directory not found' }));
  process.exit(0);
}
const read = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
};
const globalFile = path.join(configDir, 'onebot.json');
const global = fs.existsSync(globalFile) ? read(globalFile) : null;
const accounts = fs.readdirSync(configDir)
  .filter((name) => /^onebot_\d+\.json$/.test(name))
  .sort()
  .map((name) => ({
    file: name,
    uin: name.match(/^onebot_(\d+)\.json$/)?.[1] || '',
    config: read(path.join(configDir, name)),
  }))
  .filter((item) => item.config);
process.stdout.write(JSON.stringify({ configDir, global, accounts }));
`;

function dockerExecJson(container: string): DockerConfigBundle {
  const output = execFileSync(
    'docker',
    ['exec', container, 'node', '-e', DOCKER_DISCOVERY_SCRIPT],
    { encoding: 'utf8', timeout: 8_000, maxBuffer: 2 * 1024 * 1024 },
  ).trim();

  const parsed = JSON.parse(output) as DockerConfigBundle & { error?: string };
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.configDir || !Array.isArray(parsed.accounts)) {
    throw new Error('SnowLuma Docker 配置读取结果无效');
  }
  return parsed;
}

function dockerHostPort(container: string, containerPort: number): number {
  try {
    const output = execFileSync(
      'docker',
      ['port', container, `${containerPort}/tcp`],
      { encoding: 'utf8', timeout: 5_000 },
    );
    for (const line of output.split(/\r?\n/)) {
      const match = /:(\d+)\s*$/.exec(line.trim());
      if (match) return Number(match[1]);
    }
  } catch {
    // Host networking or an unavailable mapping: fall back to the container port.
  }
  return containerPort;
}

export function discoverSnowLumaDockerConnection(
  env: NodeJS.ProcessEnv = process.env,
): SnowLumaConnection {
  const container = env.SNOWLUMA_CONTAINER?.trim() || 'snowluma';
  const preferredUin = env.SNOWLUMA_UIN?.trim();
  const bundle = dockerExecJson(container);

  const accountCandidates = preferredUin
    ? bundle.accounts.filter((account) => account.uin === preferredUin)
    : bundle.accounts;

  if (preferredUin && !accountCandidates.length) {
    throw new Error(`SnowLuma 中未找到 QQ 账号 ${preferredUin} 的 onebot 配置`);
  }

  for (const account of accountCandidates) {
    const selected = resolveEffectiveWsServer(bundle.global, account.config);
    if (!selected) continue;
    const hostPort = dockerHostPort(container, selected.port);
    return {
      url: `ws://127.0.0.1:${hostPort}${selected.path}`,
      accessToken: selected.accessToken,
      source: `Docker ${container}:${bundle.configDir}/${account.file}`,
      uin: account.uin,
      role: selected.role,
    };
  }

  const globalServer = resolveEffectiveWsServer(bundle.global);
  if (globalServer) {
    const hostPort = dockerHostPort(container, globalServer.port);
    return {
      url: `ws://127.0.0.1:${hostPort}${globalServer.path}`,
      accessToken: globalServer.accessToken,
      source: `Docker ${container}:${bundle.configDir}/onebot.json`,
      role: globalServer.role,
    };
  }

  throw new Error('SnowLuma 未找到已启用且 role=Universal 的 WebSocket Server');
}

function firstEnv(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function resolveSnowLumaConnection(
  options: { forceDocker?: boolean; env?: NodeJS.ProcessEnv } = {},
): SnowLumaConnection {
  const env = options.env ?? process.env;
  const explicitUrl = firstEnv(env, ['ONEBOT_WS_URL', 'SNOWLUMA_WS_URL', 'NAPCAT_WS_URL']);
  const explicitToken = firstEnv(env, ['ONEBOT_ACCESS_TOKEN', 'SNOWLUMA_TOKEN', 'NAPCAT_WS_TOKEN']);

  if (options.forceDocker) {
    return discoverSnowLumaDockerConnection(env);
  }

  let discovered: SnowLumaConnection | null = null;
  if (!explicitUrl || !explicitToken) {
    try {
      discovered = discoverSnowLumaDockerConnection(env);
    } catch {
      // Non-Docker / remote deployments continue with explicit or default values.
    }
  }

  return {
    url: explicitUrl ?? discovered?.url ?? 'ws://127.0.0.1:3001/',
    accessToken: explicitToken ?? discovered?.accessToken ?? '',
    source: explicitUrl || explicitToken
      ? `环境变量${discovered ? ' + Docker 自动补全' : ''}`
      : discovered?.source ?? '默认配置',
    uin: discovered?.uin,
    role: discovered?.role,
  };
}

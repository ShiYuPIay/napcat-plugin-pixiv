import {
  applyConfig,
  getAdminUsers,
  getConfig,
  isAdmin,
  isBlockedText,
  saveConfig,
} from '../config.ts';
import { checkCooldown, refundCooldown } from '../core/cooldown.ts';
import { log } from '../core/logger.ts';
import { sendItems, sendText } from '../messaging/sender.ts';
import {
  checkApis,
  fetchIllust,
  fetchMemberIllusts,
  fetchRanking,
  fetchRecommend,
  fetchSearch,
} from '../services/pixiv-service.ts';
import type { BotAdapter, MessageEvent } from '../types.ts';

function helpText(): string {
  const { prefix, num } = getConfig();
  return [
    'Pixiv 插件使用指南',
    '━━━━━━━━━━━━━━━━━━━━',
    `${prefix} / ${prefix}随机        随机推荐插画`,
    `${prefix} <关键词>              关键词搜索`,
    `${prefix}pid <作品ID>           按 PID 查看作品`,
    `${prefix}画师 <UID>             查看画师最新作品`,
    `${prefix}日榜 / 周榜 / 月榜      排行榜 Top ${num}`,
    `${prefix}status                 上游接口连通性检查`,
    `${prefix}设置                   查看/修改配置（管理员）`,
    `${prefix}help / ${prefix}帮助   显示此帮助`,
  ].join('\n');
}

async function handleRecommend(bot: BotAdapter, event: MessageEvent): Promise<void> {
  const items = await fetchRecommend();
  if (!items.length) {
    await sendText(bot, event.group_id!, '暂时没有符合条件的插画，请稍后再试');
    return;
  }
  await sendItems(bot, event.group_id!, event.self_id, items);
}

async function handleSearch(
  bot: BotAdapter,
  event: MessageEvent,
  keyword: string,
): Promise<void> {
  if (isBlockedText(keyword)) {
    await sendText(bot, event.group_id!, '该关键词已被屏蔽');
    return;
  }

  const items = await fetchSearch(keyword);
  if (!items.length) {
    await sendText(bot, event.group_id!, `未找到与「${keyword}」相关的插画`);
    return;
  }
  await sendItems(bot, event.group_id!, event.self_id, items);
}

async function handleRanking(
  bot: BotAdapter,
  event: MessageEvent,
  mode: 'day' | 'week' | 'month',
): Promise<void> {
  const items = await fetchRanking(mode);
  if (!items.length) {
    await sendText(bot, event.group_id!, '未获取到榜单数据，请稍后再试');
    return;
  }
  await sendItems(bot, event.group_id!, event.self_id, items);
}

async function handleIllust(
  bot: BotAdapter,
  event: MessageEvent,
  pid: string,
): Promise<void> {
  const items = await fetchIllust(pid);
  if (!items.length) {
    await sendText(bot, event.group_id!, `未找到作品 ${pid}，或作品被当前内容策略过滤`);
    return;
  }
  await sendItems(bot, event.group_id!, event.self_id, items);
}

async function handleMember(
  bot: BotAdapter,
  event: MessageEvent,
  uid: string,
): Promise<void> {
  const items = await fetchMemberIllusts(uid);
  if (!items.length) {
    await sendText(bot, event.group_id!, `未找到画师 ${uid} 的作品，或作品均被过滤`);
    return;
  }
  await sendItems(bot, event.group_id!, event.self_id, items);
}

const SETTABLE: Record<string, keyof ReturnType<typeof getConfig>> = {
  r18: 'r18',
  num: 'num',
  excludeai: 'excludeAI',
  forward: 'enableForward',
  cooldown: 'rateLimitSecs',
};

function settingsSummary(): string {
  const config = getConfig();
  return [
    '当前配置：',
    `r18=${config.r18}  num=${config.num}  excludeai=${config.excludeAI ? 'on' : 'off'}`,
    `forward=${config.enableForward ? 'on' : 'off'}  cooldown=${config.rateLimitSecs}s`,
    `修改：${config.prefix}设置 <r18|num|excludeai|forward|cooldown> <值>`,
  ].join('\n');
}

async function handleSettings(
  bot: BotAdapter,
  event: MessageEvent,
  args: string,
): Promise<void> {
  if (!isAdmin(event.user_id)) {
    const message = getAdminUsers().length
      ? '仅管理员可查看/修改插件配置'
      : '未配置管理员：请先在 NapCat WebUI、config.json 或环境变量中设置 adminUsers';
    await sendText(bot, event.group_id!, message);
    return;
  }

  const [rawKey, ...rest] = args.split(/\s+/).filter(Boolean);
  if (!rawKey) {
    await sendText(bot, event.group_id!, settingsSummary());
    return;
  }

  const key = SETTABLE[rawKey.toLowerCase()];
  const rawValue = rest.join(' ');
  if (!key || !rawValue) {
    await sendText(bot, event.group_id!, settingsSummary());
    return;
  }

  const { applied } = applyConfig({ [key]: rawValue });
  if (!(key in applied)) {
    await sendText(bot, event.group_id!, `无效配置值：${rawKey} = ${rawValue}`);
    return;
  }

  const persisted = saveConfig(applied);
  await sendText(
    bot,
    event.group_id!,
    `已更新 ${rawKey} = ${String(applied[key])}${persisted ? '' : '（配置文件写入失败，仅本次运行有效）'}`,
  );
}

async function routeNetworkCommand(
  bot: BotAdapter,
  event: MessageEvent,
  message: string,
): Promise<void> {
  const { prefix } = getConfig();
  const suffix = message.slice(prefix.length).trim();

  if (!suffix || suffix === '随机' || suffix === '推荐' || suffix.toLowerCase() === 'rec') {
    await handleRecommend(bot, event);
    return;
  }

  if (suffix === '日榜') {
    await handleRanking(bot, event, 'day');
    return;
  }
  if (suffix === '周榜') {
    await handleRanking(bot, event, 'week');
    return;
  }
  if (suffix === '月榜') {
    await handleRanking(bot, event, 'month');
    return;
  }
  if (suffix.toLowerCase() === 'status') {
    await sendText(bot, event.group_id!, `Pixiv 插件接口状态\n${await checkApis()}`);
    return;
  }

  const pidMatch = /^pid\s*(\d+)?$/i.exec(suffix);
  if (pidMatch) {
    if (!pidMatch[1]) {
      await sendText(bot, event.group_id!, `用法：${prefix}pid <作品ID>`);
      return;
    }
    await handleIllust(bot, event, pidMatch[1]);
    return;
  }

  const memberMatch = /^(?:画师|uid)\s*(\d+)?$/i.exec(suffix);
  if (memberMatch) {
    if (!memberMatch[1]) {
      await sendText(bot, event.group_id!, `用法：${prefix}画师 <画师UID>`);
      return;
    }
    await handleMember(bot, event, memberMatch[1]);
    return;
  }

  await handleSearch(bot, event, suffix);
}

export async function handleMessage(
  event: MessageEvent,
  bot: BotAdapter,
): Promise<void> {
  const config = getConfig();
  if (!config.enabled || event.message_type !== 'group' || event.group_id === undefined) return;

  const message = String(event.raw_message ?? '').trim();
  if (!message.startsWith(config.prefix)) return;

  const suffix = message.slice(config.prefix.length).trim();

  try {
    if (suffix.toLowerCase() === 'help' || suffix === '帮助') {
      await sendText(bot, event.group_id, helpText());
      return;
    }

    if (suffix === '设置' || suffix.startsWith('设置 ')) {
      await handleSettings(bot, event, suffix.slice(2).trim());
      return;
    }

    const wait = checkCooldown(event.user_id);
    if (wait > 0) {
      await sendText(bot, event.group_id, `冷却中，请 ${wait} 秒后再试`);
      return;
    }

    try {
      await routeNetworkCommand(bot, event, message);
    } catch (error) {
      refundCooldown(event.user_id);
      throw error;
    }
  } catch (error) {
    const details = error instanceof Error ? error.stack ?? error.message : String(error);
    log.error(`指令处理失败：${details}`);
    try {
      await sendText(bot, event.group_id, '执行失败，请稍后再试');
    } catch {
      // Platform itself is unavailable; no further fallback is possible.
    }
  }
}

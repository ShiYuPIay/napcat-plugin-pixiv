import {
  fetchRecommend, fetchSearch, fetchRanking, fetchIllust, fetchMemberIllusts, checkApis,
} from '../services/pixiv-service.js';
import {
  CMD, CMD_PREFIX, Config, applyConfig, saveConfigFile, isAdmin, getAdminList, isBlockedText,
} from '../config.js';
import { checkCooldown, refundCooldown } from '../core/cooldown.js';
import { log } from '../core/logger.js';

// ── Message builders ──────────────────────────────────────────────────────────

function buildNode(item, selfId) {
  const caption = `${item.title} - ${item.author}\npid: ${item.pid}`;
  const content = [{ type: 'text', data: { text: caption } }];
  if (item.url) content.push({ type: 'image', data: { file: item.url } });
  return {
    type: 'node',
    data: { name: item.author || 'Pixiv', uin: String(selfId || '10000'), content },
  };
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function sendText(bot, groupId, text) {
  await bot.call_api('send_group_msg', {
    group_id: groupId,
    message:  [{ type: 'text', data: { text } }],
  });
}

// One forward attempt (lowest-level merge); returns success boolean
async function tryForwardMsg(bot, groupId, nodes) {
  try {
    await bot.call_api('send_group_forward_msg', { group_id: groupId, messages: nodes });
    return true;
  } catch (e) {
    log.warn(`send_group_forward_msg 失败，回退逐条: ${e.message}`);
    return false;
  }
}

// Send one node; on image upload failure degrades to text caption
async function sendOneNode(bot, groupId, node) {
  const content = node.data?.content ?? [];
  const hasImg  = content.some(c => c.type === 'image');
  try {
    await bot.call_api('send_group_msg', { group_id: groupId, message: content });
  } catch (e) {
    if (hasImg) {
      log.warn(`图片发送失败，降级文字: ${e.message}`);
      const textOnly = content.filter(c => c.type === 'text');
      try {
        await bot.call_api('send_group_msg', { group_id: groupId, message: textOnly });
      } catch (e2) { log.error(`文字降级也失败: ${e2.message}`); }
    } else {
      log.error(`发送失败: ${e.message}`);
    }
  }
}

async function sendNodes(bot, groupId, nodes) {
  if (!nodes.length) return;
  if (Config.enableForward) {
    const ok = await tryForwardMsg(bot, groupId, nodes);
    if (ok) return;
  }
  for (const node of nodes) await sendOneNode(bot, groupId, node);
}

// ── Help text ─────────────────────────────────────────────────────────────────

const HELP = [
  'Pixiv 插件使用指南',
  '━━━━━━━━━━━━━━━━━━━━',
  '#pixiv推荐 / #pixivrec   随机推荐插画',
  '#pixiv<关键词>           关键词搜索',
  '#pixivpid <作品ID>       按 pid 查看作品',
  '#pixiv画师 <UID>         查看画师最新作品',
  '#pixiv日榜 / 周榜 / 月榜  排行榜 Top N',
  '#pixivstatus             接口连通性检查',
  '#pixiv设置               查看/修改配置（管理员）',
  '#pixivhelp / #pixiv帮助  显示此帮助',
].join('\n');

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleRecommend(bot, gid, selfId) {
  log.info('处理 #pixiv推荐');
  const illusts = await fetchRecommend();
  if (!illusts.length) {
    await sendText(bot, gid, '暂时没有符合条件的插画，请稍后再试');
    return;
  }
  await sendNodes(bot, gid, illusts.map(it => buildNode(it, selfId)));
}

async function handleSearch(bot, gid, selfId, keyword) {
  log.info(`处理 #pixiv搜索 "${keyword}"`);
  const illusts = await fetchSearch(keyword);
  if (!illusts.length) {
    await sendText(bot, gid, `未找到与「${keyword}」相关的插画`);
    return;
  }
  await sendNodes(bot, gid, illusts.map(it => buildNode(it, selfId)));
}

async function handleRanking(bot, gid, selfId, mode) {
  log.info(`处理 #pixiv榜 mode=${mode}`);
  const illusts = await fetchRanking(mode);
  if (!illusts.length) {
    await sendText(bot, gid, '未获取到榜单数据，请稍后再试');
    return;
  }
  await sendNodes(bot, gid, illusts.map(it => buildNode(it, selfId)));
}

async function handleIllust(bot, gid, selfId, pid) {
  log.info(`处理 #pixivpid ${pid}`);
  const pages = await fetchIllust(pid);
  if (!pages.length) {
    await sendText(bot, gid, `未找到作品 ${pid}，或该作品不符合当前内容设置`);
    return;
  }
  await sendNodes(bot, gid, pages.map(p => buildNode(p, selfId)));
}

async function handleMember(bot, gid, selfId, memberId) {
  log.info(`处理 #pixiv画师 ${memberId}`);
  const illusts = await fetchMemberIllusts(memberId);
  if (!illusts.length) {
    await sendText(bot, gid, `未找到画师 ${memberId} 的作品，或均被内容设置过滤`);
    return;
  }
  await sendNodes(bot, gid, illusts.map(it => buildNode(it, selfId)));
}

async function handleStatus(bot, gid) {
  log.info('处理 #pixivstatus');
  const status = await checkApis();
  await sendText(bot, gid, `Pixiv 插件接口状态\n${status}`);
}

// ── Settings command (admin only) ─────────────────────────────────────────────

const SETTABLE = {
  r18:       'r18',
  num:       'num',
  excludeai: 'excludeAI',
  forward:   'enableForward',
  cooldown:  'rateLimitSecs',
};

function settingsSummary() {
  return [
    '当前配置：',
    `r18=${Config.r18}  num=${Config.num}  excludeai=${Config.excludeAI ? 'on' : 'off'}`,
    `forward=${Config.enableForward ? 'on' : 'off'}  cooldown=${Config.rateLimitSecs}s`,
    '修改：#pixiv设置 <r18|num|excludeai|forward|cooldown> <值>',
  ].join('\n');
}

async function handleSettings(bot, gid, uid, args) {
  if (!isAdmin(uid)) {
    await sendText(bot, gid, getAdminList().length
      ? '仅管理员可查看/修改插件配置'
      : '未配置管理员：请先在 config.json 或 WebUI 中设置 adminUsers（QQ 号，逗号分隔）');
    return;
  }
  const [rawKey, ...rest] = args.split(/\s+/).filter(Boolean);
  const key   = SETTABLE[rawKey?.toLowerCase()];
  const value = rest.join(' ');
  if (!key || !value) {
    await sendText(bot, gid, settingsSummary());
    return;
  }
  const { applied } = applyConfig({ [key]: value });
  if (!(key in applied)) {
    await sendText(bot, gid, `无效的值：${rawKey} = ${value}`);
    return;
  }
  const persisted = saveConfigFile({ [key]: applied[key] });
  await sendText(bot, gid,
    `已更新 ${rawKey} = ${applied[key]}` + (persisted ? '' : '（写入 config.json 失败，重启后失效）'));
}

// ── Routing ───────────────────────────────────────────────────────────────────

// Network-bound commands, gated behind the per-user cooldown.
async function route(bot, gid, selfId, msg, keyword) {
  if (msg === CMD.STATUS) { await handleStatus(bot, gid); return; }
  if (msg === CMD.RECOMMEND || msg === CMD.REC_ALIAS) { await handleRecommend(bot, gid, selfId); return; }
  if (msg === CMD.DAILY)   { await handleRanking(bot, gid, selfId, 'day');   return; }
  if (msg === CMD.WEEKLY)  { await handleRanking(bot, gid, selfId, 'week');  return; }
  if (msg === CMD.MONTHLY) { await handleRanking(bot, gid, selfId, 'month'); return; }

  let m;
  if ((m = /^pid\s*(\d+)?$/i.exec(keyword))) {
    if (!m[1]) { await sendText(bot, gid, '用法：#pixivpid <作品ID>'); return; }
    await handleIllust(bot, gid, selfId, m[1]);
    return;
  }
  if ((m = /^(?:画师|uid)\s*(\d+)?$/i.exec(keyword))) {
    if (!m[1]) { await sendText(bot, gid, '用法：#pixiv画师 <画师UID>'); return; }
    await handleMember(bot, gid, selfId, m[1]);
    return;
  }

  if (isBlockedText(keyword)) {
    await sendText(bot, gid, '该关键词已被屏蔽');
    return;
  }
  await handleSearch(bot, gid, selfId, keyword);
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function handleMessage(event, bot) {
  if (event.message_type !== 'group') return;

  const msg = (event.raw_message ?? '').trim();
  if (!msg.startsWith(CMD_PREFIX)) return;

  const gid    = event.group_id;
  const uid    = event.user_id;
  const selfId = event.self_id;

  try {
    // Local commands (no upstream request) are never rate-limited
    if (msg === CMD.HELP || msg === CMD.HELP_ALIAS) { await sendText(bot, gid, HELP); return; }
    if (msg.startsWith(CMD.SETTINGS)) {
      await handleSettings(bot, gid, uid, msg.slice(CMD.SETTINGS.length).trim());
      return;
    }

    const keyword = msg.slice(CMD_PREFIX.length).trim();
    if (!keyword) { await sendText(bot, gid, HELP); return; }

    // Everything else hits upstream APIs → per-user cooldown
    const wait = checkCooldown(uid);
    if (wait > 0) {
      await sendText(bot, gid, `冷却中，请 ${wait} 秒后再试`);
      return;
    }

    try {
      await route(bot, gid, selfId, msg, keyword);
    } catch (e) {
      refundCooldown(uid); // upstream failure shouldn't burn the user's cooldown
      throw e;
    }
  } catch (e) {
    log.error(`指令处理出错: ${e.stack || e.message}`);
    try { await sendText(bot, gid, '执行失败，请稍后再试'); } catch { /* ignore */ }
  }
}

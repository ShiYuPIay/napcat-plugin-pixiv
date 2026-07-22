import { fetchRecommend, fetchSearch, fetchRanking, checkApis } from '../services/pixiv-service.js';
import { CMD, CMD_PREFIX, Config, getBlockedList } from '../config.js';

const TAG   = '[Plugin: napcat-plugin-pixiv]';
const info  = m => console.log(`\x1b[30m[INFO] ${TAG} ${m}\x1b[0m`);
const warn  = m => console.warn(`\x1b[33m[WARN] ${TAG} ${m}\x1b[0m`);
const error = m => console.error(`\x1b[31m[ERROR] ${TAG} ${m}\x1b[0m`);

// ── Rate limiter ──────────────────────────────────────────────────────────────

const cooldowns = new Map(); // user_id → last-invoke timestamp

/**
 * Returns remaining cooldown seconds, or 0 if the user may proceed.
 * Stamps the user's timestamp on proceed.
 */
function checkCooldown(uid) {
  if (!Config.rateLimitSecs) return 0;
  const now  = Date.now();
  const last = cooldowns.get(uid) ?? 0;
  const wait = Config.rateLimitSecs * 1000 - (now - last);
  if (wait > 0) return Math.ceil(wait / 1000);
  // Prevent unbounded growth in long-running bots
  if (cooldowns.size >= 1000) cooldowns.clear();
  cooldowns.set(uid, now);
  return 0;
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildNode({ pid, title, author, url }) {
  const caption = `${title} - ${author}\npid: ${pid}`;
  const content = [{ type: 'text', data: { text: caption } }];
  if (url) content.push({ type: 'image', data: { file: url } });
  return { type: 'node', data: { name: author || 'Pixiv', uin: '10000', content } };
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
    warn(`send_group_forward_msg 失败，回退逐条: ${e.message}`);
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
      warn(`图片发送失败，降级文字: ${e.message}`);
      const textOnly = content.filter(c => c.type === 'text');
      try {
        await bot.call_api('send_group_msg', { group_id: groupId, message: textOnly });
      } catch (e2) { error(`文字降级也失败: ${e2.message}`); }
    } else {
      error(`发送失败: ${e.message}`);
    }
  }
}

async function sendNodes(bot, groupId, nodes) {
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
  '#pixiv日榜               Pixiv 日榜',
  '#pixiv周榜               Pixiv 周榜',
  '#pixiv月榜               Pixiv 月榜',
  '#pixivstatus             接口连通性检查',
  '#pixivhelp               显示此帮助',
].join('\n');

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleRecommend(bot, gid) {
  info('处理 #pixiv推荐');
  const illusts = await fetchRecommend();
  await sendNodes(bot, gid, illusts.map(buildNode));
}

async function handleSearch(bot, gid, keyword) {
  info(`处理 #pixiv搜索 "${keyword}"`);
  const illusts = await fetchSearch(keyword);
  if (!illusts.length) {
    await sendText(bot, gid, `未找到与「${keyword}」相关的插画`);
    return;
  }
  await sendNodes(bot, gid, illusts.map(buildNode));
}

async function handleRanking(bot, gid, mode) {
  info(`处理 #pixiv榜 mode=${mode}`);
  const illusts = await fetchRanking(mode);
  await sendNodes(bot, gid, illusts.map(buildNode));
}

async function handleStatus(bot, gid) {
  info('处理 #pixivstatus');
  const status = await checkApis();
  await sendText(bot, gid, `Pixiv 插件接口状态\n${status}`);
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function handleMessage(event, bot) {
  if (event.message_type !== 'group') return;

  const msg = (event.raw_message ?? '').trim();
  if (!msg.startsWith(CMD_PREFIX)) return;

  const gid = event.group_id;
  const uid = event.user_id;

  try {
    // Help and status are not rate-limited
    if (msg === CMD.HELP)   { await sendText(bot, gid, HELP); return; }
    if (msg === CMD.STATUS) { await handleStatus(bot, gid);  return; }

    // All other commands are rate-limited
    const wait = checkCooldown(uid);
    if (wait > 0) {
      await sendText(bot, gid, `冷却中，请 ${wait} 秒后再试`);
      return;
    }

    if (msg === CMD.RECOMMEND || msg === CMD.REC_ALIAS) {
      await handleRecommend(bot, gid);
      return;
    }
    if (msg === CMD.DAILY)   { await handleRanking(bot, gid, 'day');   return; }
    if (msg === CMD.WEEKLY)  { await handleRanking(bot, gid, 'week');  return; }
    if (msg === CMD.MONTHLY) { await handleRanking(bot, gid, 'month'); return; }

    // Keyword search: #pixiv<keyword>
    const keyword = msg.slice(CMD_PREFIX.length).trim();
    if (!keyword) { await sendText(bot, gid, HELP); return; }

    if (getBlockedList().some(kw => keyword.includes(kw))) {
      await sendText(bot, gid, '该关键词已被屏蔽');
      return;
    }

    await handleSearch(bot, gid, keyword);

  } catch (e) {
    error(`指令处理出错: ${e.message}`);
    try { await sendText(bot, gid, `执行失败：${e.message}`); } catch { /* ignore */ }
  }
}

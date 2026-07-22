import { fetchRecommend, fetchRanking } from '../services/pixiv-service.js';
import { CMD } from '../config.js';

const TAG   = '[Plugin: napcat-plugin-pixiv]';
const info  = m => console.log(`\x1b[30m[INFO] ${TAG} ${m}\x1b[0m`);
const warn  = m => console.warn(`\x1b[33m[WARN] ${TAG} ${m}\x1b[0m`);
const error = m => console.error(`\x1b[31m[ERROR] ${TAG} ${m}\x1b[0m`);

// Build one OB11 forward node for an artwork
function buildNode({ pid, title, author, url }) {
  const caption = `${title} - ${author}\npid: ${pid}`;
  const content = [{ type: 'text', data: { text: caption } }];
  if (url) content.push({ type: 'image', data: { file: url } });
  return { type: 'node', data: { name: author || 'Pixiv', uin: '10000', content } };
}

// ── Lowest-level send primitives ──────────────────────────────────────────────

// FIX: single forward attempt (was 4 retries with different API variants,
// all of which fail identically when QQ's forward-message CDN is unreachable)
async function tryForwardMsg(bot, groupId, nodes) {
  try {
    await bot.call_api('send_group_forward_msg', { group_id: groupId, messages: nodes });
    return true;
  } catch (e) {
    warn(`send_group_forward_msg 失败，回退逐条发送: ${e.message}`);
    return false;
  }
}

// FIX: use send_group_msg (no reply reference) instead of send_msg with a
// reply element.  The old sendReply() triggered NTEvent onMsgInfoListUpdate
// which timed out even when result=0 (messages were already delivered).
// send_group_msg avoids that callback path entirely.
//
// FIX: when image upload fails (Highway ETIMEDOUT) degrade to text-only so
// the user always receives the title + pid instead of nothing.
async function sendOneNode(bot, groupId, node) {
  const content = node.data?.content ?? [];
  const hasImg  = content.some(c => c.type === 'image');

  try {
    await bot.call_api('send_group_msg', { group_id: groupId, message: content });
  } catch (e) {
    if (hasImg) {
      warn(`图片上传失败，降级文字: ${e.message}`);
      const textOnly = content.filter(c => c.type === 'text');
      try {
        await bot.call_api('send_group_msg', { group_id: groupId, message: textOnly });
      } catch (e2) {
        error(`文字降级也失败: ${e2.message}`);
      }
    } else {
      error(`发送失败: ${e.message}`);
    }
  }
}

// ── Merged dispatch: forward once → one-by-one ───────────────────────────────

async function sendNodes(bot, groupId, nodes) {
  const ok = await tryForwardMsg(bot, groupId, nodes);
  if (ok) return;
  for (const node of nodes) {
    await sendOneNode(bot, groupId, node);
  }
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleRecommend(bot, groupId) {
  const illusts = await fetchRecommend();
  await sendNodes(bot, groupId, illusts.map(buildNode));
}

async function handleRanking(bot, groupId, mode) {
  const illusts = await fetchRanking(mode);
  await sendNodes(bot, groupId, illusts.map(buildNode));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function handleMessage(event, bot) {
  if (event.message_type !== 'group') return;
  const msg = (event.raw_message ?? '').trim();
  const gid = event.group_id;

  try {
    if (msg === CMD.RECOMMEND) { await handleRecommend(bot, gid); return; }
    if (msg === CMD.DAILY)     { await handleRanking(bot, gid, 'day');   return; }
    if (msg === CMD.WEEKLY)    { await handleRanking(bot, gid, 'week');  return; }
    if (msg === CMD.MONTHLY)   { await handleRanking(bot, gid, 'month'); return; }
  } catch (e) {
    error(`指令处理出错: ${e.message}`);
  }
}

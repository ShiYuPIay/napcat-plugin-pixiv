export const Config = {
  r18:             0,                        // 0=非R18, 1=R18, 2=混合
  num:             3,                        // 每次返回图片数
  excludeAI:       true,                     // 排除 AI 生成作品
  enableForward:   true,                     // 优先合并转发
  rateLimitSecs:   15,                       // 每人冷却秒数 (0=关闭)
  blockedKeywords: '萝莉,未成年,幼女,乱伦', // 屏蔽关键词，逗号分隔
};

/** Runtime-parsed blocked keyword list. */
export function getBlockedList() {
  return Config.blockedKeywords.split(',').map(k => k.trim()).filter(Boolean);
}

export const CMD_PREFIX = '#pixiv';

export const CMD = {
  RECOMMEND: '#pixiv推荐',
  REC_ALIAS: '#pixivrec',
  DAILY:     '#pixiv日榜',
  WEEKLY:    '#pixiv周榜',
  MONTHLY:   '#pixiv月榜',
  STATUS:    '#pixivstatus',
  HELP:      '#pixivhelp',
};

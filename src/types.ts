export type Id = string | number;

export interface MessageSegment {
  type: string;
  data: Record<string, unknown>;
}

export interface ForwardNode {
  type: 'node';
  data: {
    name: string;
    uin: string;
    content: MessageSegment[];
  };
}

export interface MessageEvent {
  post_type?: string;
  message_type?: string;
  raw_message?: string;
  message?: string | MessageSegment[];
  group_id?: Id;
  user_id?: Id;
  self_id?: Id;
}

export interface BotAdapter {
  sendGroupMessage(groupId: Id, message: string | MessageSegment[]): Promise<void>;
  sendPrivateMessage(userId: Id, message: string | MessageSegment[]): Promise<void>;
  sendGroupForwardMessage(groupId: Id, nodes: ForwardNode[]): Promise<void>;
  sendPrivateForwardMessage(userId: Id, nodes: ForwardNode[]): Promise<void>;
}

export interface LoggerLike {
  log?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
}

export interface PluginConfig {
  enabled: boolean;
  prefix: string;
  r18: 0 | 1 | 2;
  num: number;
  excludeAI: boolean;
  enableForward: boolean;
  rateLimitSecs: number;
  blockedKeywords: string;
  adminUsers: string;
  loliconApi: string;
  hibiApi: string;
  imageProxy: string;
  requestTimeoutMs: number;
}

export interface PixivItem {
  pid: string;
  title: string;
  author: string;
  url: string | null;
  tags: string[];
  r18: boolean;
  ai: boolean;
}

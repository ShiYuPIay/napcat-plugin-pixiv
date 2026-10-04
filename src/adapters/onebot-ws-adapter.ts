import { log } from '../core/logger.ts';
import type {
  BotAdapter,
  ForwardNode,
  Id,
  MessageEvent,
  MessageSegment,
} from '../types.ts';

interface OneBotResponse {
  status?: string;
  retcode?: number;
  message?: string;
  wording?: string;
  echo?: string;
  data?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// A connection must stay up this long before the reconnect backoff starts over.
const STABLE_CONNECTION_MS = 10_000;

export interface OneBotWsOptions {
  url: string;
  accessToken?: string;
  requestTimeoutMs?: number;
  minReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export class OneBotWsAdapter implements BotAdapter {
  private readonly options: OneBotWsOptions;
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private openedAt: number | null = null;
  private echoCounter = 0;
  private readonly pending = new Map<string, PendingRequest>();
  private eventHandler: ((event: MessageEvent) => void | Promise<void>) | null = null;

  constructor(options: OneBotWsOptions) {
    this.options = options;
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  start(handler: (event: MessageEvent) => void | Promise<void>): void {
    this.eventHandler = handler;
    this.stopped = false;
    // A second start() must not open another socket next to the first one.
    if (this.socket || this.reconnectTimer) return;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.rejectPending(new Error('OneBot WebSocket stopped'));

    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close(1000, 'shutdown');
    }
    this.socket = null;
  }

  private connectionUrl(): string {
    const url = new URL(this.options.url);
    if (this.options.accessToken) {
      url.searchParams.set('access_token', this.options.accessToken);
    }
    return url.toString();
  }

  private connect(): void {
    if (this.stopped) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.connectionUrl());
    } catch (error) {
      log.error(`创建 OneBot WebSocket 失败：${error instanceof Error ? error.message : String(error)}`);
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    // Node's WebSocket reports every failed connect (refused port, rejected
    // token or path) as an 'error' event while still CONNECTING and never
    // fires 'close', so both events end up in this one idempotent handler.
    const onDisconnect = (code: number, reason = ''): void => {
      if (this.socket !== socket) return;
      this.socket = null;
      // Only a connection that stayed up restarts the backoff. NapCat accepts
      // the upgrade and drops the socket again when the token is wrong, which
      // must not turn into a retry every second.
      if (this.openedAt !== null && Date.now() - this.openedAt >= STABLE_CONNECTION_MS) {
        this.reconnectAttempt = 0;
      }
      this.openedAt = null;
      const detail = reason ? `，原因：${reason}` : '';
      this.rejectPending(new Error(`OneBot WebSocket closed (${code}${detail})`));
      if (this.stopped) return;
      log.warn(`OneBot WebSocket 已断开 (${code})${detail}，准备重连`);
      if (code === 1006) {
        log.warn('1006 通常表示 WS 地址、端口、路径或 accessToken 不正确；可运行 npm run doctor:snowluma 自动诊断。');
      }
      this.scheduleReconnect();
    };

    socket.addEventListener('open', () => {
      this.openedAt = Date.now();
      log.info(`OneBot WebSocket 已连接：${this.options.url}`);
    });

    socket.addEventListener('message', (event) => {
      this.handleFrame(event.data).catch((error) => {
        log.error(`OneBot 数据帧处理失败：${error instanceof Error ? error.message : String(error)}`);
      });
    });

    socket.addEventListener('error', (event) => {
      const details = 'message' in event && typeof event.message === 'string' && event.message
        ? `：${event.message}`
        : '';
      log.warn(`OneBot WebSocket 发生连接错误${details}`);
      if (socket.readyState !== WebSocket.OPEN) onDisconnect(1006);
    });

    socket.addEventListener('close', (event) => onDisconnect(event.code, event.reason));
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    const min = Math.max(1_000, this.options.minReconnectDelayMs ?? 1_000);
    const max = Math.max(min, this.options.maxReconnectDelayMs ?? 30_000);
    const base = Math.min(max, min * (2 ** this.reconnectAttempt));
    const jitter = Math.round(base * (Math.random() * 0.2 - 0.1));
    const delay = Math.max(min, base + jitter);
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async handleFrame(data: unknown): Promise<void> {
    let text: string;
    if (typeof data === 'string') {
      text = data;
    } else if (data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else if (ArrayBuffer.isView(data)) {
      text = new TextDecoder().decode(data);
    } else if (data instanceof Blob) {
      text = await data.text();
    } else {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      log.warn('忽略无法解析的 OneBot WebSocket 数据帧');
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log.warn('忽略不是 JSON 对象的 OneBot WebSocket 数据帧');
      return;
    }
    const payload = parsed as OneBotResponse & MessageEvent;

    if (payload.status === 'failed' && (payload.echo === undefined || payload.echo === null)) {
      // NapCat answers a wrong token after the upgrade with an unsolicited
      // { status: 'failed', retcode: 1403 } frame and then closes the socket.
      const reason = payload.wording || payload.message || `retcode ${payload.retcode}`;
      const hint = payload.retcode === 1403
        ? '；请检查 NAPCAT_WS_TOKEN / ONEBOT_ACCESS_TOKEN 是否与服务端 token 一致'
        : '';
      log.error(`OneBot 服务器返回了未关联请求的失败响应：${reason}${hint}`);
      return;
    }

    if (payload.echo !== undefined) {
      const key = String(payload.echo);
      const pending = this.pending.get(key);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(key);

      if (payload.status === 'failed' || (payload.retcode !== undefined && payload.retcode !== 0)) {
        pending.reject(
          new Error(payload.wording || payload.message || `OneBot action failed: ${payload.retcode}`),
        );
      } else {
        pending.resolve(payload.data);
      }
      return;
    }

    if (this.eventHandler && payload.post_type) {
      try {
        await this.eventHandler(payload);
      } catch (error) {
        log.error(`OneBot 事件处理失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async call(action: string, params: Record<string, unknown>): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('OneBot WebSocket is not connected');
    }

    const echo = `pixiv-${Date.now()}-${++this.echoCounter}`;
    const timeoutMs = Math.max(1_000, this.options.requestTimeoutMs ?? 30_000);

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error(`OneBot action timeout: ${action}`));
      }, timeoutMs);

      this.pending.set(echo, { resolve, reject, timer });

      try {
        socket.send(JSON.stringify({ action, params, echo }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(echo);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async sendGroupMessage(
    groupId: Id,
    message: string | MessageSegment[],
  ): Promise<void> {
    await this.call('send_group_msg', {
      group_id: String(groupId),
      message,
    });
  }

  async sendPrivateMessage(
    userId: Id,
    message: string | MessageSegment[],
  ): Promise<void> {
    await this.call('send_private_msg', {
      user_id: String(userId),
      message,
    });
  }

  async sendGroupForwardMessage(
    groupId: Id,
    nodes: ForwardNode[],
  ): Promise<void> {
    await this.call('send_group_forward_msg', {
      group_id: String(groupId),
      messages: nodes,
    });
  }

  async sendPrivateForwardMessage(
    userId: Id,
    nodes: ForwardNode[],
  ): Promise<void> {
    await this.call('send_private_forward_msg', {
      user_id: String(userId),
      messages: nodes,
    });
  }
}

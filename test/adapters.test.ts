import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NapCatAdapter } from '../src/adapters/napcat-adapter.ts';
import { OneBotWsAdapter } from '../src/adapters/onebot-ws-adapter.ts';
import type { MessageEvent } from '../src/types.ts';

test('NapCat adapter calls native actions for group and private messages', async () => {
  const calls: Array<{ action: string; params: unknown; adapter: string; config: unknown }> = [];
  const ctx = {
    actions: {
      async call(action: string, params: unknown, adapter: string, config: unknown) {
        calls.push({ action, params, adapter, config });
        return {};
      },
    },
    adapterName: 'default',
    pluginManager: { config: { test: true } },
  };

  const bot = new NapCatAdapter(ctx);
  await bot.sendGroupMessage(12345678901234567890n.toString(), 'hello');
  await bot.sendPrivateMessage('99887766', 'private');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].action, 'send_group_msg');
  assert.deepEqual(calls[0].params, {
    group_id: '12345678901234567890',
    message: 'hello',
  });
  assert.equal(calls[1].action, 'send_private_msg');
  assert.deepEqual(calls[1].params, {
    user_id: '99887766',
    message: 'private',
  });
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static latest: FakeWebSocket | null = null;

  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: any) => void>>();

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.latest = this;
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit('open', {});
    });
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
    const request = JSON.parse(data) as { echo: string };
    queueMicrotask(() => {
      this.emit('message', {
        data: JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: request.echo }),
      });
    });
  }

  close(code = 1000): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { code, reason: '' });
  }

  emitEvent(event: MessageEvent): void {
    this.emit('message', { data: JSON.stringify(event) });
  }

  private emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test('OneBot WS adapter appends access token, correlates echo, sends private messages, and dispatches events', async () => {
  const realWebSocket = globalThis.WebSocket;
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: FakeWebSocket,
  });

  try {
    const events: MessageEvent[] = [];
    const bot = new OneBotWsAdapter({
      url: 'ws://127.0.0.1:3001/',
      accessToken: 'secret token',
      requestTimeoutMs: 1_000,
    });
    bot.start((event) => { events.push(event); });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const socket = FakeWebSocket.latest;
    if (!socket) throw new Error('fake WebSocket was not created');
    assert.equal(bot.isConnected, true);
    assert.match(socket.url, /^ws:\/\/127\.0\.0\.1:3001\//);
    assert.match(socket.url, /access_token=secret\+token/);

    await bot.sendGroupMessage(123, 'hello');
    const groupRequest = JSON.parse(socket.sent[0]) as {
      action: string;
      params: { group_id: string; message: string };
      echo: string;
    };
    assert.equal(groupRequest.action, 'send_group_msg');
    assert.equal(groupRequest.params.group_id, '123');
    assert.equal(groupRequest.params.message, 'hello');
    assert.match(groupRequest.echo, /^pixiv-/);

    await bot.sendPrivateMessage(456, 'private');
    const privateRequest = JSON.parse(socket.sent[1]) as {
      action: string;
      params: { user_id: string; message: string };
    };
    assert.equal(privateRequest.action, 'send_private_msg');
    assert.equal(privateRequest.params.user_id, '456');
    assert.equal(privateRequest.params.message, 'private');

    socket.emitEvent({
      post_type: 'message',
      message_type: 'group',
      group_id: '1',
      user_id: '2',
      raw_message: '#pixiv帮助',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(events.length, 1);
    assert.equal(events[0].raw_message, '#pixiv帮助');

    bot.stop();
  } finally {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: realWebSocket,
    });
  }
});

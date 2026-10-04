import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NapCatAdapter } from '../src/adapters/napcat-adapter.ts';
import { OneBotWsAdapter } from '../src/adapters/onebot-ws-adapter.ts';
import { bindLogger } from '../src/core/logger.ts';
import type { ForwardNode, MessageEvent } from '../src/types.ts';

const nodes: ForwardNode[] = [{
  type: 'node',
  data: {
    user_id: '10000',
    nickname: 'Pixiv',
    uin: '10000',
    name: 'Pixiv',
    content: [{ type: 'text', data: { text: 'demo' } }],
  },
}];

test('NapCat adapter calls native actions for messages and merged forwards', async () => {
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
  await bot.sendGroupForwardMessage('123', nodes);
  await bot.sendPrivateForwardMessage('456', nodes);

  assert.equal(calls.length, 4);
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
  assert.equal(calls[2].action, 'send_group_forward_msg');
  assert.deepEqual(calls[2].params, { group_id: '123', messages: nodes });
  assert.equal(calls[3].action, 'send_private_forward_msg');
  assert.deepEqual(calls[3].params, { user_id: '456', messages: nodes });
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static latest: FakeWebSocket | null = null;
  static created = 0;

  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  protected readonly listeners = new Map<string, Array<(event: any) => void>>();

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.latest = this;
    FakeWebSocket.created += 1;
    queueMicrotask(() => this.handshake());
  }

  protected handshake(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
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

  emitRaw(data: string): void {
    this.emit('message', { data });
  }

  protected emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test('OneBot WS adapter supports message and merged-forward actions', async () => {
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
    await bot.sendPrivateMessage(456, 'private');
    await bot.sendGroupForwardMessage(123, nodes);
    await bot.sendPrivateForwardMessage(456, nodes);

    const requests = socket.sent.map((entry) => JSON.parse(entry) as {
      action: string;
      params: Record<string, unknown>;
      echo: string;
    });

    assert.deepEqual(requests.map((request) => request.action), [
      'send_group_msg',
      'send_private_msg',
      'send_group_forward_msg',
      'send_private_forward_msg',
    ]);
    assert.equal(requests[0].params.group_id, '123');
    assert.equal(requests[1].params.user_id, '456');
    assert.deepEqual(requests[2].params.messages, nodes);
    assert.deepEqual(requests[3].params.messages, nodes);
    assert.match(requests[0].echo, /^pixiv-/);

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

// Node's built-in WebSocket reports every failed connect (refused port, wrong
// token or path) as an 'error' event while still CONNECTING and never fires 'close'.
class RefusedWebSocket extends FakeWebSocket {
  protected override handshake(): void {
    this.emit('error', { message: 'Received network error or non-101 status code.' });
  }
}

class RefusedWithCloseWebSocket extends FakeWebSocket {
  protected override handshake(): void {
    this.emit('error', { message: 'connect failed' });
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { code: 1006, reason: '' });
  }
}

class SilentWebSocket extends FakeWebSocket {
  override send(data: string): void {
    this.sent.push(data);
  }
}

class FailingWebSocket extends FakeWebSocket {
  override send(data: string): void {
    this.sent.push(data);
    const request = JSON.parse(data) as { echo: string };
    queueMicrotask(() => {
      this.emit('message', {
        data: JSON.stringify({ status: 'failed', retcode: 1200, wording: 'bad group', echo: request.echo }),
      });
    });
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function withWebSocket(impl: typeof FakeWebSocket, run: () => Promise<void>): Promise<void> {
  const realWebSocket = globalThis.WebSocket;
  FakeWebSocket.created = 0;
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: impl });
  try {
    await run();
  } finally {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: realWebSocket });
  }
}

const RECONNECT_ONE_SECOND = {
  url: 'ws://127.0.0.1:3001/',
  minReconnectDelayMs: 1_000,
  maxReconnectDelayMs: 1_000,
};

test('a failed connect (error without close) is retried instead of ending the loop', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withWebSocket(RefusedWebSocket, async () => {
    const bot = new OneBotWsAdapter(RECONNECT_ONE_SECOND);
    bot.start(() => {});
    await flush();
    assert.equal(FakeWebSocket.created, 1);
    assert.equal(bot.isConnected, false);

    t.mock.timers.tick(1_100);
    await flush();
    assert.equal(FakeWebSocket.created, 2, 'no reconnect after the failed connect');

    bot.stop();
    t.mock.timers.tick(10_000);
    await flush();
    assert.equal(FakeWebSocket.created, 2, 'stop() must cancel the pending reconnect');
  });
});

test('an error followed by a close schedules one reconnect, not two', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withWebSocket(RefusedWithCloseWebSocket, async () => {
    const bot = new OneBotWsAdapter(RECONNECT_ONE_SECOND);
    bot.start(() => {});
    await flush();

    t.mock.timers.tick(1_100);
    await flush();
    assert.equal(FakeWebSocket.created, 2);
    bot.stop();
  });
});

test('an established connection that drops is re-opened', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withWebSocket(FakeWebSocket, async () => {
    const bot = new OneBotWsAdapter(RECONNECT_ONE_SECOND);
    bot.start(() => {});
    await flush();
    assert.equal(bot.isConnected, true);

    FakeWebSocket.latest?.close(1011);
    assert.equal(bot.isConnected, false);

    t.mock.timers.tick(1_100);
    await flush();
    assert.equal(FakeWebSocket.created, 2);
    assert.equal(bot.isConnected, true);
    bot.stop();
  });
});

test('calling start() twice keeps a single connection', async () => {
  await withWebSocket(FakeWebSocket, async () => {
    const bot = new OneBotWsAdapter({ url: 'ws://127.0.0.1:3001/' });
    bot.start(() => {});
    bot.start(() => {});
    await flush();
    assert.equal(FakeWebSocket.created, 1);
    bot.stop();
  });
});

test('frames that are not JSON objects are ignored without crashing the process', async () => {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => { rejections.push(reason); };
  process.on('unhandledRejection', onRejection);
  try {
    await withWebSocket(FakeWebSocket, async () => {
      const events: MessageEvent[] = [];
      const bot = new OneBotWsAdapter({ url: 'ws://127.0.0.1:3001/' });
      bot.start((event) => { events.push(event); });
      await flush();

      const socket = FakeWebSocket.latest;
      if (!socket) throw new Error('fake WebSocket was not created');
      for (const raw of ['null', '"text"', '123', 'true', '[]', '{']) socket.emitRaw(raw);
      socket.emitEvent({ post_type: 'message', message_type: 'group', group_id: '1', user_id: '2', raw_message: '#pixivping' });
      await flush();

      assert.equal(events.length, 1, 'the valid event after the junk frames must still arrive');
      assert.deepEqual(rejections, []);
      bot.stop();
    });
  } finally {
    process.off('unhandledRejection', onRejection);
  }
});

test('an unanswered action times out and a dropped connection rejects pending actions', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withWebSocket(SilentWebSocket, async () => {
    const bot = new OneBotWsAdapter({ url: 'ws://127.0.0.1:3001/', requestTimeoutMs: 1_000 });
    bot.start(() => {});
    await flush();

    const timedOut = assert.rejects(bot.call('get_login_info', {}), /OneBot action timeout: get_login_info/);
    t.mock.timers.tick(1_000);
    await timedOut;

    const dropped = assert.rejects(bot.call('get_status', {}), /OneBot WebSocket closed \(1006\)/);
    FakeWebSocket.latest?.close(1006);
    await dropped;
    bot.stop();
  });
});

test('a failed OneBot action rejects with the server wording', async () => {
  await withWebSocket(FailingWebSocket, async () => {
    const bot = new OneBotWsAdapter({ url: 'ws://127.0.0.1:3001/', requestTimeoutMs: 1_000 });
    bot.start(() => {});
    await flush();
    await assert.rejects(bot.sendGroupMessage(1, 'hello'), /bad group/);
    bot.stop();
  });
});

class FlappingWebSocket extends FakeWebSocket {
  protected override handshake(): void {
    super.handshake();
    this.close(1005);
  }
}

test('a server that accepts and immediately drops the socket is retried with a growing delay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  await withWebSocket(FlappingWebSocket, async () => {
    const bot = new OneBotWsAdapter({
      url: 'ws://127.0.0.1:3001/',
      minReconnectDelayMs: 1_000,
      maxReconnectDelayMs: 30_000,
    });
    bot.start(() => {});
    await flush();
    assert.equal(FakeWebSocket.created, 1);

    t.mock.timers.tick(1_100);
    await flush();
    assert.equal(FakeWebSocket.created, 2, 'first retry after about 1s');

    // 1.5s is past the first delay (1.0-1.1s) but short of the doubled one (1.8-2.2s).
    t.mock.timers.tick(1_500);
    await flush();
    assert.equal(FakeWebSocket.created, 2, 'second retry must wait about 2s, not 1s');

    t.mock.timers.tick(800);
    await flush();
    assert.equal(FakeWebSocket.created, 3);
    bot.stop();
  });
});

test('a connection that stayed up starts the backoff over', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  await withWebSocket(FakeWebSocket, async () => {
    const bot = new OneBotWsAdapter({
      url: 'ws://127.0.0.1:3001/',
      minReconnectDelayMs: 1_000,
      maxReconnectDelayMs: 30_000,
    });
    bot.start(() => {});
    await flush();

    for (let round = 2; round <= 4; round += 1) {
      t.mock.timers.tick(11_000); // stays up longer than the stability window
      FakeWebSocket.latest?.close(1011);
      t.mock.timers.tick(1_100);
      await flush();
      assert.equal(FakeWebSocket.created, round, `reconnect ${round} should be about 1s after a healthy connection`);
    }
    bot.stop();
  });
});

test('an unsolicited failed frame (NapCat token rejection) is reported with an actionable hint', async () => {
  const errors: string[] = [];
  bindLogger({ error: (message) => errors.push(message), warn: () => {}, info: () => {} });
  try {
    await withWebSocket(FakeWebSocket, async () => {
      const bot = new OneBotWsAdapter({ url: 'ws://127.0.0.1:3001/' });
      bot.start(() => {});
      await flush();

      FakeWebSocket.latest?.emitRaw(JSON.stringify({
        status: 'failed', retcode: 1403, data: null, message: 'token验证失败', wording: 'token验证失败', echo: null,
      }));
      await flush();

      assert.equal(errors.length, 1);
      assert.match(errors[0], /token验证失败/);
      assert.match(errors[0], /NAPCAT_WS_TOKEN/);
      assert.doesNotMatch(errors[0], /secret/);
      bot.stop();
    });
  } finally {
    bindLogger(null);
  }
});

'use strict';

const WebSocket = require('ws');
const config = require('./config');
const { handleMessage } = require('./handlers/message-handler');

function start() {
  const headers = config.wsToken
    ? { Authorization: `Bearer ${config.wsToken}` }
    : {};

  const ws = new WebSocket(config.wsUrl, { headers });

  ws.on('open', () => {
    console.log(`[Pixiv] Connected → ${config.wsUrl}`);
  });

  ws.on('message', (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return; // malformed frame — ignore
    }

    // Only handle message events; ignore meta_event, notice, etc.
    if (event.post_type !== 'message') return;

    const send = (msg) => reply(ws, event, msg);

    handleMessage(event, send).catch((err) => {
      console.error('[Pixiv] Unhandled error in handler:', err.message);
    });
  });

  ws.on('error', (err) => {
    console.error('[Pixiv] WebSocket error:', err.message);
  });

  ws.on('close', () => {
    console.log('[Pixiv] Disconnected — reconnecting in 5 s…');
    setTimeout(start, 5_000);
  });
}

function reply(ws, event, message) {
  const isGroup = event.message_type === 'group';
  ws.send(
    JSON.stringify({
      action: isGroup ? 'send_group_msg' : 'send_private_msg',
      params: isGroup
        ? { group_id: event.group_id, message }
        : { user_id: event.user_id, message },
    })
  );
}

start();

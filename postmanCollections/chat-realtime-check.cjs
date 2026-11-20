const { randomUUID } = require('crypto');
const { io } = require('socket.io-client');

const token = process.env.CHAT_ACCESS_TOKEN;
const conversationId = Number(process.env.CHAT_CONVERSATION_ID);
const origin = (process.env.CHAT_SOCKET_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
);

if (!token || !Number.isSafeInteger(conversationId) || conversationId < 1) {
  console.error(
    'Set CHAT_ACCESS_TOKEN and a valid CHAT_CONVERSATION_ID before running this check.',
  );
  process.exit(1);
}

const socket = io(`${origin}/chat`, {
  path: '/socket.io',
  auth: { token },
  timeout: 10000,
  reconnection: false,
});

for (const event of [
  'message:created',
  'conversation:updated',
  'conversation:read',
  'typing:changed',
]) {
  socket.on(event, (payload) => {
    console.log(`\n${event}`);
    console.log(JSON.stringify(payload, null, 2));
  });
}

socket.on('connect', () => {
  console.log(`Connected to ${origin}/chat; joining conversation ${conversationId}`);
  socket.emit('conversation:join', { conversationId }, (ack) => {
    console.log('conversation:join acknowledgement:');
    console.log(JSON.stringify(ack, null, 2));

    if (!ack || !ack.success || !process.argv.includes('--send')) return;

    socket.emit(
      'message:send',
      {
        conversationId,
        clientMessageId: randomUUID(),
        text: 'Socket.IO realtime test',
        attachmentIds: [],
      },
      (sendAck) => {
        console.log('message:send acknowledgement:');
        console.log(JSON.stringify(sendAck, null, 2));
      },
    );
  });
});

socket.on('connect_error', (error) => {
  console.error(`Socket.IO connection failed: ${error.message}`);
});

socket.on('disconnect', (reason) => {
  console.log(`Disconnected: ${reason}`);
});

process.on('SIGINT', () => {
  socket.disconnect();
  process.exit(0);
});

# Customer support chat

The backend provides one permanent support conversation per customer or seller. Admins share an inbox and can reply to every conversation. There is no frontend UI in this repository. Existing catalog-media endpoints are unchanged.

## Configuration and deployment

- Use the existing PostgreSQL, JWT access-token secret, and Cloudinary credentials.
- Set `CHAT_ALLOWED_ORIGINS` to comma-separated browser origins, for example `https://shop.example.com,https://admin.example.com`. Development defaults are `http://localhost:3000,http://localhost:5173`. Origins include scheme and port, with no trailing slash.
- Generate the Prisma client (`npx prisma generate`), apply committed migrations (`npx prisma migrate deploy`), then build (`npm run build`). The additive support-chat migration creates four tables and does not modify catalog data.
- Run one backend instance. Multiple instances require a shared Socket.IO adapter, distributed rate limits, and coordinated cleanup before rollout. Proxy `/socket.io/` with WebSocket upgrade support and appropriate polling timeouts.
- Monitor authentication rejections, message failures, provider verification failures, and cleanup retries. Avoid logging tokens, signed URLs, or message contents.

## HTTP API

Base path: `/api/v1/chat`. Every request requires `Authorization: Bearer <accessToken>`. Responses use the application's usual `{ success, statusCode, message, data, ... }` envelope. Swagger lists request DTOs under **Support chat**.

| Method/path | Request | Result in `data` |
| --- | --- | --- |
| POST `/conversations` | None; customer/seller only | Existing or newly created conversation |
| GET `/conversations?page=1&limit=20` | Limit 1–100 | `{ items, total, page, limit }`; admin sees all, other users only their own |
| GET `/conversations/:id/messages?limit=50` | Optional `beforeSequence` OR `afterSequence`; limit 1–100 | `{ items, hasMore, nextCursor }` |
| POST `/conversations/:id/messages` | `{ clientMessageId, text?, attachmentIds? }` | Persisted message |
| PUT `/conversations/:id/read` | `{ sequence }` | `{ conversationId, userId, sequence }` |
| POST `/conversations/:id/uploads` | `{ resourceType: "image" \| "video" }` | `{ uploadId, uploadUrl, fields, maxBytes, maxDuration }` |
| POST `/conversations/:id/uploads/:uploadId/complete` | None | Verified attachment metadata, including `id` |
| GET `/attachments/:id/access` | None | `{ url, expiresAt }`, with `Cache-Control: no-store` |

Conversation summaries contain `id`, `userId`, `lastSequence`, timestamps, `user: { id, name }`, `readSequence`, `readPositions: [{ userId, sequence }]`, `unreadCount`, and `lastMessage`. Counts exclude the viewer's own messages. Admin read positions are independent. Inbox ordering is latest conversation activity, descending, with ID as a tie breaker.

Messages contain `id`, `conversationId`, `senderId`, `clientMessageId`, `sequence`, `text`, `createdAt`, `sender: { id, name, role }`, and `attachments`. Attachments contain `id`, `resourceType`, `format`, `bytes`, `width`, `height`, and `duration`; they contain no public URL. Dates are ISO strings. Message text is plain text: render it as text, never HTML.

Messages are limited to 4,000 characters and four unique attachments. At least trimmed text or one attachment is required. Attachment-only messages have `text: null`. `clientMessageId` must be a UUID and remain unchanged on retries. Its uniqueness is per sender, across transports and conversations. Reusing it with different content returns 409.

History is always returned in ascending sequence order. With no cursor, fetch the newest page. To load older messages use `beforeSequence=nextCursor`; to catch up use `afterSequence=lastContiguousSequence`, continuing with `nextCursor` while `hasMore` is true. Sequence allocation and persistence are transactional; failed sends do not consume sequence numbers.

Read positions can only advance and cannot exceed the latest persisted sequence. Mark read only when messages are visible to the viewer. A saved message acknowledgement means persisted, not delivered or read by the recipient.

## Socket.IO contract

Install `socket.io-client` v4 in the frontend. Connect to namespace `/chat` using path `/socket.io`; the namespace is **not** under `/api/v1`. This is Socket.IO, not a raw WebSocket protocol.

```ts
import { io } from 'socket.io-client';

const socket = io(`${backendOrigin}/chat`, {
  path: '/socket.io',
  auth: { token: accessToken },
});

socket.on('message:created', reconcileMessage);
socket.on('conversation:updated', replaceConversationSummary);
socket.on('conversation:read', updateReadPosition);
socket.on('typing:changed', updateTypingIndicator);

socket.on('connect', async () => {
  const joined = await socket.timeout(10000).emitWithAck('conversation:join', { conversationId });
  if (joined.success) await catchUpFromPersistedHistory();
});

const payload = {
  conversationId,
  clientMessageId: crypto.randomUUID(),
  text: 'I need help with my order',
  attachmentIds: [],
};
const ack = await socket.timeout(10000).emitWithAck('message:send', payload);
// Keep payload.clientMessageId for all retries, including a REST fallback.
```

The callback names above are application functions to implement in the frontend.

| Client event | Payload | Successful acknowledgement data |
| --- | --- | --- |
| `conversation:join` | `{ conversationId }` | Current summary, including persisted read positions |
| `conversation:leave` | `{ conversationId }` | `{ conversationId }` |
| `message:send` | `{ conversationId, clientMessageId, text?, attachmentIds? }` | Persisted message |
| `conversation:read` | `{ conversationId, sequence }` | Persisted viewer read position |
| `typing:set` | `{ conversationId, typing: boolean }` | Typing payload |

Acknowledgements are `{ success: true, data }` or `{ success: false, error: { statusCode, message } }`. Error `message` can be a string or Nest's validation/error object. Handle acknowledgement timeouts separately; the database write may already have succeeded.

| Server event | Payload / audience |
| --- | --- |
| `message:created` | Persisted message; authorized viewers who joined the thread |
| `conversation:read` | `{ conversationId, userId, sequence }`; authorized joined viewers |
| `conversation:updated` | Personalized summary; owning user and connected admins, including those outside the thread |
| `typing:changed` | `{ conversationId, userId, typing, expiresAt }`; authorized joined viewers |

Register listeners once, before joining. Deduplicate events and acknowledgements by message ID/client UUID and sort by sequence: asynchronous notifications can arrive out of order. Track the highest **contiguous** received sequence; fetch gaps, catch up on every reconnect, and refresh the active thread periodically (15 seconds while visible) so a committed write whose broadcast was interrupted is recovered. Refresh inbox summaries on reconnect and browser focus. Typing automatically expires after five seconds; expire it locally as well.

Sockets disconnect when their access token expires. Refresh with the existing auth API, update `socket.auth = { token: newAccessToken }`, then call `socket.connect()` and rejoin. A server disconnect does not automatically reconnect. Do not retry authentication errors endlessly. Roles and user existence are rechecked before protected operations and broadcasts; client-supplied roles/sender IDs are rejected.

## Image and video upload flow

1. Validate locally for early feedback: JPEG/PNG/WebP/AVIF images ≤5 MiB; MP4/WebM videos ≤20 MiB and ≤30 seconds. At most four files per message. Actual server-side provider metadata is authoritative; browser checks are only UX.
2. Request one upload reservation per file. The backend binds its generated public ID to the uploader and conversation and signs authenticated delivery with overwrite disabled.
3. Send multipart `FormData` directly to `uploadUrl`: include every returned `fields` value converted to a string, plus `file`. Do not send your application JWT to Cloudinary. Use XMLHttpRequest upload progress if needed.
4. After Cloudinary completes, call the completion endpoint. The backend independently retrieves metadata and rejects incorrect format, size, duration, ownership, or delivery type. Do not submit client-provided URLs or metadata.
5. Send the returned attachment IDs with the message. Only that uploader can attach them, only to that conversation, and each attachment can be consumed once. Retry a failed send using the original message UUID.
6. For viewing, request `/attachments/:id/access`. Use the temporary URL for `<img>` or `<video controls preload="metadata">`. Renew expired URLs through this endpoint; never persist them in local storage or message history. Signed links are bearer links valid for five minutes.

Use local object URLs for pre-send previews and revoke them when removed. Keep upload/verification failures separate from message-send failures. Retry transient completion failures (503) with backoff before reserving a new upload. Uploaded assets are authenticated, not public catalog media; the access endpoint works only once attached to a message.

Reservations expire after 24 hours. Hourly cleanup claims expired, unattached assets before provider deletion, retries failures, and never deletes message attachments. Format/size/duration violations are rejected at verification, so the provider may temporarily store rejected uploads before cleanup. Configure provider account limits as appropriate.

## Errors and limits

Common statuses: 400 invalid message/media/read position, 401 invalid access token, 403 admin trying to open a personal support thread, 404 unavailable/unauthorized thread or attachment, 409 UUID conflict or expired upload, 429 rate limit, 503 provider verification unavailable.

Per account, across REST and sockets: 30 new-message attempts/minute, 10 upload reservations/minute, and two typing updates/second. Idempotent retries of already saved messages do not consume message quota. Socket packets are limited to 32 KiB; never send binary attachments through the socket.

## Tests and staging checks

`npm test -- --runInBand` runs unit and transport tests. `npm run test:e2e -- --runInBand` runs the PostgreSQL/Socket.IO suite when `CHAT_TEST_DATABASE_URL` is set to a test database; otherwise that suite is explicitly skipped. It creates and removes a randomly named schema and never uses `DATABASE_URL`. The test database account needs schema creation permission. Cloudinary is mocked for database integration tests.

Before production, use staging credentials to upload an image and a short video from each role; verify rendering/playback, unsigned URL denial, oversized and overlong rejection, five-minute URL expiry, offline catch-up, and expired-token reconnection. This real-provider check is separate from mocked automated tests. Use the **Support Chat** folder in the Postman collection for HTTP exploration. For a live Socket.IO check, run `node postmanCollections/chat-realtime-check.cjs` with `CHAT_ACCESS_TOKEN` and `CHAT_CONVERSATION_ID` set; add `--send` to send a test message. The Socket.IO suite also verifies realtime transport.

Excluded: frontend implementation, ticket assignment/closing, message editing/deletion, push/email notifications, AI replies, and calls.

import { isRoomId } from "../../../../lib/simulator/room-id.js";
import { getRoom } from "../../../../lib/simulator/rooms.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const maxBodyBytes = 65536;
const json = (payload, status = 200) => Response.json(payload, {
  status, headers: { "cache-control": "no-store" }
});
const error = (message, status) => json({ ok: false, error: message }, status);

function streamRoom(request, room) {
  if (room.connections >= 16) return error("演習への接続数の上限に達しました。", 503);

  let dispose;
  const stream = new ReadableStream({
    start(controller) {
      ++room.connections;
      let unsubscribe;
      let heartbeat;
      let closed = false;
      dispose = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", close);
        --room.connections;
        room.lastAccess = Date.now();
      };
      function close() {
        if (closed) return;
        dispose();
        controller.close();
      }
      function send(message) {
        if (closed) return;
        if (controller.desiredSize <= 0) {
          close();
          return;
        }
        controller.enqueue(encoder.encode(message));
      }

      unsubscribe = room.session.subscribe({
        update: state => send(`data: ${JSON.stringify(state)}\n\n`),
        close
      });
      if (request.signal.aborted) {
        close();
        return;
      }
      request.signal.addEventListener("abort", close, { once: true });
      heartbeat = setInterval(() => send(": heartbeat\n\n"), 15000);
      heartbeat.unref();
    },
    cancel() {
      dispose?.();
    }
  }, { highWaterMark: 16 });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no"
    }
  });
}

async function readAction(request) {
  if (!request.body) throw new Error("操作データを指定してください。");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        void reader.cancel().catch(() => {});
        throw Object.assign(new Error("操作データが大きすぎます。"), { status: 413 });
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  if (origin === url.origin) return true;
  const host = request.headers.get("host");
  const scheme = request.headers.get("x-forwarded-proto") || url.protocol.slice(0, -1);
  return origin === `${scheme}://${host}`;
}

export async function GET(request, { params }) {
  const { endpoint } = await params;
  if (endpoint === "action") return error("Method not allowed", 405);
  if (endpoint !== "state" && endpoint !== "events") return error("Not found", 404);
  if (!sameOrigin(request)) return error("Origin not allowed", 403);
  const id = request.nextUrl.searchParams.get("room");
  if (!isRoomId(id)) return error("有効な接続IDを指定してください。", 400);

  const room = getRoom(id);
  if (!room) return error("演習数の上限に達しました。", 503);
  return endpoint === "state" ? json(room.session.snapshot()) : streamRoom(request, room);
}

export async function POST(request, { params }) {
  const { endpoint } = await params;
  if (endpoint === "state" || endpoint === "events") return error("Method not allowed", 405);
  if (endpoint !== "action") return error("Not found", 404);
  if (!sameOrigin(request)) return error("Origin not allowed", 403);
  const id = request.nextUrl.searchParams.get("room");
  if (!isRoomId(id)) return error("有効な接続IDを指定してください。", 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return error("Content-Type must be application/json", 415);
  }

  let body;
  try {
    body = await readAction(request);
  } catch (cause) {
    return error("操作データを読み取れません。", cause.status || 400);
  }
  if (!body || typeof body.action !== "string" || (body.operationId !== undefined && !isRoomId(body.operationId))) {
    return error("操作データが無効です。", 400);
  }

  /** @type {import("../../../../lib/simulator/types.js").MonitorAction} */
  const { action, value, operationId } = body;
  const room = getRoom(id);
  if (!room) return error("演習数の上限に達しました。", 503);
  const fingerprint = JSON.stringify({ action, value });
  if (operationId && room.operations.has(operationId)) {
    if (room.operations.get(operationId) !== fingerprint) return error("同じ操作IDがすでに使用されています。", 409);
    return json({ ok: true, duplicate: true, state: room.session.snapshot() });
  }

  let ok;
  try {
    ok = room.session.applyAction(action, value);
  } catch {
    return error("操作データが無効です。", 400);
  }
  if (ok && operationId) {
    room.operations.set(operationId, fingerprint);
    if (room.operations.size > 1000) room.operations.delete(room.operations.keys().next().value);
  }
  if (!ok) return json({ ok, error: "この操作を適用できませんでした。", state: room.session.snapshot() }, 400);
  return json({ ok, state: room.session.snapshot() });
}

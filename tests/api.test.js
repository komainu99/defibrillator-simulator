import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { GET, POST } from "../src/app/api/sim-monitor/[endpoint]/route.js";

function request(endpoint, room, options) {
  const url = new URL(`http://localhost:3000/api/sim-monitor/${endpoint}?room=${room}`);
  const incoming = Object.assign(new Request(url, options), { nextUrl: url });
  const context = { params: Promise.resolve({ endpoint }) };
  return options?.method === "POST" ? POST(incoming, context) : GET(incoming, context);
}

test("room API initial state, SSE update, retry deduplication and isolation", { timeout: 4000 }, async () => {
  const room = randomUUID();
  const other = randomUUID();
  const sse = await request("events", room);
  assert.match(sse.headers.get("content-type"), /text\/event-stream/);
  const reader = sse.body.getReader();
  const readState = async () => {
    const { value } = await reader.read();
    return JSON.parse(new TextDecoder().decode(value).slice(6));
  };
  try {
    assert.equal((await readState()).powered, false);
    const operationId = randomUUID();
    const send = (body, origin = "http://localhost:3000") => request("action", room, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ ...body, operationId })
    });
    const act = { action: "SET_ROTARY_POSITION", value: { position: "energy", joules: 150 } };
    assert.equal((await send(act)).status, 200);
    assert.equal((await readState()).energy, 150);
    assert.equal((await (await send(act)).json()).duplicate, true);
    assert.equal((await send({ action: "SHOCK" })).status, 409);
    assert.equal((await send(act, "https://example.invalid")).status, 403);
    assert.equal((await request("state", "invalid")).status, 400);
    assert.equal((await (await request("state", other)).json()).powered, false);
  } finally {
    await reader.cancel();
  }
});

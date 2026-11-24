import { createId } from "./room-id.js";

export function monitorApiUrl(endpoint, room) {
  return `/api/sim-monitor/${endpoint}?${new URLSearchParams({ room })}`;
}

/**
 * @param {string} room
 * @param {import("./types.js").MonitorAction["action"]} action
 * @param {import("./types.js").MonitorAction["value"]} [value]
 */
export async function sendMonitorAction(room, action, value) {
  const response = await fetch(monitorApiUrl("action", room), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, value, operationId: createId() })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || `操作を送信できません（${action}）`);
  }
  return response.json();
}

import { sendMonitorAction } from "../../lib/simulator/client.js";

const buttonActions = new Map([
  ["lead", "LEAD_NEXT"],
  ["sensitivity", "SENSITIVITY_NEXT"],
  ["sync", "SYNC_TOGGLE"],
  ["charge", "CHARGE"],
  ["shock", "SHOCK"]
]);

/**
 * @param {import("../../lib/simulator/types.js").PicoMessage | null} message
 * @returns {[string, unknown?] | null}
 */
export function picoAction(message) {
  if (message?.type === "rotary" || message?.type === "telemetry") {
    const reading = message.type === "rotary" ? message : message.rotary?.position;
    if (typeof reading?.position !== "string" || !reading.position) return null;
    if (reading.position === "energy" && typeof reading.joules !== "number") return null;
    return ["SET_ROTARY_POSITION", {
      position: reading.position,
      ...(reading.position === "energy" ? { joules: reading.joules } : {})
    }];
  }
  if (message?.type === "button" && typeof message.name === "string" && buttonActions.has(message.name)) {
    return [buttonActions.get(message.name)];
  }
  if (message?.type === "lead_status" && message.leads) {
    return ["SET_LEAD_STATUS", {
      red: Boolean(message.leads.red),
      yellow: Boolean(message.leads.yellow),
      green: Boolean(message.leads.green)
    }];
  }
  return null;
}

export async function readPico({ room, signal, onConnected, onSendError }) {
  const { serial } = /** @type {import("../../lib/simulator/types.js").SerialNavigator} */ (navigator);
  if (!serial) throw new Error("この環境ではWeb Serialを利用できません。");
  const port = await serial.requestPort();
  if (signal.aborted) return;
  await port.open({ baudRate: 115200 });

  let reader;
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  try {
    if (signal.aborted) return;
    if (!port.readable) throw new Error("Picoのシリアルポートを読み取れません。");
    reader = port.readable.getReader();
    signal.addEventListener("abort", cancel, { once: true });
    onConnected();
    const decoder = new TextDecoder();
    let pending = "";
    let lastRotary;
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (pending + decoder.decode(value, { stream: true })).split("\n");
      pending = lines.pop();
      if (pending.length > 65536) pending = "";

      for (const line of lines) {
        if (signal.aborted) break;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        const mapped = picoAction(message);
        if (!mapped) continue;
        const [action, data] = mapped;
        const rotary = action === "SET_ROTARY_POSITION" ? JSON.stringify(data) : null;
        if (message.type === "telemetry" && rotary === lastRotary) continue;

        try {
          await sendMonitorAction(room, action, data);
          if (rotary) lastRotary = rotary;
          if (!signal.aborted) onConnected();
        } catch (error) {
          if (!signal.aborted) onSendError(error.message);
        }
      }
    }
    if (!signal.aborted) throw new Error("Picoとの接続が切れました。");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader?.releaseLock();
    await port.close().catch(() => {});
  }
}

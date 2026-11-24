export function isRoomId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
}

export function createId() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

import { createMonitorSession } from "./session.js";

const roomTtlMs = 12 * 60 * 60 * 1000;
const maxRooms = 64;
const roomsKey = Symbol.for("defibrillator-simulator.rooms");
const rooms = globalThis[roomsKey] ??= new Map();

export function getRoom(id) {
  const now = Date.now();
  for (const [key, room] of rooms) {
    if (room.connections === 0 && now - room.lastAccess > roomTtlMs) {
      room.session.close();
      rooms.delete(key);
    }
  }

  if (!rooms.has(id)) {
    if (rooms.size >= maxRooms) return null;
    rooms.set(id, {
      session: createMonitorSession(),
      operations: new Map(),
      lastAccess: now,
      connections: 0
    });
  }

  const room = rooms.get(id);
  room.lastAccess = now;
  return room;
}

// Private reconnect tokens never enter room listings, logs, shared snapshots or URLs.
import { randomBytes } from "node:crypto";
import type { Match } from "./simulation";

export type SessionRoom = Pick<
  Match,
  "room" | "map" | "time" | "tick" | "eventSeq" | "players" | "remove"
> & {
  setConnected(id: string, connected: boolean): void;
};
export type ResumeSession = {
  token: string;
  id: string;
  room: SessionRoom;
  socket: object | null;
  expiresAt: number;
};

export const RESUME_GRACE_MS = 10_000;
export const sessions = new Map<string, ResumeSession>();

export function issueSession(room: SessionRoom, id: string, socket: object) {
  if (!room.players.has(id)) throw Error("The player no longer exists.");
  if ([...sessions.values()].some((s) => s.room === room && s.id === id))
    throw Error("This player already has a session.");
  const token = Array.from(randomBytes(32), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  sessions.set(token, { token, id, room, socket, expiresAt: 0 });
  return token;
}

export function resumeSession(
  token: unknown,
  socket: object,
  rooms: ReadonlyMap<string, SessionRoom>,
  now = Date.now(),
) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw Error("Invalid reconnect token. Join a new room.");
  const session = sessions.get(token);
  if (!session)
    throw Error("This reconnect session has expired. Join a new room.");
  // Never replace a live owner, even if another client has copied their token.
  if (session.socket !== null)
    throw Object.assign(Error("This session is already connected."), {
      code: "RESUME_IN_USE",
    });
  const roomExists = rooms.get(session.room.room) === session.room;
  if (!roomExists || !session.room.players.has(session.id)) {
    sessions.delete(token);
    throw Error("The previous room has closed. Join a new room.");
  }
  if (now >= session.expiresAt) {
    sessions.delete(token);
    session.room.remove(session.id);
    throw Error("This reconnect session has expired. Join a new room.");
  }
  session.room.setConnected(session.id, true);
  session.socket = socket;
  session.expiresAt = 0;
  return session;
}

export function disconnectSession(
  token: string | null,
  socket: object,
  code: number,
  now = Date.now(),
) {
  const session = token ? sessions.get(token) : undefined;
  // A rejected resume or a late close from an old socket cannot alter the owner.
  if (!session || session.socket !== socket) return;
  if (code === 1000 || code === 1008) {
    sessions.delete(session.token);
    session.room.remove(session.id);
    return;
  }
  session.socket = null;
  session.expiresAt = now + RESUME_GRACE_MS;
  session.room.setConnected(session.id, false);
}

export function expireSessions(
  rooms: ReadonlyMap<string, SessionRoom>,
  now = Date.now(),
) {
  for (const [token, session] of sessions) {
    const roomExists = rooms.get(session.room.room) === session.room;
    if (!roomExists || !session.room.players.has(session.id)) {
      sessions.delete(token);
    } else if (session.socket === null && now >= session.expiresAt) {
      sessions.delete(token);
      session.room.remove(session.id);
    }
  }
}

export function hasPendingSession(room: SessionRoom, now = Date.now()) {
  return [...sessions.values()].some(
    (s) => s.room === room && s.socket === null && now < s.expiresAt,
  );
}

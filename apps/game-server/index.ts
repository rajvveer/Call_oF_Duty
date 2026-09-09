import {
  issueSession,
  resumeSession,
  disconnectSession,
  expireSessions,
  hasPendingSession,
} from "./sessions";
import { PERKS } from "../../packages/game-shared/combat";
import { getNav } from "./navigation";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { Match } from "./simulation";
import { initPhysics } from "./physics";
import {
  ATTACHMENTS,
  ARENAS,
  COMBATANTS,
  type MapId,
  MAX_HUMANS,
  TICK,
  WEAPONS,
} from "../../packages/game-shared/data";
import {
  validInput,
  type ClientMessage,
} from "../../packages/game-shared/protocol";
await initPhysics();
const port = Number(process.env.PORT || 8787);
const rooms = new Map<string, Match>();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .filter(Boolean);
const server = createServer((req, res) => {
  if (req.method === "GET" && req.url?.split("?")[0] === "/rooms") {
    const listing = [...rooms.values()].map((r) => {
      const players = [...r.players.values()],
        online = players.filter((p) => !p.bot && p.connected).length;
      return {
        code: r.room,
        map: r.map,
        mapName: ARENAS[r.map].name,
        phase: r.phase,
        round: r.round,
        humans: online,
        reserved: r.humans - online,
        capacity: MAX_HUMANS,
        bots: players.filter((p) => p.bot).length,
        joinable: r.phase !== "finished" && r.humans < MAX_HUMANS,
        scores: { ...r.scores },
      };
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ rooms: listing }));
    return;
  }
  if (req.url?.split("?")[0] === "/health") {
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(
      JSON.stringify({
        status: "ok",
        game: "ASHVECTOR",
        tickRate: Math.round(1 / TICK),
        rooms: rooms.size,
        players: [...rooms.values()].reduce((n, r) => n + r.humans, 0),
        maxHumans: MAX_HUMANS,
        uptime: Math.round(process.uptime()),
        tickMs: lastTickMs,
        rssMB: process.memoryUsage().rss / 1048576,
        cpu: process.cpuUsage(),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end("ASHVECTOR game service");
});
const wss = new WebSocketServer({
  server,
  maxPayload: 4096,
  perMessageDeflate: false,
});
type Connection = {
  id: string;
  resumeToken: string | null;
  room: Match | null;
  event: number;
  count: number;
  actions: number;
  window: number;
  lastMessage: number;
  known: Map<string, string>;
  knownLoot: Map<string, string>;
  alive: boolean;
  sentTick: number;
  pendingHello: ReturnType<typeof setTimeout>;
};
const connections = new Map<WebSocket, Connection>();
function welcome(ws: WebSocket, c: Connection, resumed: boolean) {
  const room = c.room!,
    player = room.players.get(c.id)!;
  clearTimeout(c.pendingHello);
  c.known.clear();
  c.knownLoot.clear();
  c.event = room.eventSeq;
  c.sentTick = room.tick - 3;
  ws.send(
    JSON.stringify({
      type: "welcome",
      id: c.id,
      room: room.room,
      map: room.map,
      time: room.time,
      tickRate: Math.round(1 / TICK),
      resumeToken: c.resumeToken,
      resumed,
      lastSeq: player.lastSeq,
      eventSeq: room.eventSeq,
      round: room.round,
    }),
  );
}
wss.on("connection", (ws, req) => {
  if (
    allowedOrigins.length &&
    !allowedOrigins.includes(req.headers.origin || "")
  ) {
    ws.close(1008, "Origin is not permitted");
    return;
  }
  if (connections.size >= 128) {
    ws.close(1013, "Server capacity reached");
    return;
  }
  const c: Connection = {
    id: randomUUID().slice(0, 12),
    resumeToken: null,
    room: null,
    event: 0,
    count: 0,
    actions: 0,
    window: Date.now(),
    lastMessage: Date.now(),
    known: new Map(),
    knownLoot: new Map(),
    alive: true,
    sentTick: -3,
    pendingHello: setTimeout(() => ws.close(1008, "Join timed out"), 10000),
  };
  connections.set(ws, c);
  ws.on("pong", () => {
    c.alive = true;
    c.lastMessage = Date.now();
  });
  ws.on("error", () => {});
  ws.on("message", (buffer) => {
    c.lastMessage = Date.now();
    if (Date.now() - c.window > 1000) {
      c.count = 0;
      c.actions = 0;
      c.window = Date.now();
    }
    if (++c.count > 120) {
      ws.close(1008, "Message rate exceeded");
      return;
    }
    let m: ClientMessage;
    try {
      m = JSON.parse(buffer.toString());
    } catch {
      ws.close(1008, "Malformed packet");
      return;
    }
    if (!m || typeof m !== "object" || typeof m.type !== "string") {
      ws.close(1008, "Invalid message");
      return;
    }
    if (m.type === "hello") {
      if (c.room) return;
      if (m.resumeToken !== undefined) {
        try {
          const session = resumeSession(m.resumeToken, ws, rooms);
          c.id = session.id;
          c.room = session.room as Match;
          c.resumeToken = session.token;
          welcome(ws, c, true);
        } catch (error) {
          const failure = error as Error & { code?: string };
          const code =
            failure.code === "RESUME_IN_USE"
              ? "RESUME_IN_USE"
              : "RESUME_REJECTED";
          ws.send(
            JSON.stringify({ type: "error", code, message: failure.message }),
          );
          ws.close(code === "RESUME_IN_USE" ? 1013 : 1008, "Resume rejected");
        }
        return;
      }
      if (
        typeof m.name !== "string" ||
        typeof m.room !== "string" ||
        m.name.length > 32 ||
        m.room.length > 24 ||
        typeof m.loadout !== "string" ||
        typeof m.attachment !== "string" ||
        !Object.hasOwn(WEAPONS, m.loadout) ||
        m.loadout === "knife" ||
        !Object.hasOwn(ATTACHMENTS, m.attachment)
      ) {
        ws.close(1008, "Invalid join");
        return;
      }
      if (
        m.map !== undefined &&
        (typeof m.map !== "string" || !Object.hasOwn(ARENAS, m.map))
      ) {
        ws.close(1008, "Invalid map");
        return;
      }
      const selectedMap: MapId = m.map || "harbor";
      if (
        m.perk !== undefined &&
        (typeof m.perk !== "string" || !Object.hasOwn(PERKS, m.perk))
      ) {
        ws.close(1008, "Invalid perk");
        return;
      }
      let code =
        m.room.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase() || "MERIDIAN";
      let room = rooms.get(code);
      if (m.room === "") {
        room = [...rooms.values()].find(
          (r) =>
            r.phase !== "finished" &&
            r.humans < MAX_HUMANS &&
            r.map === selectedMap,
        );
        if (room) code = room.room;
        else {
          code =
            "MERIDIAN-" + Math.random().toString(36).slice(2, 6).toUpperCase();
          room = undefined;
        }
      }
      if (!room) {
        if (rooms.size >= 16) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "All operations are busy. Please try again shortly.",
            }),
          );
          return;
        }
        room = new Match(code, COMBATANTS, selectedMap);
        room.difficulty = m.difficulty === "veteran" ? "veteran" : "regular";
        rooms.set(code, room);
      }
      try {
        room.addPlayer(
          c.id,
          m.name.replace(/[<>\x00-\x1f]/g, "") || "GUEST",
          false,
          m.operator === "ochre" ? "ochre" : "sable",
        );
        room.setLoadout(c.id, m.loadout, m.attachment, true, m.perk);
        room.fillBots();
        c.room = room;
        c.resumeToken = issueSession(room, c.id, ws);
        welcome(ws, c, false);
      } catch (e) {
        ws.send(
          JSON.stringify({ type: "error", message: (e as Error).message }),
        );
        ws.close(1000);
      }
    } else if (m.type === "input") {
      if (!validInput(m.input)) {
        ws.close(1008, "Invalid input");
        return;
      }
      c.room?.input(c.id, m.input);
    } else if (m.type === "action") {
      if (++c.actions > 12) return;
      if (
        typeof m.action !== "string" ||
        (m.value !== undefined && typeof m.value !== "string") ||
        (m.value && m.value.length > 30)
      )
        return;
      c.room?.action(c.id, m);
    } else if (m.type === "ping" && Number.isFinite(m.time))
      ws.send(JSON.stringify({ type: "pong", time: m.time }));
  });
  ws.on("close", (code, reason) => {
    console.info(
      JSON.stringify({
        event: "client_closed",
        code,
        reason: reason.toString(),
        room: c.room?.room,
      }),
    );
    clearTimeout(c.pendingHello);
    if (c.resumeToken) disconnectSession(c.resumeToken, ws, code);
    else c.room?.remove(c.id);
    connections.delete(ws);
  });
});
let lastTickMs = 0,
  lastLoop = performance.now(),
  tickDebt = 0;
const loop = setInterval(() => {
  expireSessions(rooms);
  const start = performance.now();
  tickDebt = Math.min(0.25, tickDebt + (start - lastLoop) / 1000);
  lastLoop = start;
  if (tickDebt < TICK) return;
  const steps = Math.min(6, Math.floor(tickDebt / TICK));
  tickDebt -= steps * TICK;
  for (const [key, r] of rooms) {
    if (
      r.humans === 0 ||
      (r.phase === "finished" && r.time > r.phaseEnd + 60)
    ) {
      const occupied =
        [...connections.values()].some((c) => c.room === r) ||
        hasPendingSession(r);
      if (!occupied) {
        r.dispose();
        rooms.delete(key);
        continue;
      }
    }
    for (let step = 0; step < steps; step++) r.step();
  }
  lastTickMs = performance.now() - start;
  for (const [ws, c] of connections) {
    if (
      !c.room ||
      ws.readyState !== WebSocket.OPEN ||
      c.room.tick - c.sentTick < 3
    )
      continue;
    c.sentTick = c.room.tick;
    if (ws.bufferedAmount > 1048576) {
      ws.close(1013, "Connection is too slow");
      continue;
    }
    if (ws.bufferedAmount > 131072) continue;
    const snap = c.room.snapshot(c.id, c.event);
    snap.tickMs = lastTickMs;
    c.event = c.room.eventSeq;
    const current = new Map(
      snap.entities.map((e) => [e.id, JSON.stringify(e)]),
    );
    snap.full = c.room.tick % 120 < 3 || c.known.size === 0;
    snap.removed = [...c.known.keys()].filter((id) => !current.has(id));
    if (!snap.full)
      snap.entities = snap.entities.filter(
        (e) => c.known.get(e.id) !== current.get(e.id),
      );
    c.known = current;
    const lootCurrent = new Map(
      snap.loot.map((l) => [l.id, JSON.stringify(l)]),
    );
    snap.removedLoot = [...c.knownLoot.keys()].filter(
      (id) => !lootCurrent.has(id),
    );
    if (!snap.full)
      snap.loot = snap.loot.filter(
        (l) => c.knownLoot.get(l.id) !== lootCurrent.get(l.id),
      );
    c.knownLoot = lootCurrent;
    ws.send(JSON.stringify(snap));
  }
}, 8);
const heartbeat = setInterval(() => {
  for (const [ws, c] of connections) {
    if (!c.alive || Date.now() - c.lastMessage > 45000) {
      ws.terminate();
      continue;
    }
    c.alive = false;
    ws.ping();
  }
}, 2000);
for (const id of Object.keys(ARENAS) as MapId[]) getNav(id);
const host = process.env.GAME_HOST || "127.0.0.1";
if (
  !/^(127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
    host,
  )
)
  throw Error("Use a loopback or private LAN address for this local game.");
server.listen(port, host, () =>
  console.log(
    JSON.stringify({
      event: "server_started",
      port,
      tickRate: Math.round(1 / TICK),
      maxHumans: MAX_HUMANS,
    }),
  ),
);
function shutdown() {
  console.log(JSON.stringify({ event: "server_stopping" }));
  clearInterval(loop);
  clearInterval(heartbeat);
  for (const ws of connections.keys()) ws.close(1012, "Server restarting");
  wss.close();
  server.close(() => {
    for (const r of rooms.values()) r.dispose();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2500).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

import { WebSocket } from "ws";
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
const arg = (key: string, fallback: string) =>
  process.argv
    .find((a) => a.startsWith("--" + key + "="))
    ?.split("=")
    .slice(1)
    .join("=") || fallback;
const count = Number(arg("clients", "20")),
  duration = Number(arg("seconds", "15")),
  url = arg("url", "ws://127.0.0.1:8787"),
  prefix = "LOAD-" + Date.now().toString(36);
const sockets: WebSocket[] = [];
const intervals: ReturnType<typeof setInterval>[] = [];
const latencies: number[] = [],
  ticks: number[] = [];
let packets = 0,
  bytes = 0,
  welcomed = 0,
  errors = 0,
  snapshots = 0;
const healthUrl = url.replace(/^ws/, "http") + "/health";
const before = await fetch(healthUrl).then((r) => r.json());
const start = performance.now();
await Promise.all(
  Array.from(
    { length: count },
    (_, index) =>
      new Promise<void>((resolve) => {
        const ws = new WebSocket(url);
        sockets.push(ws);
        let seq = 0,
          serverTime = 0;
        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            errors++;
            resolve();
          }
        }, 12000);
        ws.on("open", () =>
          ws.send(
            JSON.stringify({
              type: "hello",
              name: "LOAD-" + index,
              room: prefix + "-" + Math.floor(index / 8),
              loadout: "kestrel",
              attachment: "balanced",
              operator: "sable",
              difficulty: "regular",
            }),
          ),
        );
        ws.on("message", (raw) => {
          bytes += Buffer.byteLength(raw.toString());
          packets++;
          const m = JSON.parse(raw.toString());
          if (m.type === "welcome") {
            welcomed++;
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve();
            }
            intervals.push(
              setInterval(() => {
                if (ws.readyState !== 1) return;
                seq++;
                ws.send(
                  JSON.stringify({
                    type: "input",
                    input: {
                      seq,
                      forward: Math.sin(seq * 0.03) > 0.3 ? 1 : 0,
                      strafe: 0,
                      yaw: index * 0.4 + seq * 0.006,
                      pitch: 0,
                      jump: false,
                      sprint: seq % 60 < 30,
                      crouch: false,
                      fire: seq % 5 < 3,
                      ads: true,
                      at: serverTime,
                    },
                  }),
                );
                if (seq % 20 === 0)
                  ws.send(
                    JSON.stringify({ type: "ping", time: performance.now() }),
                  );
              }, 50),
            );
          } else if (m.type === "snapshot") {
            snapshots++;
            serverTime = m.time;
            if (index === 0) ticks.push(m.tickMs);
          } else if (m.type === "pong")
            latencies.push(performance.now() - m.time);
          else if (m.type === "error") {
            errors++;
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve();
            }
          }
        });
        ws.on("error", () => {
          errors++;
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve();
          }
        });
      }),
  ),
);
await new Promise((resolve) => setTimeout(resolve, duration * 1000));
const end = performance.now(),
  after = await fetch(healthUrl).then((r) => r.json());
for (const i of intervals) clearInterval(i);
for (const ws of sockets) ws.close();
const percentile = (a: number[], p: number) =>
  a.length ? [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * p)] : 0;
const report = {
  clients: count,
  connected: welcomed,
  errors,
  seconds: (end - start) / 1000,
  snapshots,
  packets,
  receivedMB: bytes / 1e6,
  KBpsPerClient: bytes / 1024 / ((end - start) / 1000) / Math.max(1, welcomed),
  rttMedianMs: percentile(latencies, 0.5),
  rttP95Ms: percentile(latencies, 0.95),
  tickMedianMs: percentile(ticks, 0.5),
  tickP95Ms: percentile(ticks, 0.95),
  before,
  after,
};
mkdirSync("docs/benchmarks", { recursive: true });
writeFileSync(
  "docs/benchmarks/load-" + count + ".json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
setTimeout(() => process.exit(errors || welcomed !== count ? 1 : 0), 300);

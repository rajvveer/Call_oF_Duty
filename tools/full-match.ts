import { Match } from "../apps/game-server/simulation";
import { initPhysics } from "../apps/game-server/physics";
import { performance } from "node:perf_hooks";
import { TDM, TICK, arenaFor } from "../packages/game-shared/data";
await initPhysics();
const m = new Match("FULL-LOOP", 12, arenaFor(process.argv[2]).id);
m.addPlayer("human", "OBSERVER");
m.fillBots();
const start = performance.now();
for (let n = 0; n < (TDM.duration + 20) / TICK && m.phase !== "finished"; n++)
  m.step();
const report = {
  map: m.map,
  phase: m.phase,
  winner: m.winnerTeam,
  scores: m.scores,
  alive: m.alive,
  simulatedSeconds: m.tick * TICK,
  wallSeconds: (performance.now() - start) / 1000,
  kills: [...m.players.values()].reduce((a, p) => a + p.kills, 0),
  scoreboard: [...m.players.values()].map((p) => ({
    name: p.name,
    team: p.team,
    deaths: p.deaths,
    kills: p.kills,
  })),
};
console.log(JSON.stringify(report, null, 2));
m.dispose();
if (
  report.phase !== "finished" ||
  report.kills !== report.scores.blue + report.scores.red
)
  process.exit(1);

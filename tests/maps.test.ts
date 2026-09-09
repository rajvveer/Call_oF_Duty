import { beforeAll, afterEach, expect, it } from "vitest";
import { Match } from "../apps/game-server/simulation";
import { initPhysics } from "../apps/game-server/physics";
import { getNav, route } from "../apps/game-server/navigation";
import { ARENAS, MAP_IDS } from "../packages/game-shared/arenas";
import { colliders, groundHeight } from "../packages/game-shared/map";
import { movePlayer } from "../packages/game-shared/movement";
import { neutralInput } from "../packages/game-shared/protocol";

const matches: Match[] = [];
beforeAll(initPhysics);
afterEach(() => {
  for (const m of matches) m.dispose();
  matches.length = 0;
});

it.each(MAP_IDS)(
  "runs %s with safe team spawns, its own bounds and connected navigation",
  (id) => {
    const arena = ARENAS[id],
      m = new Match("MAP-" + id, 12, id);
    matches.push(m);
    m.addPlayer("human", "PLAYER");
    m.fillBots();
    m.transition("active");
    for (const p of m.players.values()) {
      expect(p.map).toBe(id);
      expect(p.x).toBeGreaterThan(arena.minX);
      expect(p.x).toBeLessThan(arena.maxX);
      expect(p.z).toBeGreaterThan(arena.minZ);
      expect(p.z).toBeLessThan(arena.maxZ);
      expect(groundHeight(p.x, p.z)).toBe(0);
      expect(
        colliders.some(
          (c) =>
            Math.abs(p.x - c.x) < c.w / 2 + 0.32 &&
            Math.abs(p.z - c.z) < c.d / 2 + 0.32 &&
            p.y < c.y + c.h / 2 &&
            p.y + 1.8 > c.y - c.h / 2,
        ),
      ).toBe(false);
    }
    const a = m.players.get("human")!,
      b = [...m.players.values()].find((p) => p.team !== a.team)!;
    expect(route(a, b).length).toBeGreaterThan(0);
    expect(getNav(id).length).toBeGreaterThan(
      ((arena.maxX - arena.minX) * (arena.maxZ - arena.minZ)) / 8,
    );
    const snapshot = m.snapshot(a.id);
    expect(snapshot.map).toBe(id);
    a.x = arena.maxX - 1;
    a.z = arena.maxZ - 1;
    for (let i = 1; i < 30; i++)
      movePlayer(a, { ...neutralInput(i), strafe: 1, forward: -1 });
    expect(a.x).toBeLessThanOrEqual(arena.maxX - 1);
    expect(a.z).toBeLessThanOrEqual(arena.maxZ - 1);
  },
);

it("keeps routes isolated between maps and provides six different layouts", () => {
  expect(MAP_IDS).toHaveLength(6);
  const signatures = MAP_IDS.map((id) => {
    const a = ARENAS[id];
    return colliders
      .filter(
        (c) => c.x > a.minX && c.x < a.maxX && c.z > a.minZ && c.z < a.maxZ,
      )
      .map((c) => [c.kind, Math.round(c.x - a.minX), Math.round(c.z - a.minZ)]);
  });
  expect(new Set(signatures.map((s) => JSON.stringify(s))).size).toBe(6);
  const from = { x: -54, y: 0, z: -94, map: "harbor" as const },
    to = { x: -248, y: 0, z: -260, map: "foundry" as const };
  expect(route(from, to)).toEqual([]);
});

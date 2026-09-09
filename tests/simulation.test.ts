import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { Match } from "../apps/game-server/simulation";
import { initPhysics, GrenadePhysics } from "../apps/game-server/physics";
import { applyDamage, zoneAt } from "../packages/game-shared/zone";
import {
  TDM,
  TICK,
  WEAPONS,
  WEAPON_IDS,
  random,
  rollLoot,
  weaponDamage,
} from "../packages/game-shared/data";
import {
  groundHeight,
  buildings,
  nearbyColliders,
} from "../packages/game-shared/map";
import { movePlayer } from "../packages/game-shared/movement";
import { neutralInput, validInput } from "../packages/game-shared/protocol";
const matches: Match[] = [];
beforeAll(async () => {
  await initPhysics();
});
afterEach(() => {
  for (const m of matches) m.dispose();
  matches.length = 0;
});
function advance(m: Match, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / TICK); i++) m.step();
}
function match(count = 2) {
  const m = new Match("TEST", count);
  matches.push(m);
  m.addPlayer("a", "ALPHA");
  if (count > 1) m.addPlayer("b", "BRAVO");
  return m;
}
describe("deterministic game rules", () => {
  it("has eleven distinct usable weapons with meaningful falloff and body damage", () => {
    expect(WEAPON_IDS).toHaveLength(11);
    for (const id of WEAPON_IDS) {
      expect(weaponDamage(id, 5, "head")).toBeGreaterThan(weaponDamage(id, 5));
      expect(weaponDamage(id, 500)).toBeLessThan(weaponDamage(id, 5));
      expect(WEAPONS[id].mag).toBeGreaterThan(0);
    }
  });
  it("uses armor before health and rejects invalid damage", () => {
    expect(applyDamage(100, 50, 75)).toEqual({ hp: 75, armor: 0 });
    expect(applyDamage(100, 50, 999)).toEqual({ hp: 0, armor: 0 });
    expect(applyDamage(100, 50, -1)).toEqual({ hp: 100, armor: 50 });
    expect(applyDamage(100, 50, NaN)).toEqual({ hp: 100, armor: 50 });
  });
  it("matches the declared loot probabilities", () => {
    const rng = random(72),
      counts: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      const kind = rollLoot(rng());
      counts[kind] = (counts[kind] || 0) + 1;
    }
    expect(counts.weapon).toBeGreaterThan(2600);
    expect(counts.weapon).toBeLessThan(3000);
    expect(counts.med).toBeGreaterThan(400);
    expect(Object.values(counts).reduce((a, b) => a + b)).toBe(10000);
  });
  it("contracts continuously, with honest final phase timing", () => {
    let last = 325;
    for (let t = 0; t <= 245; t += 0.25) {
      const z = zoneAt(t);
      expect(z.radius).toBeLessThanOrEqual(last + 0.001);
      expect(z.radius).toBeGreaterThanOrEqual(0);
      last = z.radius;
    }
    expect(zoneAt(210).closing).toBe(true);
    expect(zoneAt(232).radius).toBe(0);
    expect(zoneAt(232).remaining).toBe(0);
  });
  it("rejects malformed and nonfinite input packets", () => {
    expect(validInput(neutralInput(1))).toBe(true);
    for (const bad of [
      null,
      {},
      { ...neutralInput(), yaw: Infinity },
      { ...neutralInput(), forward: 2 },
      { ...neutralInput(), seq: -1 },
      { ...neutralInput(), fire: "yes" },
    ])
      expect(validInput(bad)).toBe(false);
  });
});
describe("server authority", () => {
  it("does not release a semi-auto trigger during a network input gap", () => {
    const m = match(),
      p = m.players.get("a")!;
    p.weapons[0] = m.slot("vesper");
    m.input("a", { ...neutralInput(1), fire: true, at: m.time });
    m.step();
    advance(m, 0.4);
    m.input("a", { ...neutralInput(2), fire: true, at: m.time });
    m.step();
    expect(p.weapons[0].ammo).toBe(16);
    m.input("a", neutralInput(3));
    m.step();
    m.input("a", { ...neutralInput(4), fire: true, at: m.time });
    m.step();
    expect(p.weapons[0].ammo).toBe(15);
  });
  it("acknowledges ground movement immediately after warmup", () => {
    const m = match();
    m.transition("active");
    for (let seq = 1; seq <= 120; seq++) {
      m.input("a", neutralInput(seq));
      m.step();
      expect(m.players.get("a")!.lastSeq).toBe(seq);
    }
    expect(m.players.get("a")!.air).toBe("ground");
  });
  it("does not grant purchases through object prototype keys", () => {
    const m = match(),
      p = m.players.get("a")!;
    p.x = 12;
    p.z = 13;
    const credits = p.credits;
    m.action("a", { type: "action", action: "buy", value: "constructor" });
    expect(p.credits).toBe(credits);
    m.action("a", { type: "action", action: "buy", value: "delivery" });
    expect(p.credits).toBe(credits);
  });
  it("respawns with selected loadout, clean inputs and cumulative stats", () => {
    const m = match(),
      p = m.players.get("a")!,
      enemy = m.players.get("b")!;
    m.setLoadout(p.id, "longbow", "extended");
    m.transition("active");
    m.time += TDM.protection + 0.1;
    p.kills = 3;
    p.lastSeq = 75;
    p.weapons[0].ammo = 0;
    m.input(p.id, { ...neutralInput(76), forward: 1, fire: true });
    m.damage(p, 1000, enemy);
    m.damage(p, 1000, enemy);
    expect(p.deaths).toBe(1);
    expect(enemy.kills).toBe(1);
    expect(m.scores.red).toBe(1);
    expect(m.loot).toHaveLength(0);
    advance(m, 2.95);
    expect(p.alive).toBe(false);
    advance(m, 0.15);
    expect(p.alive).toBe(true);
    expect(p.kills).toBe(3);
    expect(p.deaths).toBe(1);
    expect(p.lastSeq).toBe(75);
    expect(m.inputs.get(p.id)).toEqual([]);
    expect(p.weapons[0]).toEqual(m.slot("longbow", "extended"));
    expect(p.hp).toBe(100);
    expect(p.armor).toBe(50);
    expect(p.protectedUntil).toBeGreaterThan(m.time);
  });
  it("accepts active joins, balances teams and removes disconnected players", () => {
    const m = match(12);
    m.fillBots();
    m.transition("active");
    const joined = m.addPlayer("new", "NEW");
    expect(joined.alive).toBe(true);
    expect(joined.air).toBe("ground");
    expect(m.players.size).toBe(12);
    expect(
      [...m.players.values()].filter((p) => p.team === "blue"),
    ).toHaveLength(6);
    m.remove("new");
    expect(m.humans).toBe(2);
    expect(m.players.has("new")).toBe(false);
    expect(m.players.size).toBe(12);
    expect(m.inputs.has("new")).toBe(false);
  });
  it("preserves fractional automatic fire cadence at 60 Hz", () => {
    const m = match(),
      p = m.players.get("a")!;
    p.weapons[0] = m.slot("pike");
    p.weapons[0].ammo = 300;
    for (let n = 0; n < 10 / TICK; n++) {
      m.fire(p, { ...neutralInput(n), fire: true, at: m.time });
      m.time += TICK;
    }
    expect(300 - p.weapons[0].ammo).toBeGreaterThanOrEqual(149);
    expect(300 - p.weapons[0].ammo).toBeLessThanOrEqual(151);
  });
  it("ends a tied match as a draw without killing either team", () => {
    const m = match();
    m.transition("active");
    m.time = m.phaseEnd;
    m.step();
    expect(m.phase).toBe("finished");
    expect(m.winnerTeam).toBeNull();
    expect(m.alive).toBe(2);
  });
  it("consumes ammunition, enforces fire interval and reload duration", () => {
    const m = match(),
      p = m.players.get("a")!;
    const input = { ...neutralInput(1), fire: true, at: m.time };
    m.fire(p, input);
    expect(p.weapons[0].ammo).toBe(29);
    m.fire(p, input);
    expect(p.weapons[0].ammo).toBe(29);
    m.action("a", { type: "action", action: "reload" });
    const reserve = p.weapons[0].reserve;
    advance(m, 1.0);
    expect(p.weapons[0].ammo).toBe(29);
    advance(m, 1.5);
    expect(p.weapons[0].ammo).toBe(30);
    expect(p.weapons[0].reserve).toBe(reserve - 1);
  });
  it("enforces semi-auto trigger release", () => {
    const m = match(),
      p = m.players.get("a")!;
    p.weapons[0] = m.slot("vesper");
    const i = { ...neutralInput(), fire: true, at: m.time };
    m.fire(p, i);
    m.time += 1;
    m.fire(p, i);
    expect(p.weapons[0].ammo).toBe(16);
    p.fireHeld = false;
    m.fire(p, i);
    expect(p.weapons[0].ammo).toBe(15);
  });
  it("blocks friendly fire, invalid damage and protected spawn kills", () => {
    const m = match(),
      p = m.players.get("a")!,
      enemy = m.players.get("b")!;
    m.transition("active");
    m.damage(p, 1000, enemy);
    expect(p.hp).toBe(100);
    m.time += TDM.protection + 0.1;
    enemy.team = p.team;
    m.damage(p, 1000, enemy);
    expect(p.hp).toBe(100);
    for (const amount of [NaN, Infinity, -20]) m.damage(p, amount, null);
    expect(p.hp).toBe(100);
    expect(enemy.damage).toBe(0);
    enemy.team = "red";
    m.damage(p, 25, enemy);
    expect(p.armor).toBe(25);
  });
  it("ends spawn protection when shooting and never scores self kills", () => {
    const m = match(),
      p = m.players.get("a")!;
    m.transition("active");
    m.fire(p, { ...neutralInput(1), fire: true, at: m.time });
    expect(p.protectedUntil).toBe(0);
    m.damage(p, 1000, p);
    expect(p.alive).toBe(false);
    expect(p.deaths).toBe(1);
    expect(p.kills).toBe(0);
    expect(m.scores).toEqual({ blue: 0, red: 0 });
  });
  it("requires inventory and time to insert a plate", () => {
    const m = match(),
      p = m.players.get("a")!;
    p.armor = 0;
    p.plates = 1;
    m.action("a", { type: "action", action: "plate" });
    advance(m, 1.0);
    expect(p.armor).toBe(0);
    advance(m, 0.7);
    expect(p.armor).toBe(50);
    expect(p.plates).toBe(0);
  });
  it("equips attachments for free and ignores obsolete economy actions", () => {
    const m = match(),
      p = m.players.get("a")!;
    m.setLoadout("a", "longbow", "extended");
    expect(p.weapons[0]).toEqual(m.slot("longbow", "extended"));
    for (const action of ["buy", "interact", "drop"] as const)
      m.action("a", { type: "action", action, value: "delivery" });
    expect(p.weapons[0].id).toBe("longbow");
    expect(p.credits).toBe(0);
    expect(m.loot).toHaveLength(0);
  });
  it("limits queued movement and rejects stale sequence numbers", () => {
    const m = match(),
      p = m.players.get("a")!;
    for (let i = 1; i <= 100; i++)
      m.input("a", { ...neutralInput(i), forward: 1 });
    expect(m.inputs.get("a")!.length).toBe(5);
    const start = { x: p.x, z: p.z };
    m.step();
    expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeLessThan(0.45);
    expect(m.input("a", neutralInput(1))).toBe(false);
  });
  it("uses authoritative ray hits and occlusion", () => {
    const m = match(),
      a = m.players.get("a")!,
      b = m.players.get("b")!;
    m.transition("active");
    a.x = 0;
    a.y = 0;
    a.z = 12;
    a.yaw = 0;
    b.x = 0;
    b.y = 0;
    b.z = 5;
    b.armor = 0;
    m.time += TDM.protection + 0.1;
    const hp = b.hp;
    m.fire(a, {
      ...neutralInput(1),
      yaw: 0,
      pitch: -0.07,
      ads: true,
      fire: true,
      at: m.time,
    });
    expect(b.hp).toBeLessThan(hp);
    const building = buildings[0];
    a.x = building.x - 12;
    a.z = building.z;
    a.y = building.y;
    b.x = building.x + 12;
    b.z = building.z;
    b.y = building.y;
    const before = b.hp;
    m.time += 1;
    m.fire(a, {
      ...neutralInput(2),
      yaw: -Math.PI / 2,
      pitch: 0,
      ads: true,
      fire: true,
      at: m.time,
    });
    expect(b.hp).toBe(before);
  });
  it("starts directly on the ground and ends at the team score limit", () => {
    const m = match(),
      a = m.players.get("a")!,
      b = m.players.get("b")!;
    m.phaseEnd = m.time + 0.1;
    advance(m, 0.2);
    expect(m.phase).toBe("active");
    expect(a.air).toBe("ground");
    expect(a.weapons[0].id).toBe("kestrel");
    m.time += TDM.protection + 0.1;
    m.scores.blue = TDM.scoreLimit - 1;
    m.damage(b, 1000, a);
    expect(m.phase).toBe("finished");
    expect(m.winnerTeam).toBe("blue");
    expect(m.scores.blue).toBe(TDM.scoreLimit);
    m.time += 10;
    m.step();
    expect(b.alive).toBe(false);
  });
});
describe("TDM arena regression checks", () => {
  it("spawns all twelve operators in distinct collision-free positions", () => {
    const m = match(12);
    m.fillBots();
    m.transition("active");
    const points = new Set<string>();
    for (const p of m.players.values()) {
      points.add(`${p.x},${p.z}`);
      expect(
        nearbyColliders(p.x, p.z).some(
          (c) =>
            Math.abs(p.x - c.x) < c.w / 2 + 0.33 &&
            Math.abs(p.z - c.z) < c.d / 2 + 0.33 &&
            p.y < c.y + c.h / 2 &&
            p.y + 1.8 > c.y - c.h / 2,
        ),
      ).toBe(false);
    }
    expect(points.size).toBe(12);
  });
  it("clears grenades when their owner disconnects", () => {
    const m = match();
    m.transition("active");
    m.action("a", { type: "action", action: "throw", value: "frag" });
    expect(m.projectiles).toHaveLength(1);
    m.remove("a");
    expect(m.projectiles).toHaveLength(0);
  });
  it("preserves teammates against frag and flash explosions", () => {
    const m = match(),
      a = m.players.get("a")!,
      b = m.players.get("b")!;
    m.transition("active");
    m.time += 3;
    Object.assign(a, { x: -50, z: 2, y: 0 });
    Object.assign(b, { x: -49, z: 2, y: 0, team: a.team });
    const grenade = {
      id: "g",
      owner: a.id,
      kind: "frag" as const,
      x: -49,
      y: 1,
      z: 2,
      vx: 0,
      vy: 0,
      vz: 0,
      end: m.time,
    };
    m.explode(grenade);
    m.explode({ ...grenade, kind: "flash" });
    expect(b.hp).toBe(100);
    expect(b.armor).toBe(50);
    expect(b.flashUntil).toBe(0);
  });
  it("requires jump release and lands without repeated bouncing", () => {
    const m = match(),
      p = m.players.get("a")!;
    Object.assign(p, { x: -50, z: 2, y: 0 });
    let airborne = 0;
    for (let i = 1; i <= 40; i++) {
      movePlayer(p, { ...neutralInput(i), jump: true });
      if (!p.grounded) airborne++;
    }
    expect(airborne).toBeGreaterThan(5);
    expect(p.grounded).toBe(true);
    expect(p.y).toBe(0);
    movePlayer(p, neutralInput(41));
    movePlayer(p, { ...neutralInput(42), jump: true });
    expect(p.grounded).toBe(false);
  });
});

describe("movement and projectile collision", () => {
  it("lands parachutes on roofs rather than passing through them", () => {
    const m = match(),
      p = m.players.get("a")!,
      b = buildings[0];
    Object.assign(p, { x: b.x, z: b.z, y: b.y + 10, air: "chute", vy: -5 });
    for (let i = 0; i < 150; i++) movePlayer(p, neutralInput(i));
    expect(p.air).toBe("ground");
    expect(p.y).toBeCloseTo(b.y + b.h + 0.225, 2);
  });
  it("jumps, accelerates, stops and respects walls", () => {
    const m = match(),
      p = m.players.get("a")!;
    p.x = 0;
    p.z = 12;
    p.y = 0;
    movePlayer(p, { ...neutralInput(1), jump: true });
    expect(p.y).toBeGreaterThan(0);
    for (let i = 0; i < 50; i++) movePlayer(p, neutralInput(i + 2));
    expect(p.grounded).toBe(true);
    const x = p.x;
    for (let i = 0; i < 60; i++)
      movePlayer(p, { ...neutralInput(i + 60), strafe: 1 });
    expect(p.x).toBeGreaterThan(x + 2);
    for (let i = 0; i < 20; i++) movePlayer(p, neutralInput(i + 100));
    expect(Math.abs(p.vx)).toBeLessThan(0.01);
  });
  it("simulates grenade gravity, bounce and stable ground contact with Rapier", () => {
    const physics = new GrenadePhysics(),
      x = 120,
      z = 60,
      y = groundHeight(x, z);
    physics.add({
      id: "test",
      owner: "a",
      kind: "frag",
      x,
      y: y + 4,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      end: 99,
    });
    for (let i = 0; i < 100; i++) physics.step();
    const final = physics.position("test")!;
    expect(final.y).toBeGreaterThan(y - 0.4);
    expect(final.y).toBeLessThan(y + 0.5);
    physics.dispose();
  });
});

import { beforeAll, afterEach, expect, it } from "vitest";
import * as T from "three";
import { Match } from "../apps/game-server/simulation";
import { initPhysics } from "../apps/game-server/physics";
import {
  PERKS,
  reloadTime,
  scopeFov,
  scopeLevels,
  scopeSway,
} from "../packages/game-shared/combat";
import { WEAPONS, TICK, ARENAS } from "../packages/game-shared/data";
import { neutralInput, validInput } from "../packages/game-shared/protocol";
import { movePlayer } from "../packages/game-shared/movement";
import { groundHeight } from "../packages/game-shared/map";
import { colliders } from "../packages/game-shared/map";
import { nextRenderDeadline, reloadDuration } from "../game/weapon-motion";
import { WeaponView } from "../game/weapon-view";
import {
  disconnectSession,
  issueSession,
  resumeSession,
  expireSessions,
  sessions,
} from "../apps/game-server/sessions";

const matches: Match[] = [];
beforeAll(initPhysics);
afterEach(() => {
  sessions.clear();
  for (const m of matches) m.dispose();
  matches.length = 0;
});
function match(count = 3) {
  const m = new Match("FPS", count);
  matches.push(m);
  const a = m.addPlayer("a", "ALPHA"),
    b = m.addPlayer("b", "BRAVO");
  const c = count > 2 ? m.addPlayer("c", "CHARLIE") : a;
  return { m, a, b, c };
}
function advance(m: Match, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / TICK); i++) m.step();
}

it("uses true optical magnification and distinct scoped precision choices", () => {
  for (const zoom of [2, 4, 8])
    expect(
      Math.tan((85 * Math.PI) / 360) /
        Math.tan((scopeFov(85, zoom) * Math.PI) / 360),
    ).toBeCloseTo(zoom, 8);
  expect(scopeLevels(WEAPONS.longbow, "balanced")).toEqual([4, 8]);
  expect(scopeLevels(WEAPONS.wa2000, "balanced")).toEqual([4, 8]);
  expect(scopeLevels(WEAPONS.wraith, "optic")).toEqual([2, 4]);
  expect(scopeLevels(WEAPONS.vesper, "optic")).toEqual([]);
  expect(Math.abs(scopeSway(10, true, false).yaw)).toBeLessThan(
    Math.abs(scopeSway(10, false, false).yaw),
  );
});

it("limits holding breath and restores focus after release", () => {
  const { m, a } = match();
  m.setLoadout(a.id, "wa2000", "balanced");
  for (let i = 1; i <= 185; i++)
    movePlayer(a, { ...neutralInput(i), ads: true, steady: true });
  expect(a.focus).toBeLessThan(0.03);
  expect(a.focusCooldown).toBeGreaterThan(0);
  expect(a.steadied).toBe(false);
  for (let i = 186; i < 500; i++)
    movePlayer(a, { ...neutralInput(i), ads: true });
  expect(a.focus).toBe(1);
  expect(a.focusCooldown).toBe(0);
  expect(validInput({ ...neutralInput(1), steady: "yes" })).toBe(false);
});

it("applies perk trade-offs on respawn and enforces the armor cap", () => {
  const { m, a, b } = match();
  m.transition("active");
  m.time += 3;
  m.action(a.id, {
    type: "action",
    action: "loadout",
    value: "wraith:balanced:lightweight",
  });
  expect(a.perk).toBe("balanced");
  m.damage(a, 1000, b);
  advance(m, 3.05);
  expect(a.perk).toBe("lightweight");
  expect(a.armor).toBe(35);
  a.armor = 5;
  m.action(a.id, { type: "action", action: "plate" });
  advance(m, 1.7);
  expect(a.armor).toBe(35);
  m.action(a.id, {
    type: "action",
    action: "loadout",
    value: "wraith:balanced:constructor",
  });
  m.respawn(a);
  expect(a.perk).toBe("lightweight");
});

it("shares quick-hands reload timing with the viewmodel and reduces reserve ammunition", () => {
  const { m, a } = match();
  m.setLoadout(a.id, "kestrel", "extended", true, "quickhands");
  const w = WEAPONS.kestrel;
  a.weapons[0].ammo = 0;
  m.action(a.id, { type: "action", action: "reload" });
  const duration = reloadTime(w, true, true, "quickhands");
  expect(a.reloadAt - m.time).toBeCloseTo(duration, 5);
  expect(reloadDuration(w, true, true, "quickhands")).toBe(duration);
  expect(a.weapons[0].reserve).toBe(Math.floor(w.reserve * 0.75));
});

it("reduces blast and flash exposure for the tactical perk", () => {
  const { m, a, b, c } = match(4),
    d = m.addPlayer("d", "DELTA");
  m.transition("active");
  m.time += 3;
  Object.assign(a, { x: -60, y: 0, z: 42 });
  Object.assign(c, { x: -60, y: 0, z: 46 });
  Object.assign(b, { x: -50, y: 0, z: 42 });
  Object.assign(d, { x: -50, y: 0, z: 42, perk: "tactical" });
  const grenade = {
    id: "g",
    owner: a.id,
    kind: "frag" as const,
    x: -55,
    y: 1,
    z: 42,
    vx: 0,
    vy: 0,
    vz: 0,
    end: m.time,
  };
  m.explode(grenade);
  expect(150 - d.hp - d.armor).toBeCloseTo(
    (150 - b.hp - b.armor) * PERKS.tactical.explosive,
    5,
  );
  m.explode({ ...grenade, kind: "flash" });
  expect(d.flashUntil - m.time).toBeCloseTo((b.flashUntil - m.time) * 0.6, 5);
});

it("awards assists, tracks streaks and requires unanimous rematch votes", () => {
  const { m, a, b, c } = match();
  m.transition("active");
  m.time += 3;
  m.damage(b, 35, a);
  m.damage(b, 200, c);
  expect(a.assists).toBe(1);
  expect(c.kills).toBe(1);
  expect(c.streak).toBe(1);
  m.transition("finished");
  m.action(a.id, { type: "action", action: "rematch" });
  m.action(a.id, { type: "action", action: "rematch" });
  expect(m.phase).toBe("finished");
  m.action(b.id, { type: "action", action: "rematch" });
  expect(m.phase).toBe("finished");
  m.action(c.id, { type: "action", action: "rematch" });
  expect(m.phase).toBe("warmup");
  expect(m.round).toBe(2);
  expect(m.scores).toEqual({ blue: 0, red: 0 });
  expect(a.assists).toBe(0);
  advance(m, 5.1);
  expect(m.phase).toBe("active");
});

it("keeps the stronger flash duration when another flash detonates", () => {
  const { m, a, b } = match(2);
  m.transition("active");
  m.time += 3;
  Object.assign(a, { x: -60, y: 0, z: 42 });
  Object.assign(b, { x: -50, y: 0, z: 42 });
  const grenade = {
    id: "flash",
    owner: a.id,
    kind: "flash" as const,
    x: -50,
    y: 1,
    z: 42,
    vx: 0,
    vy: 0,
    vz: 0,
    end: m.time,
  };
  m.explode(grenade);
  const first = b.flashUntil;
  m.time += 0.1;
  m.explode({ ...grenade, x: -60 });
  expect(b.flashUntil).toBe(first);
  m.time += 1;
  m.explode(grenade);
  expect(b.flashUntil).toBeGreaterThan(first);
});

it("reports a grenade kill separately from the attacker's held firearm", () => {
  const { m, a, b } = match(2);
  m.transition("active");
  m.time += 3;
  Object.assign(a, { x: -60, y: 0, z: 42 });
  Object.assign(b, { x: -50, y: 0, z: 42 });
  m.explode({
    id: "frag",
    owner: a.id,
    kind: "frag",
    x: -50,
    y: 1,
    z: 42,
    vx: 0,
    vy: 0,
    vz: 0,
    end: m.time,
  });
  expect(b.alive).toBe(false);
  expect(b.lastKiller).toBe(a.name);
  expect(b.lastKillerWeapon).toBe("FRAG GRENADE");
  expect(a.kills).toBe(1);
  expect(m.scores[a.team]).toBe(1);
});

it("refills balanced teams when a results departure completes rematch votes", () => {
  const { m, a, b } = match(2);
  m.transition("finished");
  m.action(a.id, { type: "action", action: "rematch" });
  m.remove(b.id);
  expect(m.phase).toBe("warmup");
  expect(m.round).toBe(2);
  expect(m.players.size).toBe(2);
  const players = [...m.players.values()];
  expect(players.filter((p) => p.team === "blue")).toHaveLength(1);
  expect(players.filter((p) => p.team === "red")).toHaveLength(1);
});

it("shares bounded, expiring pings only with teammates", () => {
  const { m, a, b, c } = match();
  m.action(a.id, { type: "action", action: "ping", x: 999, z: 999 });
  expect(m.snapshot(c.id).teamPings).toHaveLength(1);
  expect(m.snapshot(b.id).teamPings).toHaveLength(0);
  expect(m.snapshot(c.id).teamPings[0].x).toBe(ARENAS.harbor.maxX - 1);
  m.time += 8.1;
  expect(m.snapshot(c.id).teamPings).toHaveLength(0);
});

it.each([90, 120, 144, 165, 240])(
  "keeps a 60FPS render cadence on a %sHz display",
  (refresh) => {
    let deadline = 0,
      frames = 0;
    for (let i = 0; i < refresh * 5; i++) {
      const now = i / refresh;
      if (now + 1e-6 < deadline) continue;
      frames++;
      deadline = nextRenderDeadline(deadline, now, 60);
    }
    expect(frames).toBeGreaterThanOrEqual(299);
    expect(frames).toBeLessThanOrEqual(301);
  },
);

it("continues settling viewmodel recoil while hidden by a scope", () => {
  const { a } = match(),
    view = Object.create(WeaponView.prototype) as WeaponView;
  const springs = [
    { position: 0, velocity: 0 },
    { position: 0, velocity: 0 },
    { position: 0, velocity: 0 },
  ];
  Object.assign(view, {
    springs,
    root: new T.Group(),
    look: new T.Vector2(),
    aim: 0,
    shotAt: 0,
    flash: new T.Sprite(new T.SpriteMaterial()),
    flashLight: { intensity: 0 },
  });
  for (let i = 0; i < 120; i++) {
    if (i < 60 && i % 6 === 0) view.kick("kestrel", i / 60);
    view.advanceHidden(a, 1 / 60, i / 60);
  }
  for (const spring of springs) {
    expect(Math.abs(spring.position)).toBeLessThan(0.001);
    expect(Math.abs(spring.velocity)).toBeLessThan(0.01);
  }
});

it("preserves private reconnect ownership and equipment without a refill", () => {
  const { m, a } = match(2),
    rooms = new Map([[m.room, m]]),
    oldSocket = {},
    newSocket = {};
  const token = issueSession(m, a.id, oldSocket);
  a.hp = 61;
  a.weapons[0].ammo = 3;
  expect(() => resumeSession(token, newSocket, rooms)).toThrow(
    /already connected/,
  );
  disconnectSession(token, oldSocket, 1006, 1000);
  expect(a.connected).toBe(false);
  const resumed = resumeSession(token, newSocket, rooms, 6000);
  expect(resumed.id).toBe(a.id);
  expect(a.hp).toBe(61);
  expect(a.weapons[0].ammo).toBe(3);
  disconnectSession(token, oldSocket, 1000, 6001);
  expect(m.players.has(a.id)).toBe(true);
  disconnectSession(token, newSocket, 1006, 7000);
  expireSessions(rooms, 17000);
  expect(m.players.has(a.id)).toBe(false);
});

it("lets stalled clients fall without duplicating commands during normal jitter", () => {
  const { m, a } = match(2);
  Object.assign(a, {
    x: -60,
    z: 42,
    y: 5,
    vy: -5,
    vx: 0,
    vz: 0,
    grounded: false,
  });
  m.input(a.id, neutralInput(1));
  m.step();
  const afterCommand = { x: a.x, y: a.y, z: a.z, ammo: a.weapons[0].ammo };
  advance(m, 0.15);
  expect(a.y).toBe(afterCommand.y);
  advance(m, 1);
  expect(a.y).toBe(0);
  expect(a.grounded).toBe(true);
  expect(a.x).toBe(afterCommand.x);
  expect(a.z).toBe(afterCommand.z);
  expect(a.lastSeq).toBe(1);
  expect(a.weapons[0].ammo).toBe(afterCommand.ammo);
  m.input(a.id, neutralInput(2));
  m.step();
  expect(a.lastSeq).toBe(2);
});

it("flattens physics-heightfield samples around every playable boundary", () => {
  for (const a of Object.values(ARENAS))
    for (const x of [a.minX + 1, a.maxX - 1])
      for (const z of [a.minZ + 1, (a.minZ + a.maxZ) / 2, a.maxZ - 1]) {
        const x0 = Math.floor((x + 340) / 8) * 8 - 340,
          z0 = Math.floor((z + 340) / 8) * 8 - 340;
        for (const dx of [0, 8])
          for (const dz of [0, 8])
            expect(groundHeight(x0 + dx, z0 + dz)).toBe(0);
      }
});

it("cycles three permanent slots and lets a knife hit only within melee range", () => {
  const { m, a, b } = match(2);
  m.transition("active");
  m.time += 3;
  expect(a.weapons.map((w) => w.id)).toEqual(["kestrel", "vesper", "knife"]);
  m.action(a.id, { type: "action", action: "swap", value: "2" });
  m.time += 0.21;
  Object.assign(a, { x: -60, y: 0, z: 42, yaw: -Math.PI / 2 });
  Object.assign(b, { x: -58.3, y: 0, z: 42 });
  const input = { ...neutralInput(1), fire: true, yaw: a.yaw, at: m.time };
  m.fire(a, input);
  expect(b.hp + b.armor).toBeCloseTo(95);
  expect(a.weapons[2].ammo).toBe(1);
  m.fire(a, input);
  expect(b.hp + b.armor).toBeCloseTo(95);
  m.time += 0.7;
  b.x = -55;
  m.fire(a, input);
  expect(b.hp + b.armor).toBeCloseTo(95);
  m.time += 0.7;
  b.x = -58.3;
  b.team = a.team;
  m.fire(a, input);
  expect(b.hp + b.armor).toBeCloseTo(95);
  m.action(a.id, { type: "action", action: "swap" });
  expect(a.selected).toBe(0);
});

it("prevents knife strikes through walls", () => {
  const { m, a, b } = match(2);
  m.transition("active");
  m.time += 3;
  const wall = colliders.find(
    (c) =>
      c.kind === "wall" &&
      c.w > 5 &&
      c.d < 1 &&
      c.h > 2 &&
      c.y - c.h / 2 < 0.1 &&
      c.x > -64 &&
      c.x < 72 &&
      c.z > -108 &&
      c.z < 58,
  )!;
  expect(wall).toBeDefined();
  Object.assign(a, {
    x: wall.x,
    y: 0,
    z: wall.z - 0.8,
    yaw: Math.PI,
    selected: 2,
  });
  Object.assign(b, { x: wall.x, y: 0, z: wall.z + 0.8 });
  m.fire(a, { ...neutralInput(1), fire: true, yaw: Math.PI, at: m.time });
  expect(b.hp + b.armor).toBe(150);
});

it("consumes a syringe on completion and cancels injection on damage or weapon change", () => {
  const { m, a, b } = match(2);
  m.transition("active");
  m.time += 3;
  a.hp = 35;
  a.armor = 0;
  m.action(a.id, { type: "action", action: "heal" });
  expect(a.healAt).toBeGreaterThan(m.time);
  advance(m, 2.7);
  expect(a.hp).toBe(35);
  expect(a.meds).toBe(1);
  advance(m, 0.12);
  expect(a.hp).toBe(100);
  expect(a.meds).toBe(0);
  a.hp = 35;
  a.meds = 1;
  m.action(a.id, { type: "action", action: "heal" });
  m.damage(a, 5, b);
  expect(a.healAt).toBe(0);
  expect(a.meds).toBe(1);
  m.action(a.id, { type: "action", action: "heal" });
  m.action(a.id, { type: "action", action: "swap", value: "2" });
  expect(a.healAt).toBe(0);
  expect(a.meds).toBe(1);
});

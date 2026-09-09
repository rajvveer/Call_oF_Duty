import { beforeAll, afterEach, expect, it } from "vitest";
import { Match } from "../apps/game-server/simulation";
import { initPhysics } from "../apps/game-server/physics";
import {
  route,
  steering,
  canSee,
  walkClear,
} from "../apps/game-server/navigation";
import { buildings } from "../packages/game-shared/map";
import { movePlayer } from "../packages/game-shared/movement";
import { neutralInput } from "../packages/game-shared/protocol";
import {
  TICK,
  WEAPONS,
  weaponInaccuracy,
  weaponKick,
  dist,
} from "../packages/game-shared/data";

const matches: Match[] = [];
beforeAll(initPhysics);
afterEach(() => {
  for (const m of matches) m.dispose();
  matches.length = 0;
});
function setup() {
  const m = new Match("TACTICAL", 2);
  matches.push(m);
  const a = m.addPlayer("a", "ALPHA"),
    b = m.addPlayer("b", "BRAVO");
  return { m, a, b };
}

it("descends a full staircase grounded and stops precisely against solid cover", () => {
  const { a } = setup(),
    building = buildings[0];
  Object.assign(a, {
    x: building.x + building.w / 2 + 1.3,
    y: 4.5,
    z: building.z - building.d / 2 + 17 * 0.48,
  });
  for (let i = 1; i <= 132; i++) {
    movePlayer(a, { ...neutralInput(i), forward: 1 });
    expect(a.grounded).toBe(true);
  }
  expect(a.y).toBe(0);
  Object.assign(a, { x: -35, y: 0, z: -77, vx: 0, vz: 0 });
  for (let i = 1; i <= 120; i++)
    movePlayer(a, { ...neutralInput(i), strafe: 1 });
  expect(a.x).toBeCloseTo(-33.322, 4);
});

it("buffers a landing jump and allows a short coyote window without infinite jumps", () => {
  const { a } = setup();
  Object.assign(a, {
    x: -48,
    z: -98,
    y: 0.06,
    grounded: false,
    vy: -3,
    coyote: 0,
  });
  movePlayer(a, { ...neutralInput(1), jump: true });
  for (let i = 2; i <= 5; i++)
    movePlayer(a, { ...neutralInput(i), jump: true });
  expect(a.vy).toBeGreaterThan(0);
  for (let i = 6; i < 120; i++)
    movePlayer(a, { ...neutralInput(i), jump: true });
  expect(a.grounded).toBe(true);
  Object.assign(a, { y: 2, grounded: false, coyote: 0.08, jumpHeld: false });
  movePlayer(a, { ...neutralInput(121), jump: true });
  expect(a.vy).toBeGreaterThan(6);
  expect(a.coyote).toBe(0);
});

it("keeps fixed-step replay deterministic across movement, sliding and collision", () => {
  const { a } = setup();
  Object.assign(a, { x: -48, z: -98, vx: 8.7 });
  const b = structuredClone(a);
  for (let i = 1; i <= 80; i++) {
    const input = {
      ...neutralInput(i),
      strafe: 1,
      sprint: true,
      crouch: i < 20,
      jump: i === 30,
    };
    movePlayer(a, input, 3 * TICK);
    for (let sub = 0; sub < 3; sub++) movePlayer(b, input, TICK);
  }
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.z).toBeCloseTo(b.z, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
});

it("actually navigates a body around buildings and containers to the opposing spawn", () => {
  const { a } = setup();
  Object.assign(a, { x: -54, z: -94, y: 0 });
  const goal = { x: 66, y: 0, z: 42 },
    path = route(a, goal);
  expect(path.length).toBeGreaterThan(1);
  let seq = 0;
  while (path.length && seq < 60 / TICK) {
    while (path.length && dist(a, path[0]) < 0.7) path.shift();
    if (!path.length) break;
    const point = path[0],
      yaw = Math.atan2(-(point.x - a.x), -(point.z - a.z));
    movePlayer(a, {
      ...neutralInput(++seq),
      ...steering(a, point, yaw, []),
      yaw,
      sprint: true,
    });
  }
  expect(dist(a, goal)).toBeLessThan(1.2);
  expect(walkClear({ x: -35, y: 0, z: -77 }, { x: -25, y: 0, z: -77 })).toBe(
    false,
  );
});

it("bot perception respects vertical aim, smoke, walls and teammates", () => {
  const { m, a, b } = setup();
  m.time += 3;
  Object.assign(a, { x: -50, y: 0, z: -98 });
  Object.assign(b, { x: -40, y: 4, z: -98 });
  expect(canSee(a, b, [], m.time)).toBe(true);
  expect(
    canSee(a, b, [{ x: -45, y: 0, z: -98, end: m.time + 10 }], m.time),
  ).toBe(false);
  b.team = a.team;
  expect(canSee(a, b, [], m.time)).toBe(false);
});

it("rewards stationary burst fire over running and jumping with reproducible recoil", () => {
  const w = WEAPONS.kestrel,
    still = weaponInaccuracy(w, 0, true, false, false, 0);
  expect(weaponInaccuracy(w, 5.5, true, false, false, 0)).toBeGreaterThan(
    still * 5,
  );
  expect(weaponInaccuracy(w, 0, false, false, false, 0)).toBeGreaterThan(
    still * 10,
  );
  expect(weaponInaccuracy(w, 0, true, true, false, 0)).toBeLessThan(still);
  expect(weaponInaccuracy(w, 0, true, false, false, 15)).toBeGreaterThan(still);
  expect(weaponKick(w, 4)).toEqual(weaponKick(w, 4));
  expect(weaponKick(w, 10).yaw).toBeLessThan(0);
});

it("applies loadout changes on respawn without refilling the active gun", () => {
  const { m, a, b } = setup();
  m.transition("active");
  m.time += 3;
  a.weapons[0].ammo = 1;
  m.action(a.id, {
    type: "action",
    action: "loadout",
    value: "deagle:control",
  });
  expect(a.weapons[0].id).toBe("kestrel");
  expect(a.weapons[0].ammo).toBe(1);
  m.action(a.id, {
    type: "action",
    action: "loadout",
    value: "constructor:balanced",
  });
  m.damage(a, 1000, b);
  m.time = a.respawnAt;
  m.step();
  expect(a.weapons[0]).toEqual(m.slot("deagle", "control"));
});

it("enforces equip delay without reporting swaps as gunshots", () => {
  const { m, a } = setup(),
    lastShot = a.lastShot;
  m.action(a.id, { type: "action", action: "swap", value: "1" });
  const ammo = a.weapons[1].ammo;
  m.fire(a, { ...neutralInput(1), fire: true, at: m.time });
  expect(a.weapons[1].ammo).toBe(ammo);
  expect(a.lastShot).toBe(lastShot);
  m.time += 0.21;
  m.fire(a, { ...neutralInput(2), fire: true, at: m.time });
  expect(a.weapons[1].ammo).toBe(ammo);
  a.fireHeld = false;
  m.fire(a, { ...neutralInput(3), fire: true, at: m.time });
  expect(a.weapons[1].ammo).toBe(ammo - 1);
});

it("rewinds the victim's stance with position for historical head hits", () => {
  const { m, a, b } = setup();
  m.transition("active");
  m.time += 3;
  Object.assign(a, { x: -50, y: 0, z: -98 });
  Object.assign(b, { x: -45, y: 0, z: -98, crouched: true });
  m.history.push({
    time: m.time - 0.1,
    positions: new Map([[b.id, { x: b.x, y: b.y, z: b.z, crouched: false }]]),
  });
  m.fire(a, {
    ...neutralInput(1),
    yaw: -Math.PI / 2,
    pitch: 0,
    ads: true,
    fire: true,
    at: m.time - 0.1,
  });
  expect(b.hp).toBeLessThan(100);
});

it("gives Regular opponents a longer reaction window and less sustained fire", () => {
  const sample = (difficulty: "regular" | "veteran") => {
    const m = new Match("BOT-DIFFICULTY", 2);
    matches.push(m);
    m.time = m.started = 100;
    m.difficulty = difficulty;
    const target = m.addPlayer("target", "TARGET"),
      bot = m.addPlayer("bot", "BOT", true);
    m.setLoadout(bot.id, "kestrel", "balanced");
    m.phase = "active";
    Object.assign(target, {
      x: -30,
      y: 0,
      z: -98,
      hp: 10000,
      armor: 0,
      protectedUntil: 0,
    });
    Object.assign(bot, {
      x: -50,
      y: 0,
      z: -98,
      yaw: -Math.PI / 2,
      protectedUntil: 0,
    });
    for (let i = 0; i < 240; i++) m.step();
    const shots = m.events.filter(
      (e) => e.type === "shot" && e.from === bot.id,
    );
    return {
      first: shots[0]?.time - 100,
      shots: shots.length,
      damage: bot.damage,
    };
  };
  const regular = sample("regular"),
    veteran = sample("veteran");
  expect(regular.first).toBeGreaterThan(veteran.first + 0.3);
  expect(regular.shots).toBeGreaterThan(0);
  expect(regular.shots).toBeLessThan(veteran.shots * 0.7);
  expect(regular.damage).toBeGreaterThan(0);
  expect(veteran.damage).toBeGreaterThan(0);
});

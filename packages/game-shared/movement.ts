import { perkFor, scopeLevels } from "./combat";
import { clamp, TICK, arenaFor, WEAPONS } from "./data";
import { groundHeight, nearbyColliders, type Collider } from "./map";
import type { Input, Player } from "./protocol";

const RADIUS = 0.32;
const SKIN = 0.002;
const STEP = 0.32;
const GRAVITY = 26;
type Mover = Player;

function footprint(x: number, z: number, c: Collider, radius = RADIUS) {
  const dx = Math.max(0, Math.abs(x - c.x) - c.w / 2);
  const dz = Math.max(0, Math.abs(z - c.z) - c.d / 2);
  return dx * dx + dz * dz < radius * radius;
}

function overlaps(x: number, y: number, z: number, h: number, c: Collider) {
  return (
    y < c.y + c.h / 2 - SKIN &&
    y + h > c.y - c.h / 2 + SKIN &&
    footprint(x, z, c)
  );
}

export function movePlayer(p: Mover, i: Input, dt = TICK) {
  if (!p.alive || !(dt > 0) || !Number.isFinite(dt)) return;
  if (i.jump && !p.jumpHeld) p.jumpBuffer = 0.1;
  const slidePressed = i.crouch && !p.crouchHeld;
  p.jumpHeld = i.jump;
  p.crouchHeld = i.crouch;
  p.yaw = i.yaw;
  p.pitch = i.pitch;
  p.lastSeq = i.seq;
  if (p.air === "plane") return;
  // Same substeps run on the server, prediction, and reconciliation.
  const steps = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-7));
  for (let n = 0; n < steps; n++)
    step(p, i, dt / steps, slidePressed && n === 0);
}

function step(p: Mover, i: Input, dt: number, slidePressed: boolean) {
  const arena = arenaFor(p.map);
  const near = nearbyColliders(p.x, p.z);
  const onGround = p.grounded;
  const selected = p.weapons[p.selected],
    weapon = WEAPONS[selected.id];
  p.focusCooldown = Math.max(0, p.focusCooldown - dt);
  p.steadied =
    !!i.steady &&
    i.ads &&
    onGround &&
    Math.hypot(p.vx, p.vz) < 0.6 &&
    p.focus > 0 &&
    p.focusCooldown === 0 &&
    scopeLevels(weapon, selected.attachment).length > 0;
  if (p.steadied) {
    p.focus = Math.max(0, p.focus - dt / 3);
    if (p.focus === 0) p.focusCooldown = 1.5;
  } else p.focus = Math.min(1, p.focus + dt * 0.22);
  const normalMovement = p.air === "ground";
  const canStand = !near.some((c) => overlaps(p.x, p.y, p.z, 1.8, c));
  p.coyote = onGround ? 0.09 : Math.max(0, (p.coyote ?? 0) - dt);
  p.slide = Math.max(-1, p.slide - dt);
  if (
    normalMovement &&
    slidePressed &&
    i.sprint &&
    onGround &&
    Math.hypot(p.vx, p.vz) > 6 &&
    p.slide <= -0.35
  ) {
    p.slide = 0.62;
    const boost = Math.max(1, 10.4 / Math.hypot(p.vx, p.vz));
    p.vx *= boost;
    p.vz *= boost;
  }
  p.crouched = normalMovement && (i.crouch || p.slide > 0 || !canStand);
  let jumped = false;
  if (
    normalMovement &&
    (p.jumpBuffer ?? 0) > 0 &&
    (p.coyote ?? 0) > 0 &&
    canStand
  ) {
    p.vy = 7;
    p.grounded = false;
    p.coyote = p.jumpBuffer = 0;
    p.slide = Math.min(p.slide, -0.35);
    jumped = true;
  }
  p.jumpBuffer = Math.max(0, (p.jumpBuffer ?? 0) - dt);
  const norm = Math.max(1, Math.hypot(i.forward, i.strafe));
  const dx = (-Math.sin(i.yaw) * i.forward + Math.cos(i.yaw) * i.strafe) / norm;
  const dz = (-Math.cos(i.yaw) * i.forward - Math.sin(i.yaw) * i.strafe) / norm;
  let speed =
    (p.crouched ? 3 : i.ads ? 3.3 : i.sprint ? 8.7 : 5.5) *
    weapon.speed *
    perkFor(p.perk).speed;
  if (p.reloadAt || p.plateAt || p.healAt) speed *= 0.72;
  if (!normalMovement) {
    speed = p.air === "chute" ? 11 : 7;
    p.vx = dx * speed;
    p.vz = dz * speed;
  } else if (p.slide > 0 && onGround && !jumped) {
    const decay = Math.exp(-1.5 * dt);
    p.vx *= decay;
    p.vz *= decay;
  } else {
    const moving = !!(i.forward || i.strafe);
    const accel = onGround && !jumped ? (moving ? 25 : 30) : moving ? 4.2 : 0;
    const blend = 1 - Math.exp(-accel * dt);
    p.vx += (dx * speed - p.vx) * blend;
    p.vz += (dz * speed - p.vz) * blend;
  }
  p.eyeHeight +=
    ((p.crouched ? 1.03 : 1.64) - p.eyeHeight) * (1 - Math.exp(-15 * dt));
  const height = p.crouched ? 1.1 : 1.8;

  // Sweep the circular footprint along each axis. At corners the available
  // cross-section shrinks, so the player slides past rather than box-snags.
  function sweep(axis: "x" | "z", end: number, y: number) {
    const other = axis === "x" ? "z" : "x";
    const size = axis === "x" ? "w" : "d";
    const otherSize = axis === "x" ? "d" : "w";
    const direction = Math.sign(end - p[axis]);
    let position = end;
    let hit: Collider | undefined;
    if (!direction) return { position, hit };
    for (const c of near) {
      if (y >= c.y + c.h / 2 - SKIN || y + height <= c.y - c.h / 2 + SKIN)
        continue;
      const lateral = Math.max(
        0,
        Math.abs(p[other] - c[other]) - c[otherSize] / 2,
      );
      if (lateral >= RADIUS) continue;
      const padding = Math.sqrt(RADIUS * RADIUS - lateral * lateral);
      const boundary = c[axis] - direction * (c[size] / 2 + padding + SKIN);
      if (
        direction * (p[axis] - boundary) <= SKIN * 2 &&
        direction * (position - boundary) > 0
      ) {
        position = boundary;
        hit = c;
      }
    }
    return { position, hit };
  }

  for (const axis of ["x", "z"] as const) {
    const velocity = axis === "x" ? "vx" : "vz";
    const end = p[axis] + p[velocity] * dt;
    let result = sweep(axis, end, p.y);
    if (result.hit && onGround && !jumped && p.vy <= 0) {
      const top = result.hit.y + result.hit.h / 2;
      const rise = top - p.y;
      const nx = axis === "x" ? end : p.x;
      const nz = axis === "z" ? end : p.z;
      if (
        rise > SKIN &&
        rise <= STEP &&
        !near.some(
          (c) =>
            overlaps(p.x, top, p.z, height, c) ||
            overlaps(nx, top, nz, height, c),
        )
      ) {
        const raised = sweep(axis, end, top);
        if (!raised.hit) {
          p.y = top;
          p.vy = 0;
          result = raised;
        }
      }
    }
    p[axis] = result.position;
    if (result.hit) p[velocity] = 0;
  }
  const bound = normalMovement
    ? {
        minX: arena.minX + 1,
        maxX: arena.maxX - 1,
        minZ: arena.minZ + 1,
        maxZ: arena.maxZ - 1,
      }
    : { minX: -325, maxX: 325, minZ: -325, maxZ: 325 };
  const x = clamp(p.x, bound.minX, bound.maxX);
  const z = clamp(p.z, bound.minZ, bound.maxZ);
  if (x !== p.x) p.vx = 0;
  if (z !== p.z) p.vz = 0;
  p.x = x;
  p.z = z;

  const oldY = p.y;
  const gravity = normalMovement ? GRAVITY : p.air === "chute" ? 8 : 24;
  const terminal = normalMovement ? -36 : p.air === "chute" ? -5 : -42;
  const nextVy = Math.max(terminal, p.vy - gravity * dt);
  p.y += (p.vy + nextVy) * 0.5 * dt;
  p.vy = nextVy;
  let floor = groundHeight(p.x, p.z);
  let ceiling = Infinity;
  for (const c of near) {
    if (!footprint(p.x, p.z, c)) continue;
    const top = c.y + c.h / 2;
    const bottom = c.y - c.h / 2;
    if (top <= oldY + SKIN) floor = Math.max(floor, top);
    if (bottom >= oldY + height - SKIN) ceiling = Math.min(ceiling, bottom);
  }
  p.grounded = false;
  const snap =
    normalMovement &&
    onGround &&
    !jumped &&
    p.vy <= 0 &&
    oldY >= floor &&
    oldY - floor <= STEP;
  if (p.vy <= 0 && (p.y <= floor + SKIN || snap)) {
    p.y = floor;
    p.vy = 0;
    p.grounded = true;
    p.coyote = 0.09;
    if (!normalMovement) p.air = "ground";
  } else if (p.vy > 0 && p.y + height > ceiling) {
    p.y = ceiling - height - SKIN;
    p.vy = 0;
  }
}

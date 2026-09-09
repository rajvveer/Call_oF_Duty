import { inExtraArena, addExtraArenas } from "./arena-layouts";
import { POIS, TDM, random, type Vec3 } from "./data";
export type Collider = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: "concrete" | "metal" | "wood";
  kind?: string;
};
export type Building = {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
  style: number;
};
export function groundHeight(x: number, z: number) {
  if (inExtraArena(x, z, 12)) return 0;
  if (
    x >= TDM.minX - 12 &&
    x <= TDM.maxX + 12 &&
    z >= TDM.minZ - 12 &&
    z <= TDM.maxZ + 12
  )
    return 0;
  const edge = Math.max(Math.abs(x), Math.abs(z));
  let h =
    Math.sin(x * 0.016) * Math.cos(z * 0.013) * 3 + Math.sin(z * 0.036) * 1.2;
  for (const p of POIS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 60) return p.type === "radar" ? 14 : p.type === "quarry" ? -3 : 0;
    if (d < 95) {
      const f = (95 - d) / 35;
      h =
        h * (1 - f) +
        (p.type === "radar" ? 14 : p.type === "quarry" ? -3 : 0) * f;
    }
  }
  return h - Math.max(0, edge - 295) * 0.22;
}
export const buildings: Building[] = [];
export const colliders: Collider[] = [];
function wall(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  material: Collider["material"] = "concrete",
  kind = "wall",
) {
  colliders.push({ x, y, z, w, h, d, material, kind });
}
for (const [index, poi] of POIS.entries()) {
  if (index >= 1 && index <= 4) continue;
  for (let j = 0; j < (index === 0 ? 7 : 3); j++) {
    const x = poi.x + ((j % 3) - 1) * 24,
      z = poi.z + (Math.floor(j / 3) - 1) * 28,
      y = groundHeight(x, z),
      w = 16,
      d = 18,
      h = j % 3 === 1 ? 7 : 5;
    buildings.push({ x, z, y, w, d, h, style: (index + j) % 4 });
    wall(x, y - 0.15, z, w, 0.3, d, "concrete", "floor");
    // Front/back entrances and broad side windows leave real sight lines.
    for (const s of [-1, 1]) {
      wall(x - 5, y + h / 2, z + (s * d) / 2, 6, h, 0.45);
      wall(x + 5, y + h / 2, z + (s * d) / 2, 6, h, 0.45);
      wall(x, y + 3 + (h - 3) / 2, z + (s * d) / 2, 4, h - 3, 0.45);
      wall(x + (s * w) / 2, y + 0.65, z, 0.45, 1.3, d);
      wall(x + (s * w) / 2, y + 3.5 + (h - 3.5) / 2, z, 0.45, h - 3.5, d);
      for (const dz of [-7, 0, 7])
        wall(x + (s * w) / 2, y + 2.4, z + dz, 0.45, 2.2, 2);
    }
    wall(x, y + h + 0.1, z, w + 0.5, 0.25, d + 0.5, "metal", "roof");
    // A staircase along the rear exterior leads to each traversable roof.
    for (let k = 0; k < Math.ceil(h / 0.25); k++) {
      const sh = (k + 1) * 0.25;
      wall(
        x + w / 2 + 1.3,
        y + sh / 2,
        z - d / 2 + k * 0.48,
        2.2,
        sh,
        0.5,
        "concrete",
        "stairs",
      );
    }
    if (j % 2 === 0) {
      wall(x + 4, y + 1, z - 2, 2, 2, 3, "wood", "crate");
      wall(x - 3, y + 0.6, z + 2, 3, 1.2, 1, "wood", "desk");
    }
  }
}
const rng = random(8712);
export const props: {
  x: number;
  z: number;
  y: number;
  type: string;
  scale: number;
  angle: number;
}[] = [];
for (let i = 0; i < 150; i++) {
  const x = (rng() - 0.5) * 610,
    z = (rng() - 0.5) * 610;
  if (POIS.some((p) => Math.hypot(p.x - x, p.z - z) < 53)) continue;
  const type = i % 3 === 0 ? "rock" : "tree",
    scale = type === "tree" ? 7 + rng() * 8 : 2 + rng() * 5,
    y = groundHeight(x, z);
  if (
    type === "tree" &&
    x > TDM.minX &&
    x < TDM.maxX &&
    z > TDM.minZ &&
    z < TDM.maxZ
  )
    continue;
  const angle = rng() * Math.PI * 2;
  if (inExtraArena(x, z, 8)) continue;
  props.push({ x, z, y, type, scale, angle });
  if (type === "tree")
    wall(x, y + scale / 3, z, 0.7, scale * 0.65, 0.7, "wood", "trunk");
  else
    wall(
      x,
      y + scale * 0.25,
      z,
      scale * 0.6,
      scale * 0.5,
      scale * 0.65,
      "concrete",
      "rock",
    );
}
for (let i = 0; i < 15; i++) {
  const x = 38 + (i % 3) * 8,
    z = -36 - Math.floor(i / 3) * 15;
  wall(x, groundHeight(x, z) + 2.1, z, 6, 4.2, 12, "metal", "container");
}
for (const poi of POIS) {
  if (inExtraArena(poi.x, poi.z)) continue;
  for (let j = 0; j < 5; j++) {
    const x = poi.x - 43 + j * 17,
      z = poi.z + 48;
    wall(x, groundHeight(x, z) + 0.65, z, 5, 1.3, 0.9, "concrete", "barrier");
  }
}
export function nearbyColliders(x: number, z: number, range = 3) {
  const out: Collider[] = [];
  const gx = Math.floor(x / 32),
    gz = Math.floor(z / 32),
    r = Math.ceil(range / 32);
  for (let ix = gx - r; ix <= gx + r; ix++)
    for (let iz = gz - r; iz <= gz + r; iz++)
      for (const c of grid.get(ix + "," + iz) || [])
        if (!out.includes(c)) out.push(c);
  return out;
}
// Physical perimeter and cover are shared by rendering, movement and gunfire.
for (const x of [TDM.minX, TDM.maxX])
  wall(
    x,
    4,
    (TDM.minZ + TDM.maxZ) / 2,
    1.2,
    8,
    TDM.maxZ - TDM.minZ,
    "concrete",
    "perimeter",
  );
for (const z of [TDM.minZ, TDM.maxZ])
  wall(
    (TDM.minX + TDM.maxX) / 2,
    4,
    z,
    TDM.maxX - TDM.minX,
    8,
    1.2,
    "concrete",
    "perimeter",
  );
for (const x of [-30, -4, 22]) {
  wall(x, 1.1, -77, 6, 2.2, 2.5, "metal", "cover");
  wall(x + 9, 0.65, -54, 4, 1.3, 1.2, "concrete", "cover");
}
// The visible harbor fuel tank participates in movement, bullets, grenades, and navigation.
wall(-53, 4, -45.58, 12.55, 8, 13.71, "metal", "industrial");
addExtraArenas(buildings, colliders, props);
const grid = new Map<string, Collider[]>();
for (const c of colliders)
  for (
    let x = Math.floor((c.x - c.w / 2) / 32);
    x <= Math.floor((c.x + c.w / 2) / 32);
    x++
  )
    for (
      let z = Math.floor((c.z - c.d / 2) / 32);
      z <= Math.floor((c.z + c.d / 2) / 32);
      z++
    ) {
      const key = x + "," + z;
      const list = grid.get(key) || [];
      list.push(c);
      grid.set(key, list);
    }
export function rayBox(o: Vec3, d: Vec3, c: Collider, max: number) {
  let lo = 0,
    hi = max;
  for (const [axis, size] of [
    ["x", "w"],
    ["y", "h"],
    ["z", "d"],
  ] as const) {
    const min = c[axis] - c[size] / 2,
      maxB = c[axis] + c[size] / 2;
    if (Math.abs(d[axis]) < 1e-8) {
      if (o[axis] < min || o[axis] > maxB) return Infinity;
    } else {
      const a = (min - o[axis]) / d[axis],
        b = (maxB - o[axis]) / d[axis];
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
      if (hi < lo) return Infinity;
    }
  }
  return lo;
}
export function worldRay(o: Vec3, d: Vec3, max = 350) {
  let best = max;
  let material: Collider["material"] = "concrete";
  for (const c of colliders) {
    if (Math.hypot(c.x - o.x, c.z - o.z) > max + 25) continue;
    const t = rayBox(o, d, c, best);
    if (t < best) {
      best = t;
      material = c.material;
    }
  }
  for (let t = 1; t < best; t += 1.5) {
    if (o.y + d.y * t < groundHeight(o.x + d.x * t, o.z + d.z * t)) {
      best = t;
      material = "wood";
      break;
    }
  }
  return { distance: best, material };
}

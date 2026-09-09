// Drop-in map-aware navigation draft. Copy to apps/game-server/navigation.ts and change imports to ../../packages/.
// Requires ARENAS + MapId in shared data; every arena ground must be flattened to y=0 BEFORE colliders are created.
import {
  ARENAS,
  clamp,
  dist,
  type MapId,
  type Vec3,
} from "../../packages/game-shared/data";
import {
  colliders,
  rayBox,
  worldRay,
  type Collider,
} from "../../packages/game-shared/map";
import type { Player } from "../../packages/game-shared/protocol";

type Position = Vec3 & { map?: MapId };
export type Node = Vec3 & { map: MapId; links: number[] };
type Navigation = {
  map: MapId;
  nodes: Node[];
  grid: Map<string, number>;
  obstacles: Collider[];
};
const SPACING = 2,
  CLEARANCE = 0.48;
const cache = new Map<MapId, Navigation>();
const mapIds = Object.keys(ARENAS) as MapId[];
const inBounds = (p: Vec3, map: MapId, inset = 0) => {
  const b = ARENAS[map];
  return (
    p.x >= b.minX + inset &&
    p.x <= b.maxX - inset &&
    p.z >= b.minZ + inset &&
    p.z <= b.maxZ - inset
  );
};
const mapOf = (p: Position): MapId =>
  p.map ?? mapIds.find((id) => inBounds(p, id)) ?? "harbor";

function segmentClear(
  a: Vec3,
  b: Vec3,
  graph: Navigation,
  clearance = CLEARANCE,
) {
  if (!inBounds(b, graph.map, 1.1)) return false;
  const length = dist(a, b);
  const direction =
    length > 0.0001
      ? { x: (b.x - a.x) / length, y: 0, z: (b.z - a.z) / length }
      : { x: 0, y: 0, z: 0 };
  return !graph.obstacles.some(
    (c) =>
      rayBox(
        { x: a.x, y: 1, z: a.z },
        direction,
        clearance === CLEARANCE
          ? c
          : {
              ...c,
              w: c.w + 2 * (clearance - CLEARANCE),
              d: c.d + 2 * (clearance - CLEARANCE),
            },
        length,
      ) <
      length + 0.001,
  );
}

function navigation(map: MapId): Navigation {
  const existing = cache.get(map);
  if (existing) return existing;
  const bounds = ARENAS[map];
  const graph: Navigation = {
    map,
    nodes: [],
    grid: new Map(),
    obstacles: colliders
      .filter(
        (c) =>
          c.y + c.h / 2 > 0.36 &&
          c.y - c.h / 2 < 1.8 &&
          c.x + c.w / 2 > bounds.minX &&
          c.x - c.w / 2 < bounds.maxX &&
          c.z + c.d / 2 > bounds.minZ &&
          c.z - c.d / 2 < bounds.maxZ,
      )
      .map((c) => ({
        ...c,
        y: 1,
        h: 2,
        w: c.w + CLEARANCE * 2,
        d: c.d + CLEARANCE * 2,
      })),
  };
  // ponytail: ground-floor routing; layered nodes are needed only for rooftop bot traversal.
  for (let x = bounds.minX + 2; x <= bounds.maxX - 2; x += SPACING)
    for (let z = bounds.minZ + 2; z <= bounds.maxZ - 2; z += SPACING) {
      const p: Node = { x, y: 0, z, map, links: [] };
      if (!segmentClear(p, p, graph)) continue;
      graph.grid.set(`${x},${z}`, graph.nodes.length);
      graph.nodes.push(p);
    }
  for (const p of graph.nodes)
    for (const dx of [-SPACING, 0, SPACING])
      for (const dz of [-SPACING, 0, SPACING]) {
        if (!dx && !dz) continue;
        const index = graph.grid.get(`${p.x + dx},${p.z + dz}`);
        if (index !== undefined && segmentClear(p, graph.nodes[index], graph))
          p.links.push(index);
      }
  cache.set(map, graph);
  return graph;
}

export function getNav(map: MapId = "harbor") {
  return navigation(map).nodes;
}
export function walkClear(
  a: Position,
  b: Position,
  clearance = CLEARANCE,
  map: MapId = mapOf(a),
) {
  if ((a.map && a.map !== map) || (b.map && b.map !== map)) return false;
  return segmentClear(a, b, navigation(map), clearance);
}

function nearest(p: Position, connector = true, map: MapId = mapOf(p)) {
  const { nodes: nav, grid } = navigation(map),
    bounds = ARENAS[map];
  const candidates: number[] = [],
    x =
      bounds.minX + 2 + Math.round((p.x - bounds.minX - 2) / SPACING) * SPACING,
    z =
      bounds.minZ + 2 + Math.round((p.z - bounds.minZ - 2) / SPACING) * SPACING;
  for (let dx = -8; dx <= 8; dx += SPACING)
    for (let dz = -8; dz <= 8; dz += SPACING) {
      const index = grid.get(`${x + dx},${z + dz}`);
      if (index !== undefined) candidates.push(index);
    }
  candidates.sort((a, b) => dist(p, nav[a]) - dist(p, nav[b]));
  return (
    candidates.find((n) => !connector || walkClear(p, nav[n], 0.34, map)) ?? -1
  );
}

export function route(
  from: Position,
  to: Position,
  map: MapId = mapOf(from),
): Position[] {
  if (
    (from.map && from.map !== map) ||
    (to.map && to.map !== map) ||
    !inBounds(to, map, 1.1)
  )
    return [];
  if (walkClear(from, to, CLEARANCE, map)) return [{ ...to, map }];
  const nav = getNav(map),
    start = nearest(from, true, map),
    end = nearest(to, false, map);
  if (start < 0 || end < 0) return [];
  const costs = new Float64Array(nav.length).fill(Infinity);
  const parents = new Int32Array(nav.length).fill(-1);
  // Small binary heap avoids scanning the full open set for every A* expansion.
  const open: { node: number; score: number }[] = [],
    closed = new Uint8Array(nav.length);
  const estimate = (n: number) => {
    const x = Math.abs(nav[n].x - nav[end].x),
      z = Math.abs(nav[n].z - nav[end].z);
    return x + z + (Math.SQRT2 - 2) * Math.min(x, z);
  };
  const push = (node: number, score: number) => {
    const item = { node, score };
    let i = open.length;
    open.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (open[parent].score <= score) break;
      open[i] = open[parent];
      i = parent;
    }
    open[i] = item;
  };
  const pop = () => {
    const first = open[0],
      last = open.pop()!;
    if (open.length) {
      let i = 0;
      while (i * 2 + 1 < open.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < open.length &&
          open[child + 1].score < open[child].score
        )
          child++;
        if (open[child].score >= last.score) break;
        open[i] = open[child];
        i = child;
      }
      open[i] = last;
    }
    return first.node;
  };
  costs[start] = 0;
  push(start, estimate(start));
  while (open.length) {
    const current = pop();
    if (closed[current]) continue;
    if (current === end) {
      const path: Vec3[] = [];
      for (let n = end; n !== -1; n = parents[n]) path.push(nav[n]);
      path.reverse();
      // Greedy line-of-travel smoothing preserves swept-body clearance.
      const smooth: Position[] = [];
      let anchor = from,
        i = 0;
      while (i < path.length) {
        let far = i;
        while (
          far + 1 < path.length &&
          walkClear(
            anchor,
            path[far + 1],
            anchor === from ? 0.34 : CLEARANCE,
            map,
          )
        )
          far++;
        smooth.push(path[far]);
        anchor = path[far];
        i = far + 1;
      }
      if (dist(anchor, to) > 0.01 && walkClear(anchor, to, CLEARANCE, map))
        smooth.push({ ...to, map });
      return smooth;
    }
    closed[current] = 1;
    for (const n of nav[current].links) {
      const cost = costs[current] + dist(nav[current], nav[n]);
      if (closed[n] || cost >= costs[n]) continue;
      costs[n] = cost;
      parents[n] = current;
      push(n, cost + estimate(n));
    }
  }
  return [];
}

// Actual 3D eye-to-torso visibility, including smoke (worldRay alone misses smoke).
export function canSee(
  p: Player,
  target: Player,
  smoke: { x: number; y: number; z: number; end: number }[],
  time: number,
) {
  if (
    mapOf(p) !== mapOf(target) ||
    !target.alive ||
    target.protectedUntil > time ||
    target.team === p.team ||
    p.flashUntil > time
  )
    return false;
  const eye = { x: p.x, y: p.y + (p.crouched ? 0.95 : 1.62), z: p.z };
  const delta = {
    x: target.x - eye.x,
    y: target.y + (target.crouched ? 0.6 : 1.1) - eye.y,
    z: target.z - eye.z,
  };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length < 0.01) return true;
  const d = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
  if (worldRay(eye, d, length).distance < length - 0.35) return false;
  return !smoke.some((s) => {
    if (s.end <= time) return false;
    const along = clamp(
      (s.x - eye.x) * d.x + (s.y + 1.5 - eye.y) * d.y + (s.z - eye.z) * d.z,
      0,
      length,
    );
    return (
      Math.hypot(
        s.x - eye.x - d.x * along,
        s.y + 1.5 - eye.y - d.y * along,
        s.z - eye.z - d.z * along,
      ) < 5
    );
  });
}

// Choose actual occluded space, reachable by the same route graph; reserve by ally distance.
export function cover(
  p: Player,
  threat: Position,
  allies: Player[],
): Position | null {
  const map = mapOf(p),
    nav = getNav(map);
  if (!inBounds(threat, map) || (threat.map && threat.map !== map)) return null;
  const candidates = nav.filter(
    (n) =>
      n.x % 4 === 0 &&
      n.z % 4 === 0 &&
      dist(n, p) >= 3 &&
      dist(n, p) <= 18 &&
      allies.every(
        (a) => a.id === p.id || !a.alive || mapOf(a) !== map || dist(a, n) > 2,
      ),
  );
  const scored = candidates
    .map((n) => {
      const length = Math.hypot(
        threat.x - n.x,
        threat.y + 1.4 - 0.9,
        threat.z - n.z,
      );
      const d = {
        x: (threat.x - n.x) / length,
        y: (threat.y + 0.5) / length,
        z: (threat.z - n.z) / length,
      };
      const hidden =
        worldRay({ ...n, y: 0.9 }, d, length).distance < length - 0.7;
      return {
        n,
        score: hidden
          ? 35 + Math.min(18, dist(n, threat)) - dist(n, p) * 1.5
          : -Infinity,
      };
    })
    .filter((c) => Number.isFinite(c.score))
    .sort((a, b) => b.score - a.score);
  for (const candidate of scored.slice(0, 8))
    if (route(p, candidate.n, map).length) return candidate.n;
  return null;
}

// Convert a desired WORLD vector to this game's local forward/strafe basis.
// This lets the bot follow its route while its head/gun tracks a visible enemy.
export function steering(
  p: Player,
  goal: Position,
  yaw: number,
  allies: Player[],
) {
  const map = mapOf(p);
  if ((goal.map && goal.map !== map) || !inBounds(goal, map, 1.1))
    return { forward: 0, strafe: 0 };
  const distance = dist(p, goal),
    divisor = Math.max(1, distance);
  let x = (goal.x - p.x) / divisor,
    z = (goal.z - p.z) / divisor;
  for (const ally of allies) {
    const d = dist(p, ally);
    if (
      ally.id === p.id ||
      !ally.alive ||
      mapOf(ally) !== map ||
      d >= 2 ||
      d < 0.01
    )
      continue;
    x += ((p.x - ally.x) / d) * (2 - d) * 0.7;
    z += ((p.z - ally.z) / d) * (2 - d) * 0.7;
  }
  const length = Math.max(1, Math.hypot(x, z));
  x /= length;
  z /= length;
  // Separation must never shove the route follower back through static cover.
  if (!walkClear(p, { x: p.x + x * 0.8, y: p.y, z: p.z + z * 0.8 })) {
    x = (goal.x - p.x) / divisor;
    z = (goal.z - p.z) / divisor;
  }
  return {
    forward: clamp(-Math.sin(yaw) * x - Math.cos(yaw) * z, -1, 1),
    strafe: clamp(Math.cos(yaw) * x - Math.sin(yaw) * z, -1, 1),
  };
}

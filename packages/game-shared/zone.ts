import { clamp } from "./data";
import type { Zone } from "./protocol";
export function zoneAt(elapsed: number): Zone {
  const stage = Math.min(5, Math.floor(Math.max(0, elapsed) / 40)),
    local = elapsed - stage * 40;
  const radii = [325, 225, 150, 90, 43, 12, 0],
    centers = [
      { x: 0, z: 0 },
      { x: 15, z: -10 },
      { x: -8, z: -12 },
      { x: 4, z: 8 },
      { x: -5, z: 3 },
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ];
  const hold = stage === 5 ? 8 : 15,
    duration = stage === 5 ? 24 : 25,
    progress = clamp((local - hold) / duration, 0, 1),
    a = centers[stage],
    b = centers[stage + 1];
  return {
    x: a.x + (b.x - a.x) * progress,
    z: a.z + (b.z - a.z) * progress,
    radius: radii[stage] + (radii[stage + 1] - radii[stage]) * progress,
    nextX: b.x,
    nextZ: b.z,
    nextRadius: radii[stage + 1],
    phase: stage + 1,
    remaining: Math.max(0, (local < hold ? hold : hold + duration) - local),
    closing: local >= hold,
  };
}
export function applyDamage(hp: number, armor: number, damage: number) {
  if (!Number.isFinite(damage) || damage < 0) return { hp, armor };
  const absorbed = Math.min(armor, damage);
  return { hp: Math.max(0, hp - (damage - absorbed)), armor: armor - absorbed };
}

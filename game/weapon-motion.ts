import { clamp } from "../packages/game-shared/data";
export type Spring = { position: number; velocity: number };
export function stepSpring(
  s: Spring,
  dt: number,
  frequency: number,
  damping = 0.8,
) {
  const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.008)),
    h = Math.min(dt, 0.1) / steps;
  for (let i = 0; i < steps; i++) {
    s.velocity +=
      (-frequency * frequency * s.position -
        2 * damping * frequency * s.velocity) *
      h;
    s.position += s.velocity * h;
  }
}
export { reloadTime as reloadDuration } from "../packages/game-shared/combat";
export function phaseProgress(
  end: number,
  serverTime: number,
  duration: number,
) {
  return clamp(1 - (end - serverTime) / duration, 0, 1);
}
export function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function reloadPose(t: number) {
  const tilt = smooth(0, 0.16, t) * (1 - smooth(0.84, 1, t));
  const remove = smooth(0.15, 0.31, t),
    insert = smooth(0.5, 0.69, t);
  const rack = smooth(0.76, 0.82, t) * (1 - smooth(0.84, 0.9, t));
  return {
    tilt,
    magDrop: remove - insert,
    magVisible: t < 0.34 || t > 0.5,
    rack,
    handReach: smooth(0.07, 0.16, t) * (1 - smooth(0.69, 0.77, t)),
    settle:
      Math.sin(clamp((t - 0.9) / 0.1, 0, 1) * Math.PI) * (t > 0.9 ? 1 : 0),
  };
}

export function nextRenderDeadline(previous: number, now: number, fps: number) {
  const step = 1 / Math.max(1, fps);
  return previous > 0 && now - previous < step * 2
    ? previous + step
    : now + step;
}

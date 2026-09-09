import { expect, it } from "vitest";
import {
  stepSpring,
  reloadPose,
  reloadDuration,
  phaseProgress,
} from "../game/weapon-motion";
import { WEAPONS } from "../packages/game-shared/data";
import { readFileSync } from "node:fs";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { weaponInstance } from "../game/assets";
it("settles recoil consistently at different frame rates", () => {
  const simulate = (dt: number) => {
    const s = { position: 0, velocity: 2 };
    for (let t = 0; t < 1; t += dt) stepSpring(s, dt, 22);
    return s;
  };
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const s = simulate(dt);
    expect(Math.abs(s.position)).toBeLessThan(0.0001);
    expect(Math.abs(s.velocity)).toBeLessThan(0.001);
  }
});
it("keeps magazine removal and insertion continuous and finishes at rest", () => {
  expect(reloadPose(0).magDrop).toBe(0);
  expect(reloadPose(0.31).magDrop).toBe(1);
  expect(reloadPose(0.42).magVisible).toBe(false);
  expect(reloadPose(0.7).magDrop).toBe(0);
  expect(reloadPose(1).tilt).toBe(0);
  for (let t = 0; t < 1; t += 0.005) {
    const p = reloadPose(t),
      n = reloadPose(t + 0.005);
    expect(Math.abs(p.magDrop - n.magDrop)).toBeLessThan(0.06);
  }
});
it("matches authoritative extended and empty reload timing", () => {
  const duration = reloadDuration(WEAPONS.kestrel, true, true);
  expect(duration).toBeCloseTo(WEAPONS.kestrel.reload * 1.15 + 0.3);
  expect(phaseProgress(10, 10 - duration, duration)).toBe(0);
  expect(phaseProgress(10, 10, duration)).toBe(1);
});
it("moves the actual rifle magazine down 25cm without moving the receiver", async () => {
  const b = readFileSync("public/assets/upgrade/firearms/assault-rifle.glb");
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    "",
  );
  const root = weaponInstance(gltf, 0.9);
  root.updateWorldMatrix(true, true);
  const mag = root.getObjectByName("Magazine")!,
    body = root.getObjectByName("Body")!;
  expect(mag).toBeDefined();
  const before = mag.getWorldPosition(new T.Vector3()),
    receiver = body.getWorldPosition(new T.Vector3()),
    axis = new T.Vector3(
      ...(mag.userData.motionAxis as [number, number, number]),
    );
  mag.position.addScaledVector(
    axis,
    0.25 / mag.getWorldScale(new T.Vector3()).z,
  );
  root.updateWorldMatrix(true, true);
  const after = mag.getWorldPosition(new T.Vector3());
  expect(before.y - after.y).toBeCloseTo(0.25);
  expect(receiver.distanceTo(body.getWorldPosition(new T.Vector3()))).toBe(0);
});

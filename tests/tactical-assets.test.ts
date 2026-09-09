import { expect, it } from "vitest";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { existsSync } from "node:fs";
import { WEAPONS, WEAPON_IDS } from "../packages/game-shared/data";

it("loads all eleven real weapons with valid geometry, grip frames and previews", async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  expect(new Set(WEAPON_IDS.map((id) => WEAPONS[id].asset)).size).toBe(11);
  for (const id of WEAPON_IDS) {
    const weapon = WEAPONS[id],
      doc = await io.read("public/assets/" + weapon.asset);
    const root = doc.getRoot(),
      names = root.listNodes().map((n) => n.getName());
    expect(names).toContain("Grip");
    expect(names).toContain("SupportGrip");
    expect(names).toContain("Muzzle");
    const box = getBounds(root.listScenes()[0]),
      length = Math.max(...box.max.map((n, i) => n - box.min[i]));
    expect(length).toBeGreaterThan(0.2);
    expect(length).toBeLessThan(1.2);
    expect(existsSync("public" + weapon.thumbnail)).toBe(true);
  }
});

it("retains authored arm skinning and reload clips plus enemy locomotion", async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const arms = await io.read("public/assets/operators/arms-reload.glb");
  expect(arms.getRoot().listSkins().length).toBeGreaterThan(0);
  expect(
    arms
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
  ).toContain("reload_ak74_empty");
  expect(arms.getRoot().listTextures().length).toBeGreaterThanOrEqual(3);
  const soldier = await io.read("public/assets/operators/vanguard.glb");
  expect(
    soldier
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
  ).toEqual(expect.arrayContaining(["Idle", "Walk", "Run"]));
});

import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { weaponInstance } from "../game/assets";
import { lowerRifleElbow } from "../game/fps-arms";
import { WeaponView } from "../game/weapon-view";
import { WEAPONS, type WeaponId } from "../packages/game-shared/data";
import type { Player } from "../packages/game-shared/protocol";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps real rifle sleeves clear of the eye while preserving the hand and M4 sightline", async () => {
  // Load real geometry; texture pixels and a GPU are unnecessary for ray intersections.
  const loader = new GLTFLoader().register(() => ({
    name: "GeometryOnly",
    loadTexture: () => Promise.resolve(new T.Texture()),
  }));
  const load = async (path: string) => {
    const bytes = readFileSync("public/assets/" + path);
    return loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  };
  const source = (await load("operators/arms-horizontal.glb")).scene;
  const smgSource = (await load("operators/arms-rifle.glb")).scene;
  const original = (source.getObjectByName("RightArmMesh") as T.Mesh).geometry;
  const originalPositions = original.getAttribute("position").array.slice();
  const originalAttribute = original.getAttribute("position");
  vi.spyOn(T.TextureLoader.prototype, "load").mockReturnValue(new T.Texture());
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillText: () => {},
      }),
    }),
  });
  const ids: WeaponId[] = [
    "pike",
    "wraith",
    "bastion",
    "breach",
    "morrow",
    "longbow",
    "wa2000",
  ];
  const ray = new T.Raycaster(
    new T.Vector3(),
    new T.Vector3(0, 0, -1),
    0.01,
    20,
  );
  for (const id of ids) {
    const view = new WeaponView(),
      arms = (id === "pike" ? smgSource : source).clone(true);
    if (id !== "pike") lowerRifleElbow(arms);
    if (!arms.getObjectByName("LeftArm")) {
      const left = new T.Group();
      left.name = "LeftArm";
      arms.add(left);
      arms.updateWorldMatrix(true, true);
      for (const name of [
        "LeftArmMesh",
        "LeftGripFrame",
        "LeftPalmFrame",
        "LeftWristFrame",
      ]) {
        const node = arms.getObjectByName(name);
        if (node) left.attach(node);
      }
    }
    const sleeve = arms.getObjectByName("RightArmMesh") as T.Mesh;
    const wrist = arms.getObjectByName("RightWristFrame")!;
    const corrected = sleeve.geometry.getAttribute("position");
    expect(sleeve.geometry).not.toBe(original);
    if (id !== "pike") expect(sleeve.geometry.userData.sharedAsset).toBe(false);
    // All finger/palm coordinates are unchanged by the elbow correction.
    for (let i = 0; i < corrected.count; i++)
      if (id !== "pike" && originalAttribute.getZ(i) <= wrist.position.z) {
        expect(corrected.getX(i)).toBe(originalAttribute.getX(i));
        expect(corrected.getY(i)).toBe(originalAttribute.getY(i));
        expect(corrected.getZ(i)).toBe(originalAttribute.getZ(i));
      }
    Object.assign(view.arms, {
      horizontal: id === "pike" ? new T.Group() : arms,
      rifle: id === "pike" ? arms : new T.Group(),
      pistol: new T.Group(),
      reloadRig: new T.Group(),
      mixer: new T.AnimationMixer(new T.Group()),
    });
    view.root.add(arms);
    const length = WEAPONS[id].length || 0.9;
    const gun = weaponInstance(await load(WEAPONS[id].asset!), length);
    view.register(id, gun, length);
    const bounds = new T.Box3().setFromObject(gun);
    expect(
      [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite),
    ).toBe(true);
    const player = {
      alive: true,
      air: "ground",
      grounded: true,
      selected: 0,
      weapons: [
        { id, attachment: "balanced", ammo: WEAPONS[id].mag, reserve: 20 },
      ],
      vx: 0,
      vz: 0,
      reloadAt: 0,
      plateAt: 0,
      healAt: 0,
      perk: "balanced",
    } as unknown as Player;
    let now = 10;
    for (const ads of [false, true, false, true])
      for (let frame = 0; frame < 60; frame++) {
        now += 1 / 60;
        view.update(player, 1 / 60, now, now, ads, false, false, 0, 0);
        const position = view.root.position.clone(),
          pitch = view.root.rotation.x;
        for (const sway of [-0.042, 0, 0.042])
          for (const bob of [-0.009, 0, 0.009]) {
            view.root.position.copy(position).add(new T.Vector3(sway, bob, 0));
            view.root.rotation.x = pitch + 0.036;
            view.scene.updateMatrixWorld(true);
            expect(
              ray.intersectObject(sleeve).length,
              `${id}: sleeve obstructs ADS=${ads}`,
            ).toBe(0);
          }
        view.root.position.copy(position);
        view.root.rotation.x = pitch;
      }
    view.scene.updateMatrixWorld(true);
    if (id === "wraith" || id === "pike")
      expect(ray.intersectObject(gun, true)).toHaveLength(0);
    view.dispose();
  }
  expect(original.getAttribute("position").array).toEqual(originalPositions);
});

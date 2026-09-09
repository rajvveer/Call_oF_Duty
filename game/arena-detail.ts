import * as T from "three";
import { dressVerdant } from "./verdant-dressing";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { colliders } from "../packages/game-shared/map";
import { TDM, random, type Arena } from "../packages/game-shared/data";

export function dressArena(scene: T.Scene, arena: Arena) {
  if (arena.id === "verdant") return dressVerdant(scene, arena);
  const dx = (arena.minX + arena.maxX) / 2 - 4,
    dz = (arena.minZ + arena.maxZ) / 2 + 25;
  const group = new T.Group();
  group.position.set(dx, 0, dz);
  group.userData.mapId = arena.id;
  group.visible = arena.id === "harbor";
  scene.add(group);
  const rng = random(8271),
    loader = new T.TextureLoader();
  const asphalt = new T.MeshStandardMaterial({
    color:
      arena.id === "quarry"
        ? "#a0987b"
        : arena.id === "citadel"
          ? "#626a70"
          : "#505b62",
    roughness: 0.83,
    metalness: 0.08,
  });
  for (const [key, suffix] of [
    ["map", "diff"],
    ["normalMap", "nor_gl"],
    ["roughnessMap", "rough"],
  ] as const) {
    loader.load(
      arena.id === "quarry"
        ? `/assets/ground-${suffix}.jpg`
        : `/assets/concrete_wall_009_${suffix}_1k.jpg`,
      (t) => {
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.repeat.set(34, 41.5);
        t.anisotropy = 8;
        if (key === "map") t.colorSpace = T.SRGBColorSpace;
        asphalt[key] = t;
        asphalt.needsUpdate = true;
      },
    );
  }
  asphalt.normalScale.set(0.55, 0.55);
  const yard = new T.Mesh(
    new T.PlaneGeometry(TDM.maxX - TDM.minX, TDM.maxZ - TDM.minZ),
    asphalt,
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(4, 0.055, -25);
  yard.receiveShadow = true;
  group.add(yard);

  // Baked into a few meshes: painted loading bays, lanes, expansion joints.
  const paint: T.BufferGeometry[] = [],
    seams: T.BufferGeometry[] = [];
  const stripe = (
    list: T.BufferGeometry[],
    x: number,
    z: number,
    w: number,
    d: number,
  ) => {
    const g = new T.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.061, z);
    list.push(g);
  };
  if (arena.id !== "quarry") {
    for (const x of [-40, 14, 62])
      for (let z = -100; z < 50; z += 7) stripe(paint, x, z, 0.15, 3);
    for (let x = -58; x < 68; x += 12) stripe(seams, x, -25, 0.035, 160);
    for (let z = -100; z < 54; z += 12) stripe(seams, 4, z, 130, 0.035);
    for (const x of [-30, -4, 22]) {
      stripe(paint, x, -81, 9, 0.12);
      stripe(paint, x - 4.5, -77, 0.12, 8);
      stripe(paint, x + 4.5, -77, 0.12, 8);
    }
  }
  for (const [geos, color, opacity] of [
    [paint, "#d0bd81", 0.75],
    [seams, "#1e2528", 0.55],
  ] as const) {
    if (!geos.length) continue;
    const mesh = new T.Mesh(
      mergeGeometries(geos)!,
      new T.MeshStandardMaterial({
        color,
        transparent: true,
        opacity,
        roughness: 0.94,
        depthWrite: false,
      }),
    );
    group.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  for (const [x, team, color, rotation] of [
    [-63.35, "BLUE", "#43b9e7", Math.PI / 2],
    [71.35, "RED", "#f06c5f", -Math.PI / 2],
  ] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#172630";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 256);
    ctx.font = "900 112px Arial";
    ctx.fillText(team + " / 06", 54, 139);
    ctx.font = "24px Arial";
    ctx.fillStyle = "#d0dbe0";
    ctx.fillText(arena.name + "     //     TRAINING COMMAND", 58, 203);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    for (const z of [-82, -20, 36]) {
      const sign = new T.Mesh(
        new T.PlaneGeometry(10, 2.5),
        new T.MeshStandardMaterial({
          map,
          roughness: 0.6,
          emissive: color,
          emissiveIntensity: 0.1,
        }),
      );
      sign.position.set(x, 3.9, z);
      sign.rotation.y = rotation;
      group.add(sign);
    }
    const strip = new T.Mesh(
      new T.BoxGeometry(0.06, 0.1, 156),
      new T.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.5,
      }),
    );
    strip.position.set(x, 6.5, -25);
    group.add(strip);
    const light = new T.PointLight(color, 35, 18, 2);
    light.position.set(x + (x < 0 ? 3 : -3), 4, -20);
    group.add(light);
  }

  const steel = new T.MeshStandardMaterial({
    color: "#34434c",
    roughness: 0.38,
    metalness: 0.75,
  });
  for (const [key, suffix] of [
    ["map", "diff"],
    ["normalMap", "nor_gl"],
    ["roughnessMap", "rough"],
  ] as const)
    loader.load(`/assets/rusty_painted_metal_${suffix}_1k.jpg`, (t) => {
      if (key === "map") t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = 8;
      steel[key] = t;
      steel.normalScale.set(0.3, 0.3);
      steel.needsUpdate = true;
    });
  const coverGeos: T.BufferGeometry[] = [];
  for (const c of colliders.filter(
    (c) =>
      c.kind === "cover" &&
      c.x > arena.minX &&
      c.x < arena.maxX &&
      c.z > arena.minZ &&
      c.z < arena.maxZ,
  )) {
    const g = new RoundedBoxGeometry(
      c.w + 0.025,
      c.h + 0.025,
      c.d + 0.025,
      2,
      0.07,
    );
    g.translate(c.x - dx, c.y, c.z - dz);
    coverGeos.push(g);
  }
  const covers = new T.Mesh(mergeGeometries(coverGeos)!, steel);
  covers.castShadow = covers.receiveShadow = true;
  group.add(covers);
  coverGeos.forEach((g) => g.dispose());

  const stainCanvas = document.createElement("canvas");
  stainCanvas.width = stainCanvas.height = 256;
  const ctx = stainCanvas.getContext("2d")!;
  for (let i = 0; i < 90; i++) {
    const x = 50 + rng() * 156,
      y = 50 + rng() * 156,
      radius = 8 + rng() * 40;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(12,20,25,.17)");
    gradient.addColorStop(1, "rgba(12,20,25,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  }
  const stains = new T.CanvasTexture(stainCanvas);
  stains.colorSpace = T.SRGBColorSpace;
  const stainMaterial = new T.MeshStandardMaterial({
    map: stains,
    transparent: true,
    depthWrite: false,
    roughness: 0.21,
    metalness: 0.2,
  });
  for (let i = 0; i < 18; i++) {
    const patch = new T.Mesh(
      new T.PlaneGeometry(3 + rng() * 6, 2 + rng() * 5),
      stainMaterial,
    );
    patch.rotation.set(-Math.PI / 2, 0, rng() * Math.PI);
    patch.position.set(-55 + rng() * 118, 0.064, -100 + rng() * 150);
    group.add(patch);
  }
  if (arena.id === "foundry")
    for (const x of [-10, 18]) {
      const light = new T.PointLight("#ffce95", 90, 35, 2);
      light.position.set(x, 6, -25);
      group.add(light);
      const strip = new T.Mesh(
        new T.BoxGeometry(0.25, 0.12, 25),
        new T.MeshStandardMaterial({
          color: "#ffe2aa",
          emissive: "#ffe2aa",
          emissiveIntensity: 3,
        }),
      );
      strip.position.set(x, 7.7, -25);
      group.add(strip);
    }
  group.userData.center = new T.Vector3(dx + 4, 0, dz - 25);
  return group;
}

import * as T from "three";
import { colliders } from "../packages/game-shared/map";
import type { Arena } from "../packages/game-shared/arenas";

export function dressVerdant(scene: T.Scene, arena: Arena) {
  const group = new T.Group();
  const cx = (arena.minX + arena.maxX) / 2,
    cz = (arena.minZ + arena.maxZ) / 2;
  group.position.set(cx, 0, cz);
  group.userData.center = new T.Vector3(cx, 0, cz);
  group.userData.mapId = arena.id;
  group.visible = false;
  scene.add(group);
  const white = new T.MeshStandardMaterial({
    color: "#8bafa2",
    roughness: 0.72,
  });
  const pale = new T.MeshStandardMaterial({
    color: "#9eafa0",
    roughness: 0.88,
  });
  const steel = new T.MeshStandardMaterial({
    color: "#224641",
    roughness: 0.45,
    metalness: 0.48,
  });
  const leaf = new T.MeshStandardMaterial({
    color: "#28795b",
    roughness: 0.82,
  });
  const mint = new T.MeshStandardMaterial({
    color: "#79f4bd",
    emissive: "#66e8ae",
    emissiveIntensity: 0.8,
    roughness: 0.5,
  });
  const coral = new T.MeshStandardMaterial({
    color: "#edab8d",
    emissive: "#edab8d",
    emissiveIntensity: 0.25,
    roughness: 0.6,
  });
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const matrix = new T.Object3D();
  // Static meshes grouped by geometry/material. Matrices are written once.
  const batch = (
    geometry: T.BufferGeometry,
    material: T.Material,
    transforms: number[][],
    shadows = false,
  ) => {
    if (!transforms.length) return;
    const mesh = new T.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach(([x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0], i) => {
      matrix.position.set(x, y, z);
      matrix.scale.set(sx, sy, sz);
      matrix.rotation.set(rx, ry, rz);
      matrix.updateMatrix();
      mesh.setMatrixAt(i, matrix.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const opaque: number[][] = [],
    dark: number[][] = [],
    foliage: number[][] = [],
    mintParts: number[][] = [],
    coralParts: number[][] = [];
  for (const c of colliders) {
    if (!c.kind?.startsWith("verdant-")) continue;
    const x = c.x - cx,
      z = c.z - cz,
      role = c.kind.slice(8);
    (role === "core" ? dark : opaque).push([x, c.y, z, c.w, c.h, c.d]);
    // Plain lower silhouettes. Foliage stays above 3m, or below .3m.
    if (role === "garden" || role === "screen") {
      // Inset panel joints and base rails give the tall ceramic screens readable scale.
      for (const side of [-1, 1]) {
        for (const y of [0.35, 1.65, c.h - 0.2])
          dark.push([
            x + side * (c.w / 2 + 0.008),
            y,
            z,
            0.02,
            0.035,
            c.d - 0.18,
          ]);
        for (let seam = -c.d / 2 + 3; seam < c.d / 2; seam += 3)
          dark.push([
            x + side * (c.w / 2 + 0.008),
            c.h / 2,
            z + seam,
            0.02,
            c.h - 0.3,
            0.025,
          ]);
      }
      for (let dz = -c.d / 2 + 1; dz < c.d / 2; dz += 2.1)
        foliage.push([
          x,
          c.h + 0.5,
          z + dz,
          Math.min(c.w * 0.48, 1.5),
          0.85,
          0.9,
        ]);
    }
    // Inset trays make cover read as research planters without alpha foliage.
    if (role === "planter") {
      dark.push([x, c.h + 0.015, z, c.w - 0.2, 0.03, c.d - 0.2]);
      mintParts.push([x, c.h + 0.04, z, c.w - 0.55, 0.03, 0.18]);
    }
    if (role === "baffle")
      mintParts.push([x, c.h + 0.05, z, c.w + 0.04, 0.1, c.d + 0.04]);
  }
  // Distinct warm stone floor; no harbor road paint or copied loading bays.
  batch(unitBox, pale, [[0, -0.048, 0, 59, 0.12, 69]]);
  const floorLines: number[][] = [];
  for (let x = -24; x <= 24; x += 6)
    floorLines.push([x, 0.02, 0, 0.025, 0.014, 68]);
  for (let z = -30; z <= 30; z += 6)
    floorLines.push([0, 0.02, z, 58, 0.014, 0.025]);
  batch(unitBox, steel, floorLines);
  for (const sign of [-1, 1]) {
    // Warm and cool lanes give readable callouts without tinting player bodies.
    (sign < 0 ? mintParts : coralParts).push([
      0,
      0.03,
      sign * 20,
      34,
      0.022,
      0.16,
    ]);
    (sign < 0 ? mintParts : coralParts).push([
      sign * 28.9,
      4,
      0,
      0.09,
      0.18,
      68,
    ]);
    // Dark-topped low racks and seedlings stay behind solid planter collision.
    opaque.push([sign * 26, 5.6, 0, 7, 0.35, 20]);
  }
  // The heart is an exact 8x8m solid plinth. Eight-sided crown and broad leaves
  // are overhead sculpture, never visual cover at player height.
  for (const sign of [-1, 1]) {
    mintParts.push(
      [sign * 4.01, 2.1, 0, 0.03, 0.15, 7.6],
      [0, 2.1, sign * 4.01, 7.6, 0.15, 0.03],
    );
    mintParts.push(
      [sign * 4.01, 0.35, 0, 0.03, 0.12, 7.6],
      [0, 0.35, sign * 4.01, 7.6, 0.12, 0.03],
    );
  }
  batch(
    new T.CylinderGeometry(0.8, 1.2, 1, 8),
    steel,
    [[0, 5.8, 0, 1, 3.2, 1]],
    true,
  );
  batch(new T.TorusGeometry(6.5, 0.18, 5, 8), mint, [
    [0, 7.2, 0, 1, 1, 1, Math.PI / 2],
  ]);
  for (let i = 0; i < 8; i++) {
    const theta = (i * Math.PI) / 4;
    foliage.push([
      Math.cos(theta) * 3.7,
      7.3,
      Math.sin(theta) * 3.7,
      2.8,
      0.9,
      1.3,
      0,
      -theta,
      0.17,
    ]);
  }
  // A ribbed conservatory silhouette: open sky keeps it cheap and well lit.
  const arches = [-30, -15, 0, 15, 30].map((z) => [0, 5.5, z, 28, 12, 28]);
  batch(new T.TorusGeometry(1, 0.012, 5, 32, Math.PI), steel, arches);
  dark.push([-28.6, 5.5, 0, 2, 0.4, 64], [28.6, 5.5, 0, 2, 0.4, 64]);
  // Suspended grow lights, no actual point lights/shadows or per-frame animation.
  for (const z of [-24, -12, 0, 12, 24])
    mintParts.push([-16, 10.7, z, 0.2, 0.12, 5], [16, 10.7, z, 0.2, 0.12, 5]);
  batch(unitBox, white, opaque, true);
  batch(unitBox, steel, dark, true);
  batch(unitBox, mint, mintParts);
  batch(unitBox, coral, coralParts);
  batch(new T.SphereGeometry(1, 10, 5), leaf, foliage);
  return group;
}

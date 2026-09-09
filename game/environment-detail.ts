import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  buildings,
  colliders,
  groundHeight,
} from "../packages/game-shared/map";
import { POIS, ARENAS, random } from "../packages/game-shared/data";

export function dressEnvironment(scene: T.Scene) {
  const rng = random(3971),
    groups: T.Group[] = [];
  const steel = new T.MeshStandardMaterial({
    color: "#535c57",
    metalness: 0.62,
    roughness: 0.48,
  });
  const pale = new T.MeshStandardMaterial({
    color: "#b1a68f",
    roughness: 0.93,
  });
  const fixtures: T.BufferGeometry[] = [],
    concrete: T.BufferGeometry[] = [];
  const box = (
    list: T.BufferGeometry[],
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const g = new T.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    list.push(g);
  };
  for (const [index, b] of buildings.entries()) {
    // Raised foundations, coping, vents and pipes break up broad wall silhouettes.
    for (const side of [-1, 1]) {
      box(concrete, b.w, 0.24, 0.22, b.x, b.y + 0.16, b.z + (side * b.d) / 2);
      box(
        fixtures,
        0.1,
        0.15,
        b.d + 1,
        b.x + side * (b.w / 2 + 0.1),
        b.y + b.h - 0.15,
        b.z,
      );
    }
    const vent = new T.CylinderGeometry(0.26, 0.26, 1.3, 12);
    vent.translate(b.x - 4, b.y + b.h + 0.75, b.z - 3);
    fixtures.push(vent);
    box(fixtures, 2.6, 0.9, 1.5, b.x + 3, b.y + b.h + 0.58, b.z - 3);
    for (let k = 0; k < 8; k++)
      box(
        fixtures,
        2.3,
        0.025,
        0.045,
        b.x + 3,
        b.y + b.h + 0.98,
        b.z - 3.65 + k * 0.18,
      );
    box(
      fixtures,
      0.09,
      b.h,
      0.09,
      b.x - b.w / 2 + 0.25,
      b.y + b.h / 2,
      b.z + b.d / 2 + 0.25,
    );
    const lamp = new T.Mesh(
      new T.BoxGeometry(0.7, 0.09, 0.18),
      new T.MeshStandardMaterial({
        color: "#f3deaf",
        emissive: "#ffbb66",
        emissiveIntensity: 1.8,
      }),
    );
    lamp.position.set(b.x, b.y + 3.1, b.z + b.d / 2 + 0.55);
    scene.add(lamp);
    if (index < 7 && index % 3 === 0) {
      const light = new T.PointLight("#efb972", 7, 8, 2);
      light.position.set(b.x, b.y + 2.8, b.z + 3);
      scene.add(light);
    }
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext("2d")!;
    c.clearRect(0, 0, 128, 128);
    c.fillStyle = "#d5c39c";
    c.font = "bold 85px Arial";
    c.textAlign = "center";
    c.fillText(String(index + 1).padStart(2, "0"), 64, 100);
    c.globalCompositeOperation = "destination-out";
    for (let k = 0; k < 130; k++)
      c.fillRect(rng() * 128, rng() * 128, rng() * 4 + 1, rng() * 3 + 1);
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    const number = new T.Mesh(
      new T.PlaneGeometry(1.5, 1.5),
      new T.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    number.position.set(b.x + 4.4, b.y + 2.4, b.z + b.d / 2 + 0.235);
    scene.add(number);
  }
  for (const [geos, material] of [
    [fixtures, steel],
    [concrete, pale],
  ] as const) {
    const mesh = new T.Mesh(mergeGeometries(geos)!, material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  const grassCanvas = document.createElement("canvas");
  grassCanvas.width = 128;
  grassCanvas.height = 256;
  const ctx = grassCanvas.getContext("2d")!;
  for (let i = 0; i < 22; i++) {
    const x = 20 + rng() * 88,
      top = 15 + rng() * 180;
    ctx.fillStyle = ["#777c42", "#747846", "#9a9765", "#566343"][i % 4];
    ctx.beginPath();
    ctx.moveTo(x - 2, 256);
    ctx.quadraticCurveTo(
      x + (rng() - 0.5) * 38,
      top + 80,
      x + (rng() - 0.5) * 55,
      top,
    );
    ctx.quadraticCurveTo(x + 4, top + 140, x + 3, 256);
    ctx.fill();
  }
  const grassTex = new T.CanvasTexture(grassCanvas);
  grassTex.colorSpace = T.SRGBColorSpace;
  const grassMat = new T.MeshStandardMaterial({
    map: grassTex,
    alphaTest: 0.45,
    side: T.DoubleSide,
    roughness: 1,
    color: "#b7b891",
  });
  const blade = new T.PlaneGeometry(1, 1);
  blade.translate(0, 0.5, 0);
  const grassBatches = new Map<
    string,
    { x: number; y: number; z: number; s: number; a: number }[]
  >();
  for (let i = 0; i < 17500; i++) {
    const x = (rng() - 0.5) * 620,
      z = (rng() - 0.5) * 620;
    if (
      Object.values(ARENAS).some(
        (a) =>
          a.id !== "quarry" &&
          x > a.minX &&
          x < a.maxX &&
          z > a.minZ &&
          z < a.maxZ,
      ) ||
      groundHeight(x, z) < -4 ||
      buildings.some(
        (b) =>
          Math.abs(b.x - x) < b.w / 2 + 1 && Math.abs(b.z - z) < b.d / 2 + 1,
      )
    )
      continue;
    const nearRoad = POIS.some((p) => {
      const len2 = p.x * p.x + p.z * p.z;
      if (!len2) return false;
      const t = T.MathUtils.clamp((x * p.x + z * p.z) / len2, 0, 1);
      return Math.hypot(x - p.x * t, z - p.z * t) < 5.2;
    });
    if (nearRoad) continue;
    if (
      colliders.some(
        (c) =>
          c.kind === "container" &&
          Math.abs(c.x - x) < c.w / 2 + 1 &&
          Math.abs(c.z - z) < c.d / 2 + 1,
      )
    )
      continue;
    const key = Math.floor(x / 48) + "," + Math.floor(z / 48),
      list = grassBatches.get(key) || [];
    list.push({
      x,
      y: groundHeight(x, z),
      z,
      s: 0.24 + rng() * 0.44,
      a: rng() * Math.PI,
    });
    grassBatches.set(key, list);
  }
  const transform = new T.Matrix4(),
    q = new T.Quaternion(),
    v = new T.Vector3();
  for (const [key, items] of grassBatches) {
    const group = new T.Group(),
      mesh = new T.InstancedMesh(blade, grassMat, items.length * 2);
    for (const [i, p] of items.entries())
      for (let s = 0; s < 2; s++) {
        q.setFromAxisAngle(new T.Vector3(0, 1, 0), p.a + (s * Math.PI) / 2);
        transform.compose(
          v.set(p.x, p.y, p.z),
          q,
          new T.Vector3(p.s * 1.4, p.s, 1),
        );
        mesh.setMatrixAt(i * 2 + s, transform);
      }
    mesh.receiveShadow = true;
    group.add(mesh);
    const [x, z] = key.split(",").map(Number);
    group.userData.center = new T.Vector3(x * 48 + 24, 0, z * 48 + 24);
    scene.add(group);
    groups.push(group);
  }
  const puddleMat = new T.MeshStandardMaterial({
    color: "#303d3b",
    metalness: 0.65,
    roughness: 0.38,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  for (const poi of POIS)
    for (let i = 0; i < 4; i++) {
      const x = poi.x + 12 + (rng() - 0.5) * 17,
        z = poi.z + 12 + (rng() - 0.5) * 14;
      const puddle = new T.Mesh(
        new T.CircleGeometry(1.2 + rng() * 1.8, 24),
        puddleMat,
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.rotation.z = rng() * Math.PI;
      puddle.scale.y = 0.3 + rng() * 0.35;
      puddle.position.set(x, groundHeight(x, z) + 0.052, z);
      scene.add(puddle);
    }
  return {
    update(position: T.Vector3, enabled: boolean) {
      for (const g of groups)
        g.visible =
          enabled &&
          (g.userData.center as T.Vector3).distanceTo(position) < 135;
    },
  };
}

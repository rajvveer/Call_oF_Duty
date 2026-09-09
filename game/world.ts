import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  buildings,
  colliders,
  groundHeight,
  props,
} from "../packages/game-shared/map";
import {
  POIS,
  RELAYS,
  TERMINALS,
  random,
  ARENAS,
  type Arena,
} from "../packages/game-shared/data";
import { loadModel, modelInstance } from "./assets";
import { dressArena } from "./arena-detail";
import { dressEnvironment } from "./environment-detail";
export function createWorld(
  scene: T.Scene,
  onProgress?: (n: number, s: string) => void,
) {
  const rng = random(7112);
  const natureBatches: {
    mesh: T.InstancedMesh;
    matrices: Float32Array;
    items: typeof props;
    map: string;
  }[] = [];
  const instanceMatrix = new T.Matrix4();
  scene.background = new T.Color("#aeb6aa");
  scene.fog = new T.FogExp2("#8b9eac", 0.0018);
  scene.add(new T.HemisphereLight("#bed6ec", "#3c4144", 0.48));
  const sun = new T.DirectionalLight("#ffe0bf", 3.1);
  sun.position.set(-90, 150, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -45,
    right: 45,
    top: 45,
    bottom: -45,
    near: 1,
    far: 400,
  });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const materials = {
    concrete: new T.MeshStandardMaterial({ color: "#c1c6c5", roughness: 0.96 }),
    metal: new T.MeshStandardMaterial({
      color: "#8d958e",
      metalness: 0.45,
      roughness: 0.62,
    }),
    wood: new T.MeshStandardMaterial({ color: "#6d644f", roughness: 0.9 }),
  };
  for (const [material, prefix] of [
    [materials.concrete, "concrete_wall_009"],
    [materials.metal, "rusty_painted_metal"],
  ] as const) {
    for (const [key, suffix] of [
      ["map", "diff"],
      ["normalMap", "nor_gl"],
      ["roughnessMap", "rough"],
    ] as const)
      new T.TextureLoader().load(
        "/assets/" + prefix + "_" + suffix + "_1k.jpg",
        (t) => {
          t.wrapS = t.wrapT = T.RepeatWrapping;
          t.anisotropy = 8;
          if (key === "map") t.colorSpace = T.SRGBColorSpace;
          material[key] = t;
          material.needsUpdate = true;
        },
      );
    material.normalScale.set(0.7, 0.7);
  }
  const surface = (root: T.Object3D) => {
    root.updateMatrixWorld(true);
    const point = new T.Vector3(),
      normal = new T.Vector3();
    root.traverse((node) => {
      if (!(node instanceof T.Mesh)) return;
      node.geometry = node.geometry.clone();
      node.geometry.userData.sharedAsset = false;
      const position = node.geometry.attributes.position,
        normals = node.geometry.attributes.normal;
      const uv = new Float32Array(position.count * 2);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
        normal
          .fromBufferAttribute(normals, i)
          .transformDirection(node.matrixWorld);
        if (Math.abs(normal.y) > 0.7) {
          uv[i * 2] = point.x / 2;
          uv[i * 2 + 1] = point.z / 2;
        } else if (Math.abs(normal.x) > Math.abs(normal.z)) {
          uv[i * 2] = point.z / 2;
          uv[i * 2 + 1] = point.y / 2;
        } else {
          uv[i * 2] = point.x / 2;
          uv[i * 2 + 1] = point.y / 2;
        }
      }
      node.geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
      node.material = materials.metal;
    });
  };
  const details = new T.Group();
  scene.add(details);
  const vegetation = new T.Group();
  scene.add(vegetation);
  const chunks: T.Group[] = [];
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 4;
  skyCanvas.height = 512;
  const sk = skyCanvas.getContext("2d")!,
    gradient = sk.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#21454f");
  gradient.addColorStop(0.45, "#6f989c");
  gradient.addColorStop(0.55, "#b9c1b0");
  gradient.addColorStop(0.68, "#e5c59a");
  gradient.addColorStop(1, "#afa68a");
  sk.fillStyle = gradient;
  sk.fillRect(0, 0, 4, 512);
  const sky = new T.Mesh(
    new T.SphereGeometry(1500, 32, 20),
    new T.MeshBasicMaterial({
      map: new T.CanvasTexture(skyCanvas),
      side: T.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  scene.add(sky);
  const groundGeometry = new T.PlaneGeometry(680, 680, 150, 150);
  groundGeometry.rotateX(-Math.PI / 2);
  const p = groundGeometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, groundHeight(p.getX(i), p.getZ(i)));
  groundGeometry.computeVertexNormals();
  const terrainMat = new T.MeshStandardMaterial({
    color: "#bfc4b4",
    roughness: 0.98,
  });
  const ground = new T.Mesh(groundGeometry, terrainMat);
  ground.receiveShadow = true;
  scene.add(ground);
  const texLoader = new T.TextureLoader();
  for (const [name, file] of [
    ["map", "ground-diff.jpg"],
    ["normalMap", "ground-nor_gl.jpg"],
    ["roughnessMap", "ground-rough.jpg"],
  ] as const) {
    texLoader.load("/assets/" + file, (t) => {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(170, 170);
      t.anisotropy = 8;
      if (name === "map") t.colorSpace = T.SRGBColorSpace;
      terrainMat[name] = t;
      terrainMat.needsUpdate = true;
    });
  }
  terrainMat.normalScale.set(0.65, 0.65);
  const water = new T.Mesh(
    new T.PlaneGeometry(3000, 3000),
    new T.MeshStandardMaterial({
      color: "#376d75",
      metalness: 0.5,
      roughness: 0.3,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -6.5;
  scene.add(water);
  const buckets = new Map<string, T.BufferGeometry[]>();
  const bucket = (key: string, g: T.BufferGeometry) => {
    const arr = buckets.get(key) || [];
    arr.push(g);
    buckets.set(key, arr);
  };
  for (const c of colliders) {
    if (c.kind?.startsWith("verdant-")) continue;
    if (
      ["container", "rock", "trunk", "cover", "industrial"].includes(
        c.kind || "",
      )
    )
      continue;
    const key =
      Math.floor(c.x / 64) + "," + Math.floor(c.z / 64) + "," + c.material;
    const g = new T.BoxGeometry(c.w, c.h, c.d);
    g.translate(c.x, c.y, c.z);
    const p = g.attributes.position,
      n = g.attributes.normal,
      uv = g.attributes.uv,
      tile = c.material === "metal" ? 2.2 : 1.8;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getY(i)) > 0.5)
        uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
      else if (Math.abs(n.getX(i)) > 0.5)
        uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile);
      else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
    }
    bucket(key, g);
  }
  for (const [key, gs] of buckets) {
    const g = mergeGeometries(gs)!;
    gs.forEach((g) => g.dispose());
    const m = new T.Mesh(
      g,
      materials[key.split(",")[2] as keyof typeof materials],
    );
    m.castShadow = m.receiveShadow = true;
    const chunk = new T.Group();
    g.computeBoundingBox();
    chunk.userData.bounds = g.boundingBox;
    chunk.add(m);
    chunk.userData.center = new T.Vector3(
      Number(key.split(",")[0]) * 64 + 32,
      0,
      Number(key.split(",")[1]) * 64 + 32,
    );
    scene.add(chunk);
    chunks.push(chunk);
  }
  const detailGeos: T.BufferGeometry[] = [];
  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const g = new T.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    detailGeos.push(g);
  };
  for (const b of buildings) {
    // Deep window reveals, roof copings, door frames and exterior stair rails.
    for (const s of [-1, 1]) {
      addBox(b.w + 0.8, 0.18, 0.35, b.x, b.y + b.h + 0.3, b.z + (s * b.d) / 2);
      addBox(0.35, 0.18, b.d, b.x + (s * b.w) / 2, b.y + b.h + 0.3, b.z);
      for (const dx of [-2.1, 2.1])
        addBox(0.16, 3, 0.6, b.x + dx, b.y + 1.5, b.z + (s * b.d) / 2);
      addBox(4.5, 0.18, 1.8, b.x, b.y + 3.08, b.z + s * (b.d / 2 + 0.35));
    }
    addBox(3, 0.15, 2, b.x - 3, b.y + 1.25, b.z + 2);
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 256;
    signCanvas.height = 64;
    const ctx = signCanvas.getContext("2d")!;
    ctx.fillStyle = "#263c3d";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#c9bd9d";
    ctx.font = "bold 25px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      [
        "SIGNAL AUTHORITY",
        "MERIDIAN WORKS",
        "RESTRICTED AREA",
        "COASTAL LOGISTICS",
      ][b.style],
      128,
      41,
    );
    const sign = new T.Mesh(
      new T.PlaneGeometry(4.8, 1.2),
      new T.MeshStandardMaterial({
        map: new T.CanvasTexture(signCanvas),
        roughness: 0.8,
      }),
    );
    sign.position.set(b.x, b.y + 4.2, b.z + b.d / 2 + 0.24);
    details.add(sign);
  }
  const trims = new T.Mesh(
    mergeGeometries(detailGeos)!,
    new T.MeshStandardMaterial({
      color: "#344d4d",
      metalness: 0.35,
      roughness: 0.7,
    }),
  );
  trims.castShadow = true;
  details.add(trims);
  detailGeos.forEach((g) => g.dispose());
  // Roads follow the same analytic terrain used by collision.
  const roads = new T.Group();
  scene.add(roads);
  for (const poi of POIS) {
    const length = Math.hypot(poi.x, poi.z);
    if (length < 1) continue;
    const geom = new T.PlaneGeometry(8, length, 1, Math.ceil(length / 6));
    geom.rotateX(-Math.PI / 2);
    const a = Math.atan2(poi.x, poi.z);
    geom.rotateY(a);
    geom.translate(poi.x / 2, 0, poi.z / 2);
    const attr = geom.attributes.position;
    for (let i = 0; i < attr.count; i++)
      attr.setY(i, groundHeight(attr.getX(i), attr.getZ(i)) + 0.04);
    geom.computeVertexNormals();
    const road = new T.Mesh(
      geom,
      new T.MeshStandardMaterial({ color: "#555b50", roughness: 1 }),
    );
    road.receiveShadow = true;
    roads.add(road);
  }
  const mountainGeo = new T.PlaneGeometry(1800, 900, 110, 60);
  mountainGeo.rotateX(-Math.PI / 2);
  const a = mountainGeo.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i),
      z = a.getZ(i);
    const peak = Math.max(0, 1 - Math.abs(z) / 450);
    a.setY(
      i,
      peak *
        (55 +
          Math.pow(Math.abs(Math.sin(x * 0.005 + Math.sin(z * 0.006))), 1.5) *
            95 +
          Math.abs(Math.sin(x * 0.012 + z * 0.007)) * 22) +
        Math.sin(x * 0.035 + z * 0.05) * 2 -
        25,
    );
  }
  mountainGeo.computeVertexNormals();
  const mountains = new T.Mesh(
    mountainGeo,
    new T.MeshStandardMaterial({ color: "#738178", roughness: 1 }),
  );
  mountains.position.z = -700;
  scene.add(mountains);
  const craneMat = new T.MeshStandardMaterial({
    color: "#96734e",
    metalness: 0.45,
    roughness: 0.75,
  });
  const beam = (from: T.Vector3, to: T.Vector3, width: number) => {
    const g = new T.CylinderGeometry(width, width, from.distanceTo(to), 5);
    const m = new T.Mesh(g, craneMat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    m.castShadow = true;
    details.add(m);
  };
  for (let i = 0; i < 3; i++) {
    const x = 85 + i * 24,
      z = -85;
    for (const s of [-1, 1]) {
      beam(
        new T.Vector3(x + s * 5, 0, z),
        new T.Vector3(x + s * 3, 34, z),
        0.45,
      );
      for (let k = 0; k < 5; k++)
        beam(
          new T.Vector3(x - 4, 3 + k * 6, z),
          new T.Vector3(x + 4, 9 + k * 6, z),
          0.17,
        );
    }
    beam(new T.Vector3(x - 17, 35, z), new T.Vector3(x + 15, 35, z), 0.45);
    beam(new T.Vector3(x - 16, 35, z), new T.Vector3(x, 41, z), 0.2);
    beam(new T.Vector3(x + 14, 35, z), new T.Vector3(x, 41, z), 0.2);
    beam(new T.Vector3(x + 13, 35, z), new T.Vector3(x + 13, 14, z), 0.04);
  }
  const lights: T.Object3D[] = [];
  for (const terminal of TERMINALS) {
    const group = new T.Group();
    group.position.set(
      terminal.x,
      groundHeight(terminal.x, terminal.z),
      terminal.z,
    );
    const body = new T.Mesh(
      new T.CylinderGeometry(0.45, 0.7, 1.5, 6),
      materials.metal,
    );
    body.position.y = 0.75;
    group.add(body);
    const screen = new T.Mesh(
      new T.BoxGeometry(0.85, 0.5, 0.1),
      new T.MeshStandardMaterial({
        color: "#d9b471",
        emissive: "#d9b471",
        emissiveIntensity: 1.3,
      }),
    );
    screen.position.set(0, 1.5, 0.35);
    screen.rotation.x = -0.3;
    group.add(screen);
    details.add(group);
    lights.push(group);
  }
  for (const r of RELAYS) {
    const g = new T.Group();
    g.position.set(r.x, groundHeight(r.x, r.z), r.z);
    const base = new T.Mesh(
      new T.CylinderGeometry(0.8, 1.1, 1.4, 8),
      materials.metal,
    );
    base.position.y = 0.7;
    const mast = new T.Mesh(
      new T.CylinderGeometry(0.06, 0.06, 8, 8),
      materials.metal,
    );
    mast.position.y = 4;
    const beacon = new T.Mesh(
      new T.SphereGeometry(0.2, 8, 8),
      new T.MeshBasicMaterial({ color: "#83d7d1" }),
    );
    beacon.position.y = 8;
    g.add(base, mast, beacon);
    details.add(g);
  }
  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.width = cloudCanvas.height = 128;
  const cc = cloudCanvas.getContext("2d")!,
    cg = cc.createRadialGradient(64, 64, 0, 64, 64, 64);
  cg.addColorStop(0, "rgba(228,222,198,.5)");
  cg.addColorStop(1, "rgba(228,222,198,0)");
  cc.fillStyle = cg;
  cc.fillRect(0, 0, 128, 128);
  const cloudMat = new T.SpriteMaterial({
    map: new T.CanvasTexture(cloudCanvas),
    color: "#e0d8c1",
    transparent: true,
    depthWrite: false,
    opacity: 0.45,
  });
  const clouds: T.Sprite[] = [];
  for (let i = 0; i < 35; i++) {
    const c = new T.Sprite(cloudMat);
    c.position.set(
      (rng() - 0.5) * 1600,
      180 + rng() * 70,
      (rng() - 0.5) * 1600,
    );
    c.scale.set(160 + rng() * 240, 35 + rng() * 50, 1);
    scene.add(c);
    clouds.push(c);
  }
  const dustGeo = new T.BufferGeometry(),
    dp = new Float32Array(300 * 3);
  for (let i = 0; i < dp.length; i += 3) {
    dp[i] = (rng() - 0.5) * 130;
    dp[i + 1] = rng() * 30;
    dp[i + 2] = (rng() - 0.5) * 130;
  }
  dustGeo.setAttribute("position", new T.BufferAttribute(dp, 3));
  const dust = new T.Points(
    dustGeo,
    new T.PointsMaterial({
      color: "#e6d6b2",
      size: 0.09,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  scene.add(dust);
  const jobs: Promise<unknown>[] = [];
  let done = 0;
  const schedule = (work: Promise<unknown>) =>
    jobs.push(
      work
        .then(() => onProgress?.(++done / 18, "LOADING ENVIRONMENT"))
        .catch((e) => {
          console.warn("Optional environment asset failed", e);
          onProgress?.(++done / 18, "LOADING ENVIRONMENT");
        }),
    );
  for (const type of ["tree", "rock"])
    for (let variant = 0; variant < 3; variant++) {
      schedule(
        loadModel(
          type === "tree"
            ? "quaternius-pine.glb"
            : "upgrade/models/moss-rock.glb",
        ).then((g) => {
          const template = modelInstance(g, 1);
          template.traverse((o) => {
            if (o instanceof T.Mesh)
              for (const m of Array.isArray(o.material)
                ? o.material
                : [o.material]) {
                if (m instanceof T.MeshStandardMaterial) {
                  m.color.set(
                    type === "rock"
                      ? "#b5baa4"
                      : m.name.toLowerCase().includes("bark")
                        ? "#b1a799"
                        : "#9fad8b",
                  );
                  m.metalness = 0;
                  m.roughness = 0.95;
                }
              }
          });
          template.updateMatrixWorld(true);
          const size = new T.Box3()
            .setFromObject(template)
            .getSize(new T.Vector3());
          let index = 0;
          const matching = props
            .filter((p) => p.type === type)
            .filter(() => index++ % 3 === variant);
          template.traverse((node) => {
            if (!(node instanceof T.Mesh)) return;
            const inst = new T.InstancedMesh(
              node.geometry,
              node.material,
              matching.length,
            );
            const matrix = new T.Matrix4(),
              q = new T.Quaternion();
            for (const [i, p] of matching.entries()) {
              q.setFromAxisAngle(new T.Vector3(0, 1, 0), p.angle);
              matrix.compose(
                new T.Vector3(p.x, p.y, p.z),
                q,
                type === "rock"
                  ? new T.Vector3(
                      (p.scale * 0.6) / size.x,
                      (p.scale * 0.5) / size.y,
                      (p.scale * 0.65) / size.z,
                    )
                  : new T.Vector3(p.scale, p.scale, p.scale),
              );
              matrix.multiply(node.matrixWorld);
              inst.setMatrixAt(i, matrix);
            }
            inst.castShadow = inst.receiveShadow = true;
            natureBatches.push({
              mesh: inst,
              matrices: new Float32Array(inst.instanceMatrix.array),
              items: matching,
              map: "",
            });
            (type === "tree" ? vegetation : details).add(inst);
          });
        }),
      );
    }
  schedule(
    loadModel("industrial/shipping-container-a.glb").then((g) => {
      for (const c of colliders.filter((c) => c.kind === "container")) {
        const root = modelInstance(g, 4.2),
          b = new T.Box3().setFromObject(root),
          s = b.getSize(new T.Vector3());
        root.scale.x = 6 / s.x;
        root.scale.z = 12 / s.z;
        root.position.set(c.x, c.y - c.h / 2, c.z);
        surface(root);
        details.add(root);
      }
    }),
  );
  const industrial = [
    "detail-tank-large",
    "chimney-large",
    "water-tower",
    "solar-panel-landscape-group",
    "building-m",
    "building-o",
    "building-f",
    "windmill",
  ];
  for (const [i, name] of industrial.entries())
    schedule(
      loadModel("industrial/" + name + ".glb").then((g) => {
        for (let j = 0; j < 3; j++) {
          const poi = POIS[(i + j) % POIS.length],
            root = modelInstance(
              g,
              name.includes("chimney")
                ? 22
                : name === "water-tower"
                  ? 15
                  : name.includes("solar")
                    ? 2
                    : 8,
            );
          root.position.set(
            poi.x - 53 - j * 9,
            groundHeight(poi.x - 53 - j * 9, poi.z - 45),
            poi.z - 45,
          );
          if ([1, 2, 3, 4].includes(POIS.indexOf(poi))) continue;
          if (poi === POIS[0] && name !== "detail-tank-large") continue;
          surface(root);
          details.add(root);
        }
      }),
    );
  schedule(
    loadModel("nature/cliff_large_rock.glb").then((g) => {
      for (let i = 0; i < 26; i++) {
        const root = modelInstance(g, 18 + rng() * 20);
        const angle = (i / 26) * Math.PI * 2;
        root.position.set(Math.cos(angle) * 330, -14, Math.sin(angle) * 330);
        root.rotation.y = -angle;
        details.add(root);
      }
    }),
  );
  schedule(loadModel("weapons/crate-medium.glb"));
  const dressing = dressEnvironment(scene);
  const arenaGroups = Object.values(ARENAS).map((a) => dressArena(scene, a));
  const ready = Promise.all(jobs);
  return {
    sun,
    sky,
    clouds,
    details,
    vegetation,
    chunks,
    ready,
    update(
      time: number,
      position: T.Vector3,
      distance: number,
      arena: Arena = ARENAS.harbor,
    ) {
      dressing.update(position, vegetation.visible);
      for (const g of arenaGroups) g.visible = g.userData.mapId === arena.id;
      for (const batch of natureBatches)
        if (batch.map !== arena.id) {
          let count = 0;
          batch.items.forEach((p, i) => {
            const margin = 96 + p.scale;
            if (
              p.x < arena.minX - margin ||
              p.x > arena.maxX + margin ||
              p.z < arena.minZ - margin ||
              p.z > arena.maxZ + margin
            )
              return;
            batch.mesh.setMatrixAt(
              count++,
              instanceMatrix.fromArray(batch.matrices, i * 16),
            );
          });
          batch.mesh.count = count;
          batch.mesh.visible = count > 0;
          batch.mesh.instanceMatrix.needsUpdate = true;
          if (count) batch.mesh.computeBoundingSphere();
          batch.map = arena.id;
        }
      sky.position.copy(position);
      dust.position.x = position.x;
      dust.position.z = position.z;
      dust.rotation.y = time * 0.003;
      for (const c of chunks) {
        const bounds = c.userData.bounds as T.Box3;
        c.visible =
          bounds.max.x >= arena.minX - 64 &&
          bounds.min.x <= arena.maxX + 64 &&
          bounds.max.z >= arena.minZ - 64 &&
          bounds.min.z <= arena.maxZ + 64 &&
          (c.userData.center as T.Vector3).distanceTo(position) < distance + 70;
      }
      for (const c of clouds) c.position.x += 0.012;
      sun.position.set(position.x - 90, position.y + 62, position.z + 75);
      sun.target.position.copy(position);
      sun.target.updateMatrixWorld();
    },
  };
}

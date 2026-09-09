import * as T from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();
function softenNormals(geometry: T.BufferGeometry) {
  const p = geometry.getAttribute("position"),
    n = geometry.getAttribute("normal");
  if (!p || !n) return;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((v) => Math.round(v * 1e5))
      .join(",");
    const group = groups.get(key) || [];
    group.push(i);
    groups.set(key, group);
  }
  const smooth = new Float32Array(n.count * 3);
  for (const group of groups.values())
    for (const i of group) {
      let x = 0,
        y = 0,
        z = 0;
      for (const j of group)
        if (
          n.getX(i) * n.getX(j) +
            n.getY(i) * n.getY(j) +
            n.getZ(i) * n.getZ(j) >
          0.55
        ) {
          x += n.getX(j);
          y += n.getY(j);
          z += n.getZ(j);
        }
      const len = Math.hypot(x, y, z) || 1;
      smooth.set([x / len, y / len, z / len], i * 3);
    }
  geometry.setAttribute("normal", new T.BufferAttribute(smooth, 3));
}
export const loadModel = (path: string) => {
  if (!cache.has(path))
    cache.set(
      path,
      loader.loadAsync("/assets/" + path).then((g) => {
        g.scene.traverse((o) => {
          if (o instanceof T.Mesh) {
            if (path.startsWith("operator/")) softenNormals(o.geometry);
            o.geometry.userData.sharedAsset = true;
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material])
              m.userData.sharedAsset = true;
          }
        });
        return g;
      }),
    );
  return cache.get(path)!;
};
export function releaseInstance(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    skeletons = new Set<T.Skeleton>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      if (!o.geometry.userData.sharedAsset) geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (!m.userData.sharedAsset) materials.add(m);
      if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  skeletons.forEach((s) => s.dispose());
}
export function modelInstance(gltf: GLTF, height: number, skinned = false) {
  const root = skinned ? clone(gltf.scene) : gltf.scene.clone(true);
  const refresh = () => {
    root.updateMatrixWorld(true);
    if (skinned)
      root.traverse((o) => {
        if (o instanceof T.SkinnedMesh) {
          o.skeleton.update();
          o.computeBoundingBox();
          o.computeBoundingSphere();
        }
      });
  };
  refresh();
  const bounds = new T.Box3().setFromObject(root),
    size = bounds.getSize(new T.Vector3());
  const scale = height / Math.max(0.001, size.y);
  root.scale.multiplyScalar(scale);
  refresh();
  const b = new T.Box3().setFromObject(root);
  root.position.y -= b.min.y;
  refresh();
  const group = new T.Group();
  group.add(root);
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}
export function weaponInstance(gltf: GLTF, length: number) {
  const root = gltf.scene.clone(true);
  const b = new T.Box3().setFromObject(root),
    size = b.getSize(new T.Vector3()),
    center = b.getCenter(new T.Vector3());
  root.position.sub(center);
  const wrap = new T.Group();
  wrap.add(root);
  wrap.scale.setScalar(length / Math.max(size.x, size.y, size.z));
  wrap.rotation.y = Math.PI / 2;
  return wrap;
}
export function disposeTree(object: T.Object3D) {
  const geos = new Set<T.BufferGeometry>(),
    mats = new Set<T.Material>();
  object.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Points) {
      geos.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        mats.add(m);
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { modelInstance } from "../game/assets";
import { aimBone } from "../game/flight-view";
it("keeps the animated operator at human scale after skinning", async () => {
  const bytes = readFileSync("assets/runtime/operator/swat.glb");
  const gltf = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  const model = modelInstance(gltf, 1.8, true),
    mixer = new THREE.AnimationMixer(model);
  const idle = gltf.animations.find((a) => a.name.endsWith("|Idle_Gun"))!;
  mixer.clipAction(idle).play();
  mixer.update(0.2);
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingBox();
      o.computeBoundingSphere();
    }
  });
  const bounds = new THREE.Box3()
    .setFromObject(model)
    .getSize(new THREE.Vector3());
  expect(bounds.y).toBeGreaterThan(1.7);
  expect(bounds.y).toBeLessThan(1.9);
  expect(bounds.x).toBeGreaterThan(0.3);
});
it("raises the actual sanitized arm bones toward parachute risers", async () => {
  const bytes = readFileSync("assets/runtime/operator/swat.glb");
  const gltf = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  const model = modelInstance(gltf, 1.8, true);
  model.updateMatrixWorld(true);
  for (const side of ["L", "R"]) {
    const upper = model.getObjectByName("UpperArm" + side) as THREE.Bone,
      lower = model.getObjectByName("LowerArm" + side) as THREE.Bone,
      wrist = model.getObjectByName("Wrist" + side) as THREE.Bone;
    expect(upper).toBeDefined();
    const sign = side === "L" ? 1 : -1;
    aimBone(
      upper,
      lower,
      model.localToWorld(new THREE.Vector3(sign * 0.52, 1.5, 0.06)),
    );
    aimBone(
      lower,
      wrist,
      model.localToWorld(new THREE.Vector3(sign * 0.3, 1.78, 0.08)),
    );
    expect(wrist.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(1.65);
  }
});

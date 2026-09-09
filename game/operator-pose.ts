import * as T from "three";

const origin = new T.Vector3(),
  current = new T.Vector3(),
  desired = new T.Vector3();
const direction = new T.Vector3(),
  bend = new T.Vector3(),
  knee = new T.Vector3();
const parentRotation = new T.Quaternion(),
  correction = new T.Quaternion();
const hipPosition = new T.Vector3(),
  lowerPosition = new T.Vector3();
const footPosition = new T.Vector3(),
  headPosition = new T.Vector3(),
  headTop = new T.Vector3();
const torsoRotation = new T.Quaternion();
const solePoint = new T.Vector3();

function aim(bone: T.Bone, child: T.Bone, target: T.Vector3) {
  bone.getWorldPosition(origin);
  child.getWorldPosition(current).sub(origin).normalize();
  desired.copy(target).sub(origin).normalize();
  bone.parent!.getWorldQuaternion(parentRotation);
  correction.setFromUnitVectors(current, desired);
  parentRotation.invert();
  correction.premultiply(parentRotation);
  parentRotation.invert();
  correction.multiply(parentRotation);
  bone.quaternion.premultiply(correction);
  bone.updateWorldMatrix(false, true);
}

// Translation-only endpoint target, with an explicit knee pole. The original
// ankle rotation is restored by the caller so planted shoes stay flat.
export function solveTwoBone(
  upper: T.Bone,
  lower: T.Bone,
  foot: T.Bone,
  target: T.Vector3,
  pole: T.Vector3,
) {
  upper.getWorldPosition(hipPosition);
  lower.getWorldPosition(lowerPosition);
  foot.getWorldPosition(footPosition);
  const a = hipPosition.distanceTo(lowerPosition),
    b = lowerPosition.distanceTo(footPosition);
  direction.copy(target).sub(hipPosition);
  const distance = T.MathUtils.clamp(
    direction.length(),
    Math.abs(a - b) + 1e-5,
    a + b - 1e-5,
  );
  direction.normalize();
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction)).normalize();
  if (bend.lengthSq() < 1e-8) {
    bend.set(
      Math.abs(direction.x) < 0.8 ? 1 : 0,
      0,
      Math.abs(direction.x) < 0.8 ? 0 : 1,
    );
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  }
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  knee
    .copy(hipPosition)
    .addScaledVector(direction, along)
    .addScaledVector(bend, height);
  aim(upper, lower, knee);
  aim(lower, foot, target);
}

type Leg = {
  upper: T.Bone;
  lower: T.Bone;
  foot: T.Bone;
  target: T.Vector3;
  rotation: T.Quaternion;
  rest: T.Vector3;
};
export type CrouchRig = {
  model: T.Group;
  body: T.Object3D;
  baseY: number;
  baseZ: number;
  head: T.Bone;
  top: T.Bone;
  legs: Leg[];
  pole: T.Vector3;
  parent: T.Quaternion;
  soles: { mesh: T.SkinnedMesh; index: number }[];
  skins: T.SkinnedMesh[];
};

export function cacheCrouchRig(model: T.Group): CrouchRig {
  const bone = (name: string) =>
    model.getObjectByName("mixamorig" + name) as T.Bone;
  model.updateMatrixWorld(true);
  const ground = model.getWorldPosition(new T.Vector3()).y;
  const cells = new Map<
    string,
    { mesh: T.SkinnedMesh; index: number; y: number }
  >();
  const skins: T.SkinnedMesh[] = [];
  // Cache one actual sole vertex per3cm grid square. No full-mesh bounds or
  // geometry scan is needed during animation; Vanguard produces40 samples.
  model.traverse((node) => {
    if (!(node instanceof T.SkinnedMesh)) return;
    skins.push(node);
    node.skeleton.update();
    for (
      let index = 0;
      index < node.geometry.attributes.position.count;
      index++
    ) {
      node.getVertexPosition(index, solePoint).applyMatrix4(node.matrixWorld);
      if (solePoint.y > ground + 0.09) continue;
      const key =
        Math.round(solePoint.x / 0.03) + "," + Math.round(solePoint.z / 0.03);
      if (!cells.has(key) || solePoint.y < cells.get(key)!.y)
        cells.set(key, { mesh: node, index, y: solePoint.y });
    }
  });
  return {
    model,
    body: model.children[0],
    baseY: model.children[0].position.y,
    baseZ: model.children[0].position.z,
    head: bone("Head"),
    top: bone("HeadTop_End"),
    legs: ["Left", "Right"].map((side) => {
      const foot = bone(side + "Foot"),
        rest = foot.getWorldPosition(new T.Vector3());
      model.worldToLocal(rest);
      return {
        upper: bone(side + "UpLeg"),
        lower: bone(side + "Leg"),
        foot,
        target: new T.Vector3(),
        rotation: new T.Quaternion(),
        rest,
      };
    }),
    pole: new T.Vector3(),
    parent: new T.Quaternion(),
    soles: [...cells.values()],
    skins,
  };
}

// Call AFTER mixer.update(dt), BEFORE the existing arm/aim pose. Restore baseY
// even at crouch=0 so leaving crouch cannot accumulate a permanent body offset.
export function applyCrouchPose(
  rig: CrouchRig,
  crouch: number,
  groundY: number,
) {
  rig.body.position.y = rig.baseY;
  rig.body.position.z = rig.baseZ;
  rig.model.updateMatrixWorld(true);
  if (crouch <= 0.0001) return;
  rig.head.getWorldPosition(headPosition);
  rig.top.getWorldPosition(headTop);
  const animatedHeadCenter = (headPosition.y + headTop.y) * 0.5;
  // 0.97m center puts this model's helmet at1.09–1.10m, inside the1.1m capsule.
  const drop = Math.max(0, animatedHeadCenter - groundY - 0.97) * crouch;
  for (const leg of rig.legs) {
    leg.foot.getWorldPosition(leg.target);
    // A deeply crouched stance cannot retain the standing clip's long strides.
    // Preserve the gait phase but shorten horizontal travel to35percent.
    footPosition.copy(leg.rest);
    rig.model.localToWorld(footPosition);
    leg.target.x = T.MathUtils.lerp(
      leg.target.x,
      footPosition.x,
      0.65 * crouch,
    );
    leg.target.z = T.MathUtils.lerp(
      leg.target.z,
      footPosition.z,
      0.65 * crouch,
    );
    leg.foot.getWorldQuaternion(leg.rotation);
  }
  rig.model.getWorldQuaternion(torsoRotation);
  // Vanguard faces -Z. Knees bend forward in model space, including yaw turns.
  rig.pole.set(0, 0, -1).applyQuaternion(torsoRotation);
  rig.body.position.y -= drop;
  // Move the pelvis behind the ankles as it lowers. Without this, the knee
  // pole can fold a deeply crouched leg downward through the ground.
  rig.body.position.z += 0.2 * crouch;
  rig.model.updateMatrixWorld(true);
  for (let pass = 0; pass < 3; pass++) {
    for (const leg of rig.legs) {
      solveTwoBone(leg.upper, leg.lower, leg.foot, leg.target, rig.pole);
      leg.foot.parent!.getWorldQuaternion(rig.parent).invert();
      leg.foot.quaternion.copy(rig.parent).multiply(leg.rotation);
      leg.foot.updateWorldMatrix(false, true);
    }
    if (!rig.soles.length || pass === 2) break;
    for (const mesh of rig.skins) mesh.skeleton.update();
    let soleY = Infinity;
    for (const sample of rig.soles) {
      sample.mesh
        .getVertexPosition(sample.index, solePoint)
        .applyMatrix4(sample.mesh.matrixWorld);
      soleY = Math.min(soleY, solePoint.y);
    }
    const correctionY = (groundY + 0.004 - soleY) * crouch;
    if (Math.abs(correctionY) < 0.0005) break;
    for (const leg of rig.legs) leg.target.y += correctionY;
  }
}

// Use negative clip playback when moving backward; face the lower body into a
// strafe, and counter-rotate the chest before the world-space arm aiming pass.
export function locomotionFacing(vx: number, vz: number, aimYaw: number) {
  let turn = Math.atan2(
    Math.sin(Math.atan2(-vx, -vz) - aimYaw),
    Math.cos(Math.atan2(-vx, -vz) - aimYaw),
  );
  const reverse = Math.abs(turn) > Math.PI / 2;
  if (reverse) turn -= Math.sign(turn) * Math.PI;
  return { turn, playback: reverse ? -1 : 1 };
}

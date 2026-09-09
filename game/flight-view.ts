import * as T from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { loadModel, modelInstance } from "./assets";
import type { Player, Snapshot } from "../packages/game-shared/protocol";

export function aimBone(bone: T.Bone, child: T.Bone, target: T.Vector3) {
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(new T.Vector3()),
    current = child.getWorldPosition(new T.Vector3()).sub(origin).normalize(),
    desired = target.clone().sub(origin).normalize();
  const parent = bone.parent!.getWorldQuaternion(new T.Quaternion()),
    rotation = new T.Quaternion().setFromUnitVectors(current, desired);
  bone.quaternion.premultiply(
    parent.clone().invert().multiply(rotation).multiply(parent),
  );
  bone.updateWorldMatrix(false, true);
}

export class FlightView {
  helicopter = new T.Group();
  canopy = new T.Group();
  operator: T.Group | null = null;
  private mixer: T.AnimationMixer | null = null;
  private bones: { node: T.Bone; rest: T.Quaternion }[] = [];
  private rotors: { node: T.Object3D; axis: "x" | "y" }[] = [];
  private follow = new T.Vector3();
  private target = new T.Vector3();
  private lastPosition = new T.Vector3();
  private lastRotation = new T.Quaternion();
  private wasAir = false;
  private landing = 0;
  private goal = new T.Vector3();
  private light: T.Mesh;
  private blur: T.Mesh;
  constructor(private scene: T.Scene) {
    scene.add(this.helicopter, this.canopy);
    const geometry = new T.PlaneGeometry(6.4, 2.5, 30, 12),
      p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getY(i);
      p.setXYZ(
        i,
        x,
        0.35 +
          Math.cos(((x / 3.3) * Math.PI) / 2) * 0.85 +
          Math.cos(((z / 1.3) * Math.PI) / 2) * 0.12,
        z,
      );
    }
    geometry.computeVertexNormals();
    const cloth = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({
        color: "#a29864",
        side: T.DoubleSide,
        roughness: 0.92,
      }),
    );
    this.canopy.add(cloth);
    const lines: T.Vector3[] = [];
    for (const x of [-2.8, -1.5, 1.5, 2.8])
      for (const z of [-1, 1])
        lines.push(
          new T.Vector3(
            x,
            0.35 + Math.cos(((x / 3.3) * Math.PI) / 2) * 0.85,
            z,
          ),
          new T.Vector3(x < 0 ? -0.28 : 0.28, -1.82, 0.08),
        );
    this.canopy.add(
      new T.LineSegments(
        new T.BufferGeometry().setFromPoints(lines),
        new T.LineBasicMaterial({
          color: "#e1d8bd",
          transparent: true,
          opacity: 0.7,
        }),
      ),
    );
    this.canopy.visible = false;
    this.light = new T.Mesh(
      new T.SphereGeometry(0.06, 8, 6),
      new T.MeshBasicMaterial({ color: new T.Color(5, 0.18, 0.03) }),
    );
    this.light.position.set(0, 3, -4);
    this.helicopter.add(this.light);
    this.blur = new T.Mesh(
      new T.RingGeometry(0.8, 5.1, 64),
      new T.MeshBasicMaterial({
        color: "#bfc7bb",
        transparent: true,
        opacity: 0.085,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    this.blur.rotation.x = -Math.PI / 2;
    this.blur.position.y = 3.8;
    this.helicopter.add(this.blur);
  }
  async load(operator: GLTF) {
    const asset = await loadModel("upgrade/models/attack-helicopter.glb");
    const body = modelInstance(asset, 1),
      size = new T.Box3().setFromObject(body).getSize(new T.Vector3());
    body.scale.multiplyScalar(14 / Math.max(size.x, size.z));
    this.helicopter.add(body);
    body.updateWorldMatrix(true, true);
    body.traverse((o) => {
      if (o.name === "Propellers") this.rotors.push({ node: o, axis: "y" });
      else if (o.name.startsWith("Back_Propeller"))
        this.rotors.push({ node: o, axis: "x" });
      if (o instanceof T.Mesh) o.castShadow = o.receiveShadow = true;
    });
    const rotor = body.getObjectByName("Propellers");
    if (rotor) {
      rotor.getWorldPosition(this.blur.position);
      this.helicopter.worldToLocal(this.blur.position);
    }
    this.operator = modelInstance(operator, 1.8, true);
    this.operator.visible = false;
    this.scene.add(this.operator);
    this.mixer = new T.AnimationMixer(this.operator);
    const idle =
      operator.animations.find((a) => a.name.endsWith("|Idle_Neutral")) ||
      operator.animations[0];
    this.mixer.clipAction(idle).play();
    this.operator.traverse((o) => {
      if (o instanceof T.Bone)
        this.bones.push({ node: o, rest: o.quaternion.clone() });
    });
  }
  update(
    p: Player | null,
    s: Snapshot | null,
    dt: number,
    serverTime: number,
    yaw: number,
    pitch: number,
    camera: T.PerspectiveCamera,
    displayPosition?: T.Vector3,
  ) {
    for (const r of this.rotors)
      r.node.rotation[r.axis] += dt * (r.axis === "y" ? 44 : 72);
    this.light.visible = Math.sin(serverTime * 7) > 0;
    if (!p || !s) {
      this.helicopter.visible = true;
      this.helicopter.position.set(
        45 + Math.sin(serverTime * 0.08) * 12,
        16 + Math.sin(serverTime * 0.4) * 0.2,
        -30,
      );
      this.helicopter.rotation.set(0.02, -2.8, 0.03);
      if (this.operator) this.operator.visible = false;
      this.canopy.visible = false;
      return false;
    }
    const pos = displayPosition || p;
    const elapsed =
      s.phase === "insertion"
        ? serverTime - (s.phaseEnd - 14)
        : s.elapsed + 14 + Math.max(0, serverTime - s.time);
    this.helicopter.visible =
      s.phase === "insertion" || (s.phase === "active" && elapsed < 40);
    this.helicopter.position.set(-65 + elapsed * 8, 107, 60 - elapsed * 5);
    this.helicopter.rotation.set(
      -0.045,
      Math.atan2(8, -5),
      -0.045 + Math.sin(elapsed * 0.7) * 0.02,
    );
    const airborne = p.alive && p.air !== "ground";
    this.canopy.visible = airborne && p.air === "chute";
    this.canopy.position.set(pos.x, pos.y + 3.6, pos.z);
    this.canopy.rotation.set(
      Math.sin(serverTime * 2) * 0.015,
      yaw,
      Math.sin(serverTime * 1.5) * 0.025,
    );
    if (this.operator) {
      this.operator.visible = airborne && p.air !== "plane";
      this.operator.position.set(pos.x, pos.y, pos.z);
      this.operator.rotation.set(p.air === "fall" ? 0.25 : 0, yaw + Math.PI, 0);
      for (const b of this.bones) b.node.quaternion.copy(b.rest);
      this.mixer?.update(dt);
      this.operator.updateMatrixWorld(true);
      const chute = p.air === "chute";
      for (const side of ["L", "R"]) {
        const sign = side === "L" ? 1 : -1,
          upper = this.operator.getObjectByName("UpperArm" + side) as T.Bone,
          lower = this.operator.getObjectByName("LowerArm" + side) as T.Bone,
          wrist = this.operator.getObjectByName("Wrist" + side) as T.Bone;
        if (upper && lower && wrist) {
          const elbow = this.operator.localToWorld(
              new T.Vector3(
                sign * (chute ? 0.52 : 0.58),
                chute ? 1.5 : 1.2,
                0.06,
              ),
            ),
            hand = this.operator.localToWorld(
              new T.Vector3(
                sign * (chute ? 0.3 : 0.76),
                chute ? 1.78 : 1.12,
                0.08,
              ),
            );
          aimBone(upper, lower, elbow);
          aimBone(lower, wrist, hand);
        }
      }
    }

    if (airborne) {
      if (p.air === "plane") {
        this.target.copy(this.helicopter.position).add(new T.Vector3(0, 1, 0));
        const orbit = yaw + 0.6;
        this.goal.set(
          this.target.x + Math.sin(orbit) * 22,
          this.target.y + 7 + Math.sin(pitch) * 7,
          this.target.z + Math.cos(orbit) * 22,
        );
      } else {
        this.target.set(pos.x, pos.y + 1.25, pos.z);
        const distance = p.air === "chute" ? 7 : 5.2;
        this.goal.set(
          pos.x + Math.sin(yaw) * distance,
          pos.y + 3.2 - Math.sin(pitch) * 3,
          pos.z + Math.cos(yaw) * distance,
        );
      }
      if (!this.wasAir) this.follow.copy(this.goal);
      this.follow.lerp(this.goal, 1 - Math.exp(-dt * 5));
      camera.position.copy(this.follow);
      camera.lookAt(this.target);
      camera.fov = T.MathUtils.damp(
        camera.fov,
        p.air === "plane" ? 65 : 72,
        5,
        dt,
      );
      camera.updateProjectionMatrix();
      this.lastPosition.copy(camera.position);
      this.lastRotation.copy(camera.quaternion);
      this.landing = 0.42;
    } else if (this.landing > 0) {
      this.landing = Math.max(0, this.landing - dt);
      const ratio = this.landing / 0.42;
      camera.position.lerp(this.lastPosition, ratio * ratio);
      camera.quaternion.slerp(this.lastRotation, ratio * ratio);
    }
    this.wasAir = airborne;
    return airborne;
  }
  reset() {
    this.wasAir = false;
    this.landing = 0;
    this.canopy.visible = false;
    if (this.operator) this.operator.visible = false;
  }
}

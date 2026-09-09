import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { loadModel, releaseInstance } from "./assets";
import { WEAPONS, type WeaponId } from "../packages/game-shared/data";

const profiles: Record<WeaponId, string> = {
  kestrel: "ak74",
  pike: "mp5a5",
  wraith: "m4a1",
  bastion: "ak74",
  breach: "m24",
  morrow: "m24",
  longbow: "m24",
  vesper: "p226",
  deagle: "desert_eagle",
  revolver: "p226",
  wa2000: "scarl",
  knife: "p226",
};

// The baked idle pose raises the elbow through the eye when the rifle is centered.
// Bend only the sleeve beyond the wrist; keep the authored fingers and grip intact.
export function lowerRifleElbow(model: T.Group) {
  const sleeve = model.getObjectByName("RightArmMesh") as T.Mesh | undefined;
  const wrist = model.getObjectByName("RightWristFrame");
  if (!sleeve || !wrist) return;
  model.updateWorldMatrix(true, true);
  const pivot = sleeve.worldToLocal(wrist.getWorldPosition(new T.Vector3()));
  const geometry = sleeve.geometry.clone();
  geometry.userData.sharedAsset = false;
  const positions = geometry.getAttribute("position");
  const point = new T.Vector3(),
    axis = new T.Vector3(1, 0, 0);
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    const weight = T.MathUtils.smoothstep(point.z, pivot.z, pivot.z + 0.08);
    if (!weight) continue;
    point
      .sub(pivot)
      .applyAxisAngle(axis, weight * 0.5)
      .add(pivot);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  sleeve.geometry = geometry;
}

// Authored gloves, sleeves, finger poses and reload motion, mounted by palm frames.
export class FirstPersonArms {
  private rifle: T.Group | null = null;
  private horizontal: T.Group | null = null;
  private paired: T.Group | null = null;
  private pairedMixer: T.AnimationMixer | null = null;
  private pairedActions = new Map<string, T.AnimationAction>();
  private pairedAction: T.AnimationAction | null = null;
  private pairedKey = "";
  private pistol: T.Group | null = null;
  private reloadRig: T.Group | null = null;
  private mixer: T.AnimationMixer | null = null;
  private clips = new Map<string, T.AnimationAction>();
  private active: T.AnimationAction | null = null;
  private right = new T.Vector3();
  private target = new T.Vector3();
  private key = "";
  constructor(private root: T.Group) {}

  async load() {
    const [rifle, pistol, reload, horizontal, paired] = await Promise.all([
      loadModel("operators/arms-rifle.glb"),
      loadModel("operators/arms-pistol.glb"),
      loadModel("operators/arms-reload.glb"),
      loadModel("operators/arms-horizontal.glb"),
      loadModel("operators/ak74-paired.glb"),
    ]);
    this.paired = clone(paired.scene) as T.Group;
    this.paired.rotation.y = Math.PI / 2;
    this.pairedMixer = new T.AnimationMixer(this.paired);
    for (const clip of paired.animations)
      this.pairedActions.set(clip.name, this.pairedMixer.clipAction(clip));
    this.rifle = rifle.scene.clone(true);
    this.horizontal = horizontal.scene.clone(true);
    lowerRifleElbow(this.horizontal);
    this.pistol = pistol.scene.clone(true);
    this.reloadRig = clone(reload.scene) as T.Group;
    this.reloadRig.rotation.y = Math.PI;
    this.mixer = new T.AnimationMixer(this.reloadRig);
    for (const clip of reload.animations)
      this.clips.set(clip.name, this.mixer.clipAction(clip));
    for (const model of [
      this.rifle,
      this.pistol,
      this.reloadRig,
      this.horizontal,
      this.paired,
    ]) {
      model.visible = false;
      model.traverse((node) => {
        if (!(node instanceof T.Mesh)) return;
        node.frustumCulled = false;
        node.castShadow = false;
        // Keep the artist's color, normal, and packed roughness textures intact.
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material])
          if (material instanceof T.MeshStandardMaterial)
            material.envMapIntensity = 0.7;
      });
      this.root.add(model);
      if (
        model !== this.reloadRig &&
        model !== this.paired &&
        !model.getObjectByName("LeftArm")
      ) {
        const group = new T.Group();
        group.name = "LeftArm";
        model.add(group);
        model.updateWorldMatrix(true, true);
        for (const name of [
          "LeftArmMesh",
          "LeftGripFrame",
          "LeftPalmFrame",
          "LeftWristFrame",
        ]) {
          const node = model.getObjectByName(name);
          if (node) group.attach(node);
        }
      }
    }
  }

  attachOptic(optic: T.Group) {
    const bone = this.paired?.getObjectByName("PBody_058");
    if (!bone || !this.pairedMixer) return;
    const idle = this.pairedActions.get("Rig|AK_Idle");
    idle?.reset().play();
    this.pairedMixer.update(0);
    this.pairedAction = idle || null;
    this.pairedKey = "Rig|AK_Idle";
    this.paired?.updateWorldMatrix(true, true);
    bone.attach(optic);
  }
  private mount(model: T.Group, target: T.Vector3) {
    const frame = model.getObjectByName("RightGripFrame");
    if (!frame) return;
    model.updateWorldMatrix(true, true);
    frame.getWorldPosition(this.right);
    this.root.worldToLocal(this.right);
    model.position.add(this.right.sub(target).negate());
  }

  update(
    id: WeaponId,
    reload: boolean,
    progress: number,
    empty: boolean,
    grip: T.Vector3,
    support: T.Vector3,
    shotAge = 10,
    dt = 0,
  ) {
    if (
      !this.rifle ||
      !this.pistol ||
      !this.reloadRig ||
      !this.mixer ||
      !this.horizontal
    )
      return;
    if (id === "kestrel" && this.paired && this.pairedMixer) {
      this.hide();
      this.paired.visible = true;
      const fire = this.pairedActions.get("Rig|AK_Shot");
      const key = reload
        ? empty
          ? "Rig|AK_Reload_full"
          : "Rig|AK_Reload"
        : fire && shotAge < fire.getClip().duration
          ? "Rig|AK_Shot"
          : "Rig|AK_Idle";
      if (key !== this.pairedKey) {
        this.pairedAction?.stop();
        this.pairedAction = this.pairedActions.get(key) || null;
        this.pairedAction?.reset().play();
        this.pairedKey = key;
      }
      if (this.pairedAction) {
        if (reload)
          this.pairedAction.time =
            progress * this.pairedAction.getClip().duration;
        else if (key === "Rig|AK_Shot") this.pairedAction.time = shotAge;
        this.pairedMixer.update(key === "Rig|AK_Idle" ? dt : 0);
      }
      return true;
    }
    if (this.paired) this.paired.visible = false;
    const knife = id === "knife",
      pistol = WEAPONS[id].category === "Pistol" || knife,
      pose = pistol
        ? this.pistol
        : id === "pike"
          ? this.rifle
          : this.horizontal;
    this.rifle.visible = !pistol && id === "pike";
    this.horizontal.visible = !pistol && id !== "pike";
    this.pistol.visible = pistol;
    this.target.copy(grip);
    this.mount(pose, this.target);
    const showReload = reload && progress > 0.01 && progress < 0.99;
    const left = pose.getObjectByName("LeftArm");
    if (left) {
      left.visible = !showReload && !knife;
      left.rotation.set(0, 0, 0);
      left.userData.restPosition ??= left.position.toArray();
      left.position.fromArray(left.userData.restPosition);
      const frame = pose.getObjectByName("LeftGripFrame");
      if (frame) {
        pose.updateWorldMatrix(true, true);
        frame.getWorldPosition(this.right);
        left.parent!.worldToLocal(this.right);
        this.target.copy(support);
        this.root.localToWorld(this.target);
        left.parent!.worldToLocal(this.target);
        left.position.add(this.target.sub(this.right));
      }
    }
    this.target.copy(grip);
    this.reloadRig.visible = showReload;
    if (!showReload) {
      this.key = "";
      return;
    }
    const key = `reload_${profiles[id]}_${empty ? "empty" : "tactical"}`;
    if (key !== this.key) {
      this.active?.stop();
      this.active = this.clips.get(key) || null;
      this.active?.reset().setLoop(T.LoopOnce, 1).play();
      if (this.active) this.active.clampWhenFinished = true;
      this.key = key;
    }
    if (this.active) {
      this.active.time = progress * this.active.getClip().duration;
      this.mixer.update(0);
    }
    const rifleMesh = this.reloadRig.getObjectByName(
      "LongGunReloadForearmsMesh",
    );
    const pistolMesh = this.reloadRig.getObjectByName(
      "SidearmReloadForearmsMesh",
    );
    if (rifleMesh) rifleMesh.visible = !pistol;
    if (pistolMesh) pistolMesh.visible = pistol;
    this.mount(this.reloadRig, this.target);
  }

  contact(out: T.Vector3, pistol: boolean) {
    const marker = this.reloadRig?.getObjectByName(
      pistol ? "LeftSidearmMagazineAnchorFrame" : "LeftGripAnchorFrame",
    );
    if (!marker || !this.reloadRig?.visible) return false;
    this.reloadRig.updateWorldMatrix(true, true);
    marker.getWorldPosition(out);
    this.root.worldToLocal(out);
    return true;
  }

  hide() {
    for (const model of [
      this.rifle,
      this.pistol,
      this.reloadRig,
      this.horizontal,
    ])
      if (model) model.visible = false;
  }
  reset() {
    this.pairedAction?.stop();
    this.pairedKey = "";
    this.active?.stop();
    this.key = "";
  }
  dispose() {
    this.mixer?.stopAllAction();
    for (const model of [
      this.rifle,
      this.pistol,
      this.reloadRig,
      this.horizontal,
      this.paired,
    ])
      if (model) releaseInstance(model);
  }
}

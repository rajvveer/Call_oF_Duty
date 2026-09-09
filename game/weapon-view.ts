import * as T from "three";
import { FirstPersonArms } from "./fps-arms";
import {
  ATTACHMENTS,
  WEAPONS,
  type WeaponId,
  type Weapon,
} from "../packages/game-shared/data";
import type { Player } from "../packages/game-shared/protocol";
import type { Sound } from "./audio";
import {
  phaseProgress,
  reloadDuration,
  reloadPose,
  smooth,
  stepSpring,
  type Spring,
} from "./weapon-motion";
import { releaseInstance } from "./assets";
import { HEAL_DURATION } from "../packages/game-shared/combat";

export function softTexture(smoke = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  const gradient = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(
    0,
    smoke ? "rgba(255,255,255,.65)" : "rgba(255,255,255,1)",
  );
  gradient.addColorStop(
    0.28,
    smoke ? "rgba(255,255,255,.55)" : "rgba(255,238,197,.9)",
  );
  gradient.addColorStop(0.65, "rgba(230,225,213,.22)");
  gradient.addColorStop(1, "rgba(230,225,213,0)");
  c.fillStyle = gradient;
  c.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
type Part = {
  node: T.Object3D;
  rest: T.Vector3;
  axis: T.Vector3;
  scale: number;
  center: T.Vector3;
};
type Rig = {
  model: T.Group;
  mag?: Part;
  action?: Part;
  length: number;
  grip: T.Vector3;
  support: T.Vector3;
  muzzle: T.Vector3;
  optic?: T.Group;
};
export class WeaponView {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(58, 1, 0.01, 20);
  root = new T.Group();
  models = new Map<WeaponId, T.Group>();
  private rigs = new Map<WeaponId, Rig>();
  private springs: Spring[] = [
    { position: 0, velocity: 0 },
    { position: 0, velocity: 0 },
    { position: 0, velocity: 0 },
  ];
  arms = new FirstPersonArms(this.root);
  private finishNormal: T.Texture | null = null;
  private spare = new T.Mesh(
    new T.BoxGeometry(0.027, 0.11, 0.045),
    new T.MeshStandardMaterial({
      color: "#434a40",
      metalness: 0.7,
      roughness: 0.36,
    }),
  );
  private flash: T.Sprite;
  private flashLight = new T.PointLight("#ffcd83", 0, 2.5, 2);
  private flashUntil = 0;
  private shotAt = -100;
  private shotFoley = false;
  private selected: string | null = null;
  private switchAt = 0;
  private reloadKey = "";
  private lastProgress = 0;
  private aim = 0;
  private motion = 0;
  private look = new T.Vector2();
  private lastYaw = 0;
  private lastPitch = 0;
  private anchor = new T.Vector3();
  private scale = new T.Vector3();
  private scopeTemplate: T.Group | null = null;
  private inspectAt = -10;
  private injector: {
    model: T.Group;
    grip: T.Vector3;
    support: T.Vector3;
    plunger?: T.Object3D;
    plungerRest: T.Vector3;
  } | null = null;
  private healKey = 0;
  private sound: (cue: Sound) => void = () => {};
  constructor() {
    this.scene.add(this.camera);
    this.finishNormal = new T.TextureLoader().load(
      "/assets/rusty_painted_metal_nor_gl_1k.jpg",
    );
    this.finishNormal.wrapS = this.finishNormal.wrapT = T.RepeatWrapping;
    this.finishNormal.repeat.set(3, 3);
    this.finishNormal.anisotropy = 8;
    this.camera.add(this.root);
    this.scene.add(new T.HemisphereLight("#c6d6e3", "#343a30", 1.1));
    const key = new T.DirectionalLight("#ffe3c6", 2.6);
    key.position.set(-3, 4, 3);
    this.scene.add(key);
    const fill = new T.DirectionalLight("#afcddd", 1);
    fill.position.set(4, 1, -1);
    this.scene.add(fill);
    this.root.add(this.spare);
    this.flash = new T.Sprite(
      new T.SpriteMaterial({
        map: softTexture(),
        alphaTest: 0.02,
        color: new T.Color(5, 2.4, 0.7),
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.visible = false;
    this.root.add(this.flash, this.flashLight);
    this.root.visible = false;
  }
  setSound(callback: (cue: Sound) => void) {
    this.sound = callback;
  }
  setScopeTemplate(model: T.Group) {
    this.scopeTemplate = model;
  }
  setInjector(model: T.Group) {
    this.root.add(model);
    model.updateWorldMatrix(true, true);
    const grip =
      model.getObjectByName("Grip")?.getWorldPosition(new T.Vector3()) ||
      new T.Vector3();
    this.root.worldToLocal(grip);
    const pivot = new T.Group();
    pivot.position.copy(grip);
    model.position.sub(grip);
    pivot.add(model);
    this.root.add(pivot);
    const plunger = model.getObjectByName("Plunger");
    this.injector = {
      model: pivot,
      grip,
      support: grip.clone().add(new T.Vector3(-0.16, 0.03, -0.06)),
      plunger,
      plungerRest: plunger?.position.clone() || new T.Vector3(),
    };
    pivot.visible = false;
  }
  inspect(now: number) {
    this.inspectAt = now;
  }
  register(id: WeaponId, model: T.Group, length: number) {
    const body = model;
    model = new T.Group();
    model.add(body);
    if (id !== "knife") {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#c1c7b5";
      ctx.font = "bold 24px Arial";
      ctx.fillText(WEAPONS[id].name, 8, 30);
      ctx.font = "14px Arial";
      ctx.fillText("AV / FIELD SERIES 026", 8, 57);
      ctx.fillStyle = "#cfad69";
      ctx.fillRect(8, 72, 55, 3);
      for (let i = 0; i < 22; i++)
        ctx.fillRect(112 + i * 4, 69, i % 3 === 0 ? 2 : 1, 12);
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      const marking = new T.Mesh(
        new T.PlaneGeometry(
          WEAPONS[id].category === "Pistol" ? 0.075 : 0.14,
          0.046,
        ),
        new T.MeshStandardMaterial({
          map,
          transparent: true,
          depthWrite: false,
          roughness: 0.65,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      marking.rotation.y = -Math.PI / 2;
      marking.position.set(
        WEAPONS[id].category === "Pistol" ? -0.025 : -0.033,
        0.038,
        WEAPONS[id].category === "Pistol" ? 0 : 0.03,
      );
      marking.geometry.userData.sharedAsset = true;
      marking.material.userData.sharedAsset = true;
      model.add(marking);
    }
    this.root.add(model);
    model.visible = false;
    model.updateWorldMatrix(true, true);
    const part = (name: string): Part | undefined => {
      const node = model.getObjectByName(name);
      if (!node) return;
      node.userData.restPosition = node.position.toArray();
      return {
        node,
        rest: node.position.clone(),
        axis: new T.Vector3(
          ...((node.userData.motionAxis || [0, -1, 0]) as [
            number,
            number,
            number,
          ]),
        ),
        scale: node.getWorldScale(this.scale).z,
        center: new T.Vector3(
          ...((node.userData.center || [0, 0, 0]) as [number, number, number]),
        ),
      };
    };
    const point = (name: string, fallback: T.Vector3) => {
      const marker = model.getObjectByName(name);
      if (!marker) return fallback;
      marker.getWorldPosition(fallback);
      return this.root.worldToLocal(fallback);
    };
    this.models.set(id, model);
    this.rigs.set(id, {
      model,
      mag: part("Magazine"),
      action: part("Slide") || part("Pump") || part("Bolt"),
      length,
      grip: point(
        "Grip",
        new T.Vector3(
          0.015,
          WEAPONS[id].category === "Pistol" ? -0.095 : -0.15,
          0.19,
        ),
      ),
      support: point("SupportGrip", new T.Vector3(-0.04, -0.06, -0.25)),
      muzzle: point("Muzzle", new T.Vector3(0, 0.035, -length / 2 - 0.015)),
    });
    if (
      this.scopeTemplate &&
      !WEAPONS[id].scope &&
      !["Pistol", "Shotgun", "Melee"].includes(WEAPONS[id].category)
    ) {
      const optic = this.scopeTemplate.clone(true);
      optic.name = "MountedOptic";
      optic.position.set(0, this.rigs.get(id)!.muzzle.y + 0.047, 0.035);
      this.root.add(optic);
      if (id === "kestrel") this.arms.attachOptic(optic);
      else model.attach(optic);
      optic.visible = false;
      this.rigs.get(id)!.optic = optic;
    }
    body.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.renderOrder = 0;
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          material.depthTest = true;
          material.depthWrite = true;
          if (material instanceof T.MeshStandardMaterial && !material.map) {
            const polymer = /dark|rubber|grip|wood/i.test(material.name);
            material.metalness = polymer ? 0.08 : 0.72;
            material.roughness = polymer ? 0.68 : 0.31;
            material.normalMap = this.finishNormal;
            material.normalScale.set(0.035, 0.035);
            material.envMapIntensity = 1.15;
          }
        }
      }
    });
  }
  kick(id: WeaponId, time: number) {
    const w = WEAPONS[id];
    this.inspectAt = -10;
    this.springs[0].velocity += w.recoil * 90;
    this.springs[1].velocity += (Math.random() - 0.5) * w.horizontal * 110;
    this.springs[2].velocity += 0.3 + w.recoil * 7;
    this.flashUntil = time + 0.035;
    this.shotAt = time;
    this.shotFoley = false;
    if (id === "knife") {
      this.flashUntil = 0;
      return;
    }
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.scale.set(
      WEAPONS[id].category === "Pistol" ? 0.14 : 0.24,
      WEAPONS[id].category === "Pistol" ? 0.11 : 0.17,
      1,
    );
  }
  private movePart(part: Part | undefined, meters: number) {
    if (part)
      part.node.position
        .copy(part.rest)
        .addScaledVector(part.axis, meters / Math.max(0.0001, part.scale));
  }
  private advanceRecoil(w: Weapon, dt: number) {
    for (const spring of this.springs)
      stepSpring(
        spring,
        dt,
        (20 + w.recovery * 0.35) / Math.pow(w.weight / 3.5, 0.18),
      );
  }
  advanceHidden(p: Player, dt: number, now: number) {
    this.advanceRecoil(WEAPONS[p.weapons[p.selected].id], dt);
    this.look.multiplyScalar(Math.exp(-12 * dt));
    this.lastYaw = p.yaw;
    this.lastPitch = p.pitch;
    this.aim = T.MathUtils.damp(this.aim, 1, 15, dt);
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    this.root.visible = false;
    if (now - this.shotAt > 0.14) this.shotFoley = true;
  }
  decorateWorldWeapon(model: T.Group, id: WeaponId, attachment: string) {
    let optic = model.getObjectByName("MountedOptic");
    if (
      !optic &&
      this.scopeTemplate &&
      !WEAPONS[id].scope &&
      !["Pistol", "Shotgun", "Melee"].includes(WEAPONS[id].category)
    ) {
      optic = this.scopeTemplate.clone(true);
      optic.name = "MountedOptic";
      optic.position.set(
        0,
        (this.rigs.get(id)?.muzzle.y || 0.08) + 0.047,
        0.035,
      );
      model.add(optic);
    }
    if (optic) optic.visible = attachment === "optic";
  }
  update(
    p: Player,
    dt: number,
    now: number,
    serverTime: number,
    ads: boolean,
    sprint: boolean,
    motion: boolean,
    yaw: number,
    pitch: number,
    landing = 0,
  ) {
    const slot = p.weapons[p.selected],
      w = WEAPONS[slot.id],
      rig = this.rigs.get(slot.id);
    if (!rig) return;
    if (this.injector) {
      this.injector.model.visible = false;
      this.injector.plunger?.position.copy(this.injector.plungerRest);
    }
    if (p.alive && p.healAt && this.injector) {
      this.models.forEach((model) => (model.visible = false));
      for (const other of this.rigs.values())
        if (other.optic) other.optic.visible = false;
      this.root.visible = true;
      this.flash.visible = false;
      this.spare.visible = false;
      this.flashLight.intensity = 0;
      this.advanceRecoil(w, dt);
      const progress = phaseProgress(p.healAt, serverTime, HEAL_DURATION);
      const raise = smooth(0, 0.2, progress) * (1 - smooth(0.85, 1, progress));
      const jab =
        smooth(0.3, 0.42, progress) * (1 - smooth(0.65, 0.8, progress));
      this.aim = 0;
      this.inspectAt = -10;
      this.root.position.set(0.16, -0.38 + raise * 0.23, -0.42 - jab * 0.04);
      this.root.rotation.set(0.1, 0, -0.25);
      this.injector.model.visible = true;
      this.injector.model.rotation.z = jab * 0.6;
      if (this.injector.plunger)
        this.injector.plunger.position.y -=
          0.18 * (1 - smooth(0.42, 0.65, progress));
      this.arms.update(
        "vesper",
        false,
        0,
        false,
        this.injector.grip,
        this.injector.support,
        10,
        dt,
      );
      this.camera.fov = 58;
      this.camera.updateProjectionMatrix();
      if (this.healKey !== p.healAt) {
        this.sound("heal");
        this.healKey = p.healAt;
      }
      this.selected = null;
      return;
    }
    this.healKey = 0;
    for (const [id, other] of this.rigs)
      if (other.optic)
        other.optic.visible = id === slot.id && slot.attachment === "optic";
    this.root.visible = p.alive && p.air === "ground";
    this.flash.visible =
      this.root.visible && now < this.flashUntil && !p.reloadAt;
    this.flashLight.intensity = this.flash.visible ? 2.5 : 0;
    if (this.selected !== slot.id + ":" + p.selected) {
      this.models.forEach((m, id) => (m.visible = id === slot.id));
      this.selected = slot.id + ":" + p.selected;
      this.switchAt = now;
      this.reloadKey = "";
      this.sound(slot.id === "knife" ? "cloth" : "equip");
    }
    if (ads || p.reloadAt || sprint) this.inspectAt = -10;
    const speed = Math.hypot(p.vx, p.vz);
    this.motion += speed * dt;
    const busy = !!(p.reloadAt || p.plateAt || p.healAt);
    this.aim = T.MathUtils.damp(
      this.aim,
      ads && !busy ? 1 : 0,
      (1 / (w.ads * ATTACHMENTS[slot.attachment].ads)) * 3,
      dt,
    );
    this.advanceRecoil(w, dt);
    const lookX = T.MathUtils.clamp(
        (yaw - this.lastYaw) / Math.max(0.001, dt),
        -3,
        3,
      ),
      lookY = T.MathUtils.clamp(
        (pitch - this.lastPitch) / Math.max(0.001, dt),
        -3,
        3,
      );
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    this.look.x = T.MathUtils.damp(this.look.x, -lookX * 0.014, 12, dt);
    this.look.y = T.MathUtils.damp(this.look.y, lookY * 0.012, 12, dt);
    const reload = !!p.reloadAt,
      duration = reloadDuration(
        w,
        slot.ammo === 0,
        slot.attachment === "extended",
        p.perk,
      ),
      progress = reload ? phaseProgress(p.reloadAt, serverTime, duration) : 0,
      key = reload ? p.reloadAt + ":" + p.selected : "";
    if (key !== this.reloadKey) {
      this.reloadKey = key;
      this.lastProgress = 0;
      if (reload) this.sound("cloth");
    }
    if (reload) {
      const cues: [number, Sound][] =
        w.category === "Shotgun"
          ? [
              [0.22, "mag-in"],
              [0.4, "mag-in"],
              [0.6, "mag-in"],
              [0.84, "bolt"],
            ]
          : [
              [0.17, "mag-out"],
              [0.63, "mag-in"],
              [0.82, "bolt"],
              [0.94, "cloth"],
            ];
      for (const [threshold, cue] of cues)
        if (this.lastProgress < threshold && progress >= threshold)
          this.sound(cue);
      this.lastProgress = progress;
    }
    const pose = reloadPose(progress),
      tilt = reload ? pose.tilt : 0,
      lower = p.plateAt || p.healAt ? 1 : 0,
      switchLower = 1 - smooth(0, 0.32, now - this.switchAt);
    const walking = motion && p.grounded ? Math.min(1, speed / 5) : 0,
      sprinting = sprint && speed > 5 && !reload && !ads;
    // Line up the M4 rear aperture and front post instead of aiming into its carry handle.
    const m4 = slot.id === "wraith",
      smg = slot.id === "pike";
    this.root.position.set(
      T.MathUtils.lerp(0.24, m4 ? 0.001 : smg ? -0.0107 : 0, this.aim) +
        this.look.x,
      (w.category === "Pistol" ? -0.2 : -0.23) +
        this.aim *
          (w.category === "Pistol" ? 0.105 : m4 ? 0.099 : smg ? 0.0309 : 0.12) -
        tilt * 0.07 -
        lower * 0.48 -
        switchLower * 0.28,
      -0.4 + this.springs[2].position + tilt * 0.09,
    );
    this.root.position.x += walking * Math.sin(this.motion * 1.7) * 0.008;
    this.root.position.y +=
      walking * Math.cos(this.motion * 3.4) * 0.009 + landing * 0.65;
    this.root.rotation.set(
      this.springs[0].position -
        (m4 ? this.aim * 0.0125 : smg ? this.aim * 0.0055 : 0) -
        landing * 0.3 +
        tilt * 0.2 +
        (sprinting ? -0.1 : 0) +
        this.look.y,
      -tilt * 0.25 + this.springs[1].position,
      (sprinting ? 0.12 : 0) -
        tilt * 0.5 +
        walking * Math.sin(this.motion * 1.7) * 0.008,
    );
    if (slot.id === "knife") {
      const age = now - this.shotAt,
        swing = age >= 0 && age < 0.45 ? Math.sin((age / 0.45) * Math.PI) : 0;
      this.root.position.set(
        0.2 - swing * 0.19,
        -0.13 + swing * 0.025 - switchLower * 0.28,
        -0.4 - swing * 0.14,
      );
      this.root.rotation.set(
        -0.08 - swing * 0.18,
        -swing * 0.35,
        -0.22 - swing * 0.7,
      );
    }
    const age = now - this.inspectAt;
    if (age >= 0 && age < 1.6 && !reload && !ads && now - this.shotAt > 0.1) {
      const inspect = Math.sin((age / 1.6) * Math.PI);
      this.root.rotation.y -= inspect * 0.55;
      this.root.rotation.z -= inspect * 0.5;
      this.root.position.x -= inspect * 0.08;
    }
    this.camera.fov = T.MathUtils.lerp(58, 52, this.aim);
    this.camera.updateProjectionMatrix();
    this.movePart(rig.mag, reload ? pose.magDrop * 0.25 : 0);
    if (rig.mag) rig.mag.node.visible = !reload || pose.magVisible;
    const shotAge = now - this.shotAt,
      cycle =
        w.category === "Pistol" ? 0.11 : w.category === "Shotgun" ? 0.45 : 0.65;
    const cycleMotion =
      shotAge >= 0 && shotAge < cycle
        ? Math.sin((shotAge / cycle) * Math.PI)
        : 0;
    this.movePart(
      rig.action,
      reload
        ? pose.rack * 0.08
        : cycleMotion * (w.category === "Pistol" ? 0.035 : 0.075),
    );
    if (
      rig.action &&
      w.category !== "Pistol" &&
      !reload &&
      shotAge > 0.14 &&
      shotAge < cycle &&
      !this.shotFoley
    ) {
      this.sound("bolt");
      this.shotFoley = true;
    }
    this.spare.visible =
      reload && !rig.mag && progress > 0.22 && progress < 0.67;
    const paired = this.arms.update(
      slot.id,
      reload,
      progress,
      slot.ammo === 0,
      rig.grip,
      rig.support,
      shotAge,
      dt,
    );
    rig.model.visible = !paired;
    if (paired) this.spare.visible = false;
    if (
      reload &&
      rig.mag &&
      progress > 0.17 &&
      progress < 0.69 &&
      pose.magVisible &&
      this.arms.contact(this.anchor, w.category === "Pistol")
    ) {
      this.root.localToWorld(this.anchor);
      rig.mag.node.parent!.worldToLocal(this.anchor);
      const center = rig.mag.center.clone();
      rig.mag.node.localToWorld(center);
      rig.mag.node.parent!.worldToLocal(center);
      rig.mag.node.position.add(this.anchor.sub(center));
    }
    if (
      this.spare.visible &&
      this.arms.contact(this.anchor, w.category === "Pistol")
    )
      this.spare.position.copy(this.anchor);
    this.flash.position.copy(rig.muzzle);
    this.flashLight.position.copy(this.flash.position);
  }
  ejection(worldCamera: T.Camera, out: T.Vector3) {
    this.root.updateWorldMatrix(true, false);
    out.set(0.07, 0.015, 0.03).applyMatrix4(this.root.matrixWorld);
    return worldCamera.localToWorld(out);
  }
  reset() {
    this.arms.reset();
    this.reloadKey = "";
    this.selected = null;
    this.root.visible = false;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    for (const s of this.springs) {
      s.position = 0;
      s.velocity = 0;
    }
  }
  dispose() {
    this.arms.reset();
    releaseInstance(this.scene);
    this.finishNormal?.dispose();
    this.flash.material.map?.dispose();
    this.flash.material.dispose();
  }
}

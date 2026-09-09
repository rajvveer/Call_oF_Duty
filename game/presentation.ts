import {
  cacheCrouchRig,
  applyCrouchPose,
  locomotionFacing,
  type CrouchRig,
} from "./operator-pose";
import * as T from "three";
import { WeaponView, softTexture } from "./weapon-view";
import { FlightView, aimBone } from "./flight-view";
import type { Sound } from "./audio";
import {
  loadModel,
  modelInstance,
  weaponInstance,
  releaseInstance,
} from "./assets";
import {
  WEAPONS,
  WEAPON_IDS,
  type Vec3,
  type WeaponId,
} from "../packages/game-shared/data";
import type {
  GameEvent,
  Loot,
  Remote,
  Snapshot,
} from "../packages/game-shared/protocol";
type Avatar = {
  root: T.Group;
  mixer: T.AnimationMixer;
  actions: Map<string, T.AnimationAction>;
  action: string;
  last: T.Vector3;
  target: Remote;
  history: { time: number; p: Remote }[];
  weapon?: T.Group;
  weaponId?: WeaponId;
  weaponAttachment?: string;
  crouch: number;
  death: number;
  pose: CrouchRig;
  bodyYaw: number;
  animationTime: number;
};
type Effect = {
  mesh: T.Object3D;
  ttl: number;
  velocity?: T.Vector3;
  smoke?: boolean;
};
export class Presentation {
  weapon = new WeaponView();
  view = this.weapon.root;
  models = this.weapon.models;
  flight: FlightView;
  playSound: (kind: Sound, position?: Vec3, weight?: number) => void = () => {};
  private smokeTexture = softTexture(true);
  private impactTexture = softTexture();
  avatars = new Map<string, Avatar>();
  lootMeshes = new Map<string, T.Object3D>();
  projectiles = new Map<string, T.Mesh>();
  effects: Effect[] = [];
  operator: Awaited<ReturnType<typeof loadModel>> | null = null;
  crate: Awaited<ReturnType<typeof loadModel>> | null = null;
  menuOperator: T.Group | null = null;
  menuMixer: T.AnimationMixer | null = null;
  parachute: T.Group;
  plane: T.Group;
  zoneWall: T.Mesh;
  zoneRing: T.Mesh;
  constructor(
    private scene: T.Scene,
    private camera: T.PerspectiveCamera,
  ) {
    this.flight = new FlightView(scene);
    this.plane = this.flight.helicopter;
    this.parachute = this.flight.canopy;
    this.zoneWall = new T.Mesh(
      new T.CylinderGeometry(1, 1, 150, 128, 1, true),
      new T.MeshBasicMaterial({
        color: "#d69b66",
        transparent: true,
        opacity: 0.13,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    scene.add(this.zoneWall);
    this.zoneWall.visible = false;
    this.zoneRing = new T.Mesh(
      new T.TorusGeometry(1, 0.006, 4, 128),
      new T.MeshBasicMaterial({
        color: "#efc08d",
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.zoneRing.rotation.x = Math.PI / 2;
    scene.add(this.zoneRing);
    this.zoneRing.visible = false;
  }
  async load(progress: (n: number, s: string) => void) {
    this.operator = await loadModel("operators/vanguard.glb");
    await this.weapon.arms.load();
    const injector = await loadModel("weapons-real/syringe.glb");
    const syringe = weaponInstance(injector, 0.18);
    syringe.rotation.set(0, 0, Math.PI / 2);
    const syringeGrip = syringe.getObjectByName("Grip");
    if (syringeGrip) syringeGrip.position.x -= 0.032;
    this.weapon.setInjector(syringe);
    const scopeAsset = await loadModel("weapons-real/scoped-hunting.glb");
    const scopeNode = scopeAsset.scene.getObjectByName("Scope")!;
    this.weapon.setScopeTemplate(
      weaponInstance(
        { ...scopeAsset, scene: scopeNode.clone(true) as T.Group },
        0.26,
      ),
    );
    this.menuOperator = modelInstance(this.operator, 1.85, true);
    this.menuOperator.position.set(23.5, 0, 26);
    this.menuOperator.rotation.y = -0.6;
    this.scene.add(this.menuOperator);
    this.menuMixer = new T.AnimationMixer(this.menuOperator);
    const idle = this.operator.animations.find((a) => a.name === "Idle");
    if (idle) this.menuMixer.clipAction(idle).play();
    this.materialDepth(this.menuOperator, true);
    this.crate = await loadModel("weapons/crate-medium.glb");
    for (const [index, id] of [...WEAPON_IDS, "knife" as const].entries()) {
      const asset = await loadModel(
        WEAPONS[id].asset || "upgrade/firearms/" + WEAPONS[id].model + ".glb",
      );
      const model = weaponInstance(
        asset,
        WEAPONS[id].length || (WEAPONS[id].category === "Pistol" ? 0.27 : 0.9),
      );
      this.materialDepth(model, true);
      if (id === "knife") model.rotation.set(0, 0, Math.PI / 2);
      this.weapon.register(
        id,
        model,
        WEAPONS[id].length || (WEAPONS[id].category === "Pistol" ? 0.27 : 0.9),
      );
      progress(0.75 + (index / WEAPON_IDS.length) * 0.22, "LOADING ARSENAL");
    }
    const display = this.models.get("kestrel")!.clone(true);
    this.materialDepth(display, true);
    display.visible = true;

    display.position.set(0.14, 1.25, -0.3);
    this.menuOperator.add(display);
  }
  updateMenuPose() {
    if (this.menuOperator) this.poseOperator(this.menuOperator, 0, 0, 0);
  }
  private poseOperator(
    model: T.Group,
    pitch: number,
    crouch: number,
    death: number,
    aimYaw = 0,
  ) {
    const body = model.children[0];
    body.rotation.z = death * 1.48;
    if (death > 0.6) return;
    for (const side of ["Left", "Right"]) {
      const upper = model.getObjectByName("mixamorig" + side + "Arm") as T.Bone;
      const lower = model.getObjectByName(
        "mixamorig" + side + "ForeArm",
      ) as T.Bone;
      const hand = model.getObjectByName("mixamorig" + side + "Hand") as T.Bone;
      if (!upper || !lower || !hand) continue;
      const left = side === "Left",
        y = -crouch * 0.6;
      model.updateWorldMatrix(true, true);
      const aimRotation = new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        aimYaw,
      );
      aimBone(
        upper,
        lower,
        model.localToWorld(
          new T.Vector3(
            left ? -0.38 : 0.39,
            1.17 + y,
            left ? -0.18 : 0.02,
          ).applyQuaternion(aimRotation),
        ),
      );
      aimBone(
        lower,
        hand,
        model.localToWorld(
          new T.Vector3(
            left ? 0.1 : 0.14,
            1.18 + y + Math.sin(pitch) * (left ? 0.5 : 0.1),
            left ? -0.59 : -0.11,
          ).applyQuaternion(aimRotation),
        ),
      );
    }
  }
  private materialDepth(root: T.Object3D, depth: boolean) {
    root.traverse((o) => {
      if (o.userData.restPosition) {
        o.position.fromArray(o.userData.restPosition);
        o.visible = true;
      }
      if (o instanceof T.Mesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.userData.sharedAsset = false;
          if (m instanceof T.MeshStandardMaterial && /visor/i.test(m.name)) {
            m.roughness = 0.13;
            m.metalness = 0.55;
          }
          m.depthTest = depth;
          m.depthWrite = depth;
        }
        o.renderOrder = depth ? 0 : 100;
        o.castShadow = depth;
      }
    });
  }
  snapshot(s: Snapshot) {
    if (!this.operator) return;
    if (s.full) {
      const ids = new Set(s.entities.map((e) => e.id));
      for (const [id, a] of this.avatars)
        if (!ids.has(id)) {
          this.scene.remove(a.root);
          releaseInstance(a.root);
          a.mixer.stopAllAction();
          this.avatars.delete(id);
        }
    }
    for (const id of s.removed) {
      const a = this.avatars.get(id);
      if (a) {
        this.scene.remove(a.root);
        releaseInstance(a.root);
        this.avatars.delete(id);
      }
    }
    for (const e of s.entities) {
      let a = this.avatars.get(e.id);
      if (!a) {
        const root = modelInstance(this.operator, 1.8, true),
          mixer = new T.AnimationMixer(root),
          actions = new Map<string, T.AnimationAction>();
        for (const clip of this.operator.animations)
          actions.set(clip.name.split("|").pop()!, mixer.clipAction(clip));
        this.materialDepth(root, true);
        for (const action of actions.values()) {
          if (["Idle", "Walk", "Run"].includes(action.getClip().name))
            action
              .setEffectiveWeight(action.getClip().name === "Idle" ? 1 : 0)
              .play();
        }
        const teamColor = e.team === "blue" ? "#49c6f2" : "#f47764";
        const panel = new T.Mesh(
          new T.BoxGeometry(0.28, 0.1, 0.38),
          new T.MeshStandardMaterial({
            color: teamColor,
            emissive: teamColor,
            emissiveIntensity: 0.35,
            roughness: 0.5,
          }),
        );
        panel.position.set(0, 1.36, 0);
        root.add(panel);
        root.updateMatrixWorld(true);
        root.getObjectByName("mixamorigSpine2")?.attach(panel);
        if (e.team === s.you.team) {
          const marker = new T.Mesh(
            new T.OctahedronGeometry(0.085),
            new T.MeshBasicMaterial({ color: teamColor }),
          );
          marker.name = "ally-marker";
          marker.position.y = 2.18;
          root.add(marker);
        }
        root.position.set(e.x, e.y, e.z);
        this.scene.add(root);
        a = {
          root,
          mixer,
          actions,
          action: "",
          last: new T.Vector3(e.x, e.y, e.z),
          target: e,
          history: [],
          crouch: 0,
          death: 0,
          pose: cacheCrouchRig(root),
          bodyYaw: e.yaw,
          animationTime: 0,
        };
        this.avatars.set(e.id, a);
      }
      if (!a.target.alive && e.alive) {
        a.history = [];
        a.root.position.set(e.x, e.y, e.z);
        a.last.copy(a.root.position);
      }
      const marker = a.root.getObjectByName("ally-marker");
      if (marker) marker.visible = e.alive;
      a.target = e;
      a.history.push({ time: s.time, p: e });
      if (a.history.length > 12) a.history.shift();
      if (a.weaponId !== e.weapon || a.weaponAttachment !== e.attachment) {
        if (a.weapon) {
          a.root.remove(a.weapon);
          releaseInstance(a.weapon);
        }
        const g = this.models.get(e.weapon)?.clone(true);
        if (g) {
          g.visible = true;
          this.materialDepth(g, true);
          this.weapon.decorateWorldWeapon(g, e.weapon, e.attachment);

          g.position.set(0.14, 1.25, -0.3);
          a.root.add(g);
          a.weapon = g;
          a.weaponId = e.weapon;
          a.weaponAttachment = e.attachment;
        }
      }
    }
    this.loot(s.loot);
    const ids = new Set(s.projectiles.map((g) => g.id));
    for (const [id, m] of this.projectiles)
      if (!ids.has(id)) {
        this.scene.remove(m);
        releaseInstance(m);
        this.projectiles.delete(id);
      }
    for (const g of s.projectiles) {
      let mesh = this.projectiles.get(g.id);
      if (!mesh) {
        mesh = new T.Mesh(
          new T.IcosahedronGeometry(0.14, 1),
          new T.MeshStandardMaterial({ color: "#545a43", roughness: 0.7 }),
        );
        this.scene.add(mesh);
        this.projectiles.set(g.id, mesh);
      }
      const dy = g.y - mesh.position.y;
      if (
        mesh.userData.dy < -0.03 &&
        dy > 0.015 &&
        s.time - (mesh.userData.bounced || 0) > 0.2
      ) {
        this.playSound("bounce", g, 0.7);
        mesh.userData.bounced = s.time;
      }
      mesh.userData.dy = dy;
      mesh.position.set(g.x, g.y, g.z);
    }
    this.zoneWall.visible = this.zoneRing.visible = false;
    this.zoneWall.position.set(s.zone.x, 65, s.zone.z);
    this.zoneWall.scale.set(s.zone.radius, 1, s.zone.radius);
    this.zoneRing.position.set(s.zone.x, 1, s.zone.z);
    this.zoneRing.scale.setScalar(s.zone.radius);
  }
  private loot(list: Loot[]) {
    const ids = new Set(list.map((l) => l.id));
    for (const [id, m] of this.lootMeshes)
      if (!ids.has(id)) {
        this.scene.remove(m);
        releaseInstance(m);
        this.lootMeshes.delete(id);
      }
    for (const l of list) {
      let object = this.lootMeshes.get(l.id);
      if (!object) {
        const group = new T.Group();
        if (l.kind === "crate" && this.crate) {
          const crate = modelInstance(this.crate, 0.65);
          crate.traverse((o) => {
            if (o instanceof T.Mesh) {
              const repaint = (material: T.Material) => {
                const m = material.clone();
                m.userData.sharedAsset = false;
                if (m instanceof T.MeshStandardMaterial) {
                  m.map = null;
                  m.color.set("#68705b");
                  m.metalness = 0.35;
                  m.roughness = 0.75;
                }
                return m;
              };
              o.material = Array.isArray(o.material)
                ? o.material.map(repaint)
                : repaint(o.material);
            }
          });
          group.add(crate);
          group.userData.crate = true;
        } else if (
          l.kind === "weapon" &&
          l.weapon &&
          this.models.get(l.weapon)
        ) {
          const model = this.models.get(l.weapon)!.clone(true);
          model.visible = true;
          model.rotation.z = 0.1;
          this.materialDepth(model, true);
          group.add(model);
        } else {
          const color =
            l.kind === "plate"
              ? "#6f9ea5"
              : l.kind === "med"
                ? "#bdb699"
                : l.kind === "credits"
                  ? "#d8b66f"
                  : "#9ca377";
          group.add(
            new T.Mesh(
              new T.BoxGeometry(0.25, l.kind === "plate" ? 0.36 : 0.18, 0.18),
              new T.MeshStandardMaterial({
                color,
                metalness: 0.3,
                roughness: 0.6,
              }),
            ),
          );
        }
        const ring = new T.Mesh(
          new T.RingGeometry(0.35, 0.4, 24),
          new T.MeshBasicMaterial({
            color: ["#aab8a4", "#99bc86", "#77aeb9", "#af8fae", "#d6b56c"][
              l.rarity
            ],
            side: T.DoubleSide,
            transparent: true,
            opacity: 0.6,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.09;
        group.add(ring);
        object = group;
        this.scene.add(object);
        this.lootMeshes.set(l.id, object);
      }
      object.position.set(l.x, l.y + 0.13, l.z);
      if (l.opened && !object.userData.opened && this.crate) {
        object.userData.opened = true;
        const mixer = new T.AnimationMixer(object);
        const clip =
          this.crate.animations.find((a) => a.name === "open") ||
          this.crate.animations[0];
        if (clip) {
          const action = mixer.clipAction(clip);
          action.setLoop(T.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
          object.userData.mixer = mixer;
        }
      }
    }
  }
  event(e: GameEvent, enabled: boolean) {
    if (!enabled && e.type !== "smoke") return;
    if (e.type === "shot" && e.end) {
      const geom = new T.BufferGeometry().setFromPoints([
          new T.Vector3(e.x, e.y, e.z),
          new T.Vector3(e.end.x, e.end.y, e.end.z),
        ]),
        line = new T.Line(
          geom,
          new T.LineBasicMaterial({
            color: "#e4ca8c",
            transparent: true,
            opacity: 0.65,
          }),
        );
      this.scene.add(line);
      this.effects.push({ mesh: line, ttl: 0.065 });
      this.particles(e.end, 3, "#b0a38a", 0.06);
    }
    if (e.type === "explosion") this.particles(e, 24, "#dbaa67", 0.35);
    if (e.type === "smoke") {
      for (let i = 0; i < 18; i++) {
        const mesh = new T.Sprite(
          new T.SpriteMaterial({
            map: this.smokeTexture,
            alphaTest: 0.02,
            color: "#b0b0a6",
            transparent: true,
            opacity: 0.36,
            depthWrite: false,
          }),
        );
        mesh.scale.setScalar(6 + Math.random() * 3);
        mesh.position.set(
          e.x + (Math.random() - 0.5) * 6,
          e.y + 1 + Math.random() * 3,
          e.z + (Math.random() - 0.5) * 6,
        );
        this.scene.add(mesh);
        this.effects.push({ mesh, ttl: 18, smoke: true });
      }
    }
  }
  particles(p: Vec3, count: number, color: string, size: number) {
    for (let i = 0; i < count; i++) {
      const mesh = new T.Sprite(
        new T.SpriteMaterial({
          map: this.impactTexture,
          alphaTest: 0.02,
          color,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      mesh.scale.setScalar(size * 3);
      mesh.position.set(p.x, p.y, p.z);
      this.scene.add(mesh);
      this.effects.push({
        mesh,
        ttl: 0.3 + Math.random() * 0.5,
        velocity: new T.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 5,
          (Math.random() - 0.5) * 5,
        ),
      });
    }
    while (this.effects.length > 160) this.removeEffect(this.effects.shift()!);
  }
  shell(position: T.Vector3, yaw: number) {
    const mesh = new T.Mesh(
      new T.CylinderGeometry(0.012, 0.012, 0.055, 5),
      new T.MeshStandardMaterial({
        color: "#b8a060",
        metalness: 0.7,
        roughness: 0.3,
      }),
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.effects.push({
      mesh,
      ttl: 0.6,
      velocity: new T.Vector3(Math.cos(yaw) * 2, 1.5, -Math.sin(yaw) * 2),
    });
  }
  private removeEffect(e: Effect) {
    this.scene.remove(e.mesh);
    if (e.mesh instanceof T.Sprite) e.mesh.material.dispose();
    if (e.mesh instanceof T.Mesh || e.mesh instanceof T.Line) {
      e.mesh.geometry.dispose();
      for (const m of Array.isArray(e.mesh.material)
        ? e.mesh.material
        : [e.mesh.material])
        m.dispose();
    }
  }
  update(dt: number, time: number, distance: number) {
    for (const avatar of this.avatars.values()) {
      const hist = avatar.history;
      let a = hist[0],
        b = hist[hist.length - 1];
      for (let i = 1; i < hist.length; i++)
        if (hist[i].time >= time) {
          a = hist[i - 1];
          b = hist[i];
          break;
        }
      if (a && b) {
        const f = T.MathUtils.clamp(
          (time - a.time) / Math.max(0.001, b.time - a.time),
          0,
          1,
        );
        avatar.root.position.set(
          T.MathUtils.lerp(a.p.x, b.p.x, f),
          T.MathUtils.lerp(a.p.y, b.p.y, f),
          T.MathUtils.lerp(a.p.z, b.p.z, f),
        );
      }
      const e = avatar.target;
      const yawA = a?.p.yaw ?? e.yaw,
        yawB = b?.p.yaw ?? e.yaw;
      const turn = Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA));
      const blend =
        a && b
          ? T.MathUtils.clamp(
              (time - a.time) / Math.max(0.001, b.time - a.time),
              0,
              1,
            )
          : 1;
      const aimYaw = yawA + turn * blend;
      const vx = a && b ? T.MathUtils.lerp(a.p.vx, b.p.vx, blend) : e.vx;
      const vz = a && b ? T.MathUtils.lerp(a.p.vz, b.p.vz, blend) : e.vz;
      const stance = a && b ? (blend < 0.5 ? a.p : b.p) : e;
      const facing = locomotionFacing(vx, vz, aimYaw);
      const speed = Math.hypot(vx, vz);
      const bodyTarget = aimYaw + (speed > 0.15 ? facing.turn : 0);
      const bodyDelta = Math.atan2(
        Math.sin(bodyTarget - avatar.bodyYaw),
        Math.cos(bodyTarget - avatar.bodyYaw),
      );
      avatar.bodyYaw += bodyDelta * (1 - Math.exp(-10 * dt));
      avatar.root.rotation.y = avatar.bodyYaw;
      avatar.root.visible =
        e.air !== "plane" &&
        avatar.root.position.distanceTo(this.camera.position) < distance;
      const moving = e.alive && stance.grounded;
      const run =
        moving && !stance.crouched
          ? T.MathUtils.smoothstep(speed, 1.4, 4.5)
          : 0;
      const walk = moving
        ? T.MathUtils.smoothstep(speed, 0.15, 1.4) * (1 - run)
        : 0;
      for (const [name, weight] of [
        ["Idle", 1 - run - walk],
        ["Walk", walk],
        ["Run", run],
      ] as const) {
        const action = avatar.actions.get(name);
        if (!action) continue;
        action.setEffectiveWeight(
          T.MathUtils.damp(action.getEffectiveWeight(), weight, 12, dt),
        );
        action.setEffectiveTimeScale(
          name === "Run"
            ? Math.max(0.65, speed / 4.8) * facing.playback
            : name === "Walk"
              ? Math.max(0.5, speed / 1.7) * facing.playback
              : 1,
        );
      }
      avatar.animationTime += dt;
      const near =
        avatar.root.position.distanceToSquared(this.camera.position) < 6400;
      if (!avatar.root.visible || (!near && avatar.animationTime < 1 / 30))
        continue;
      avatar.mixer.update(avatar.animationTime);
      avatar.animationTime = 0;
      avatar.crouch = T.MathUtils.damp(
        avatar.crouch,
        e.crouched ? 1 : 0,
        12,
        dt,
      );
      avatar.death = T.MathUtils.damp(avatar.death, e.alive ? 0 : 1, 7, dt);
      const eye =
        a && b
          ? T.MathUtils.lerp(a.p.eyeHeight, b.p.eyeHeight, blend)
          : e.eyeHeight;
      const crouch = T.MathUtils.clamp((1.64 - eye) / 0.61, 0, 1);
      if (e.alive) applyCrouchPose(avatar.pose, crouch, avatar.root.position.y);
      else {
        avatar.pose.body.position.y = avatar.pose.baseY + 0.08;
        avatar.pose.body.position.z = avatar.pose.baseZ;
      }
      const aimDelta = Math.atan2(
        Math.sin(aimYaw - avatar.bodyYaw),
        Math.cos(aimYaw - avatar.bodyYaw),
      );
      const chest = avatar.root.getObjectByName("mixamorigSpine2");
      if (chest) chest.rotation.y += aimDelta * 0.65;
      this.poseOperator(avatar.root, e.pitch, crouch, avatar.death, aimDelta);
      if (avatar.weapon) {
        avatar.weapon.rotation.x = -e.pitch;
        avatar.weapon.position.y = 1.25 - crouch * 0.6;
        avatar.weapon.rotation.y = aimDelta;
        avatar.weapon.visible = e.alive;
      }
      avatar.last.copy(avatar.root.position);
    }
    for (const m of this.lootMeshes.values()) m.userData.mixer?.update(dt);
    for (const e of [...this.effects]) {
      e.mesh.userData.life ??= e.ttl;
      e.mesh.userData.alpha ??=
        e.mesh instanceof T.Sprite ? e.mesh.material.opacity : 1;
      e.ttl -= dt;
      if (e.mesh instanceof T.Sprite) {
        const age = e.mesh.userData.life - e.ttl;
        e.mesh.material.opacity =
          e.mesh.userData.alpha *
          Math.min(1, age / (e.smoke ? 0.5 : 0.03)) *
          Math.min(1, e.ttl / (e.smoke ? 3 : 0.2));
      }
      if (e.ttl <= 0) {
        this.removeEffect(e);
        this.effects.splice(this.effects.indexOf(e), 1);
      } else if (e.velocity) {
        e.velocity.y -= dt * 9;
        e.mesh.position.addScaledVector(e.velocity, dt);
        e.mesh.rotation.x += dt * 4;
      } else if (e.smoke) e.mesh.scale.multiplyScalar(1 + dt * 0.015);
    }
  }
  clear() {
    for (const a of this.avatars.values()) {
      this.scene.remove(a.root);
      releaseInstance(a.root);
      a.mixer.stopAllAction();
    }
    this.avatars.clear();
    this.weapon.reset();
    this.flight.reset();
    for (const m of this.lootMeshes.values()) {
      this.scene.remove(m);
      releaseInstance(m);
    }
    this.lootMeshes.clear();
    for (const m of this.projectiles.values()) {
      this.scene.remove(m);
      releaseInstance(m);
    }
    this.projectiles.clear();
    for (const e of this.effects) this.removeEffect(e);
    this.effects = [];
    this.zoneWall.visible =
      this.zoneRing.visible =
      this.parachute.visible =
        false;
  }
  dispose() {
    this.clear();
    this.weapon.dispose();
    this.smokeTexture.dispose();
    this.impactTexture.dispose();
    releaseInstance(this.flight.helicopter);
    releaseInstance(this.flight.canopy);
    if (this.flight.operator) releaseInstance(this.flight.operator);
  }
}

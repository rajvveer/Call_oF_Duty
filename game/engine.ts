import {
  scopeLevels,
  scopeFov,
  scopeSway,
  cycleWeaponSlot,
} from "../packages/game-shared/combat";
import { gameServerUrl } from "./server-url";
import * as T from "three";
import { WebGPURenderer } from "three/webgpu";
import { createWorld } from "./world";
import { GameAudio } from "./audio";
import { GameGraphics } from "./graphics";
import { defaults, type Settings } from "./settings";
import { Presentation } from "./presentation";
import {
  ATTACHMENTS,
  arenaCenter,
  arenaFor,
  TICK,
  WEAPONS,
  weaponKick,
  weaponInaccuracy,
  clamp,
} from "../packages/game-shared/data";
import { nearbyColliders } from "../packages/game-shared/map";
import { stepSpring, nextRenderDeadline, type Spring } from "./weapon-motion";
import { movePlayer } from "../packages/game-shared/movement";
import {
  type ClientMessage,
  type GameEvent,
  type Input,
  type Player,
  type Snapshot,
} from "../packages/game-shared/protocol";
export type GameUI = {
  killFeed?: GameEvent[];
  scope: { zoom: number; focus: number; steady: boolean; label: string } | null;
  renderScale: number;
  cpuMs: number;
  pointerError?: string;
  thirdPerson?: boolean;
  loading: boolean;
  progress: number;
  stage: string;
  connected: boolean;
  reconnecting: boolean;
  playing: boolean;
  paused: boolean;
  map: boolean;
  inventory: boolean;
  loadout: boolean;
  terminal: boolean;
  error: string;
  notice: string;
  hit: number;
  headshot: boolean;
  damage: number;
  damageAngle: number;
  flash: number;
  ads: boolean;
  prompt: string;
  grenade: "frag" | "smoke" | "flash";
  snapshot: Snapshot | null;
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  backend: string;
  ping: number;
  networkKB: number;
  rendered: number;
  debug: boolean;
  recoil: number;
};
export const initialUI = (): GameUI => ({
  scope: null,
  renderScale: 1,
  cpuMs: 0,
  loading: true,
  progress: 0.03,
  stage: "INITIALIZING ENGINE",
  connected: false,
  reconnecting: false,
  playing: false,
  paused: false,
  map: false,
  inventory: false,
  loadout: false,
  terminal: false,
  error: "",
  notice: "",
  hit: 0,
  headshot: false,
  damage: 0,
  damageAngle: 0,
  flash: 0,
  ads: false,
  prompt: "",
  grenade: "frag",
  snapshot: null,
  fps: 0,
  frameMs: 0,
  calls: 0,
  triangles: 0,
  backend: "INITIALIZING",
  ping: 0,
  networkKB: 0,
  rendered: 0,
  debug: false,
  recoil: 0,
});
export class Engine {
  renderer!: WebGPURenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(85, innerWidth / innerHeight, 0.06, 1700);
  world!: ReturnType<typeof createWorld>;
  private graphics!: GameGraphics;
  private ejection = new T.Vector3();
  private audioDirection = new T.Vector3();
  private emptyAt = 0;
  audio: GameAudio;
  settings: Settings;
  ui = initialUI();
  visual: Presentation;
  private socket: WebSocket | null = null;
  private generation = 0;
  private resumeToken = "";
  private serverUrl = "";
  private roomCode = "";
  private reconnectUntil = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingSnapshot = false;
  private id = "";
  private local: Player | null = null;
  private seq = 0;
  private pending: Input[] = [];
  private seenEvents = 0;
  private keys = new Set<string>();
  private locked = false;
  private mouseFire = false;
  private clickFire = false;
  private ads = false;
  private crouch = false;
  private yaw = 0;
  private pitch = 0;
  private recoil = 0;
  private nextShot = 0;
  private shotIndex = 0;
  private shotTime = 0;
  private renderPlayer: Player | null = null;
  private lastInput: Input | null = null;
  private oldHealth = 250;
  private accumulator = 0;
  private lastTime = 0;
  private renderedTime = 0;
  private renderDeadline = 0;
  private uiTime = 0;
  private stepTime = 0;
  private receivedAt = 0;
  private noticeUntil = 0;
  private menuTime = 0;
  private bytes = 0;
  private bandwidthAt = 0;
  private pingAt = 0;
  private disposed = false;
  private cleanup: (() => void)[] = [];
  private cameraOffset = new T.Vector3();
  private foot = 0;
  private zoomIndex = 0;
  private scopeBlend = 0;
  private weaponKey = "";
  private renderScale = 1;
  private scaleAt = 0;
  private scaleRecoveryAt = 0;
  private graphicsKey = "";
  private landing: Spring = { position: 0, velocity: 0 };
  private stepOffset = 0;
  private fpsFrames = 0;
  private fpsAt = 0;
  private fallback = false;
  private wasFire = false;
  private wheelAt = -1;
  private airJump = false;
  private knownLoot = new Map<string, Snapshot["loot"][number]>();
  constructor(
    private mount: HTMLElement,
    settings: Settings,
    private update: (ui: GameUI) => void,
  ) {
    this.settings = { ...defaults, ...settings };
    this.audio = new GameAudio(this.settings);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.visual = new Presentation(this.scene, this.camera);
    this.visual.weapon.setSound((cue) => this.audio.sound(cue));
    this.visual.playSound = (kind, position, weight) =>
      this.audio.sound(kind, position, weight);
  }
  async init() {
    try {
      this.renderer = new WebGPURenderer({
        antialias: true,
        forceWebGL: this.settings.backend === "webgl",
        powerPreference: "high-performance",
      });
      await this.renderer.init();
    } catch (e) {
      console.warn("WebGPU unavailable; trying WebGL2", e);
      this.graphics?.dispose();
      this.renderer?.dispose();
      this.renderer = new WebGPURenderer({ antialias: true, forceWebGL: true });
      await this.renderer.init();
    }
    if (this.disposed) return;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.mount.appendChild(this.renderer.domElement);
    this.ui.backend = (
      this.renderer.backend as unknown as { isWebGPUBackend?: boolean }
    ).isWebGPUBackend
      ? "WEBGPU"
      : "WEBGL2";
    this.ui.progress = 0.1;
    this.ui.stage = "LOADING MERIDIAN";
    this.emit();
    this.world = createWorld(this.scene, (progress, stage) => {
      this.ui.progress = 0.1 + Math.min(1, progress) * 0.5;
      this.ui.stage = stage;
      this.emit();
    });
    this.graphics = new GameGraphics(
      this.renderer,
      this.scene,
      this.camera,
      this.visual.weapon.scene,
      this.visual.weapon.camera,
    );
    const environmentReady = this.graphics
      .loadEnvironment()
      .then(() => {
        this.world.sky.visible = false;
        this.world.clouds.forEach((c) => (c.visible = false));
        this.visual.weapon.scene.environment = this.scene.environment;
        this.visual.weapon.scene.environmentIntensity = 0.85;
      })
      .catch((e) => console.warn("HDR environment unavailable", e));
    void this.audio.prepare();
    this.bind();
    this.applySettings(this.settings);
    this.renderer.setAnimationLoop((t) => this.frame(t / 1000));
    await Promise.all([this.world.ready, environmentReady]);
    if (this.disposed) return;
    this.ui.stage = "LOADING OPERATORS";
    this.ui.progress = 0.68;
    this.emit();
    await this.visual.load((n, s) => {
      this.ui.progress = n;
      this.ui.stage = s;
      this.emit();
    });
    if (this.disposed) return;
    this.ui.loading = false;
    this.ui.progress = 1;
    this.ui.stage = "READY";
    this.emit();
  }
  private emit() {
    this.update({ ...this.ui });
  }
  private get controlsActive() {
    return !!(
      (this.locked || this.fallback) &&
      !this.ui.paused &&
      !this.ui.map &&
      !this.ui.inventory &&
      !this.ui.loadout &&
      !this.ui.terminal &&
      this.local?.alive
    );
  }
  private get aiming() {
    return (
      this.controlsActive &&
      this.ads &&
      this.local!.weapons[this.local!.selected].id !== "knife" &&
      !this.local!.reloadAt &&
      !this.local!.plateAt &&
      !this.local!.healAt
    );
  }
  private clearInput() {
    this.keys.clear();
    this.mouseFire =
      this.clickFire =
      this.airJump =
      this.wasFire =
      this.ads =
        false;
  }
  private listen<K extends keyof WindowEventMap>(
    type: K,
    fn: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) {
    window.addEventListener(type, fn, options);
    this.cleanup.push(() => window.removeEventListener(type, fn, options));
  }
  private bind() {
    this.listen("resize", () => this.resize());
    this.listen("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (["Space", "Tab", "KeyM", "KeyF", "KeyG"].includes(e.code))
        e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "F3") {
        e.preventDefault();
        this.ui.debug = !this.ui.debug;
        this.emit();
      }
      if (!this.ui.playing) return;
      if (["KeyB", "KeyM", "Tab"].includes(e.code)) {
        const overlay =
          e.code === "KeyB"
            ? "loadout"
            : e.code === "KeyM"
              ? "map"
              : "inventory";
        const opening = !this.ui[overlay];
        this.ui.map =
          this.ui.inventory =
          this.ui.loadout =
          this.ui.terminal =
            false;
        if (!opening) this.closeOverlay();
        else {
          this.clearInput();
          this.ui[overlay] = true;
          this.ui.paused = false;
          document.exitPointerLock();
          this.emit();
        }
        return;
      }
      if (
        e.code === "Escape" &&
        this.fallback &&
        !this.ui.map &&
        !this.ui.inventory &&
        !this.ui.loadout &&
        !this.ui.terminal
      ) {
        this.ui.paused = !this.ui.paused;
        this.clearInput();
        this.emit();
        return;
      }
      if (
        e.code === "Escape" &&
        (this.ui.map ||
          this.ui.inventory ||
          this.ui.terminal ||
          this.ui.loadout)
      ) {
        this.closeOverlay();
        return;
      }
      if (
        (!this.locked && !this.fallback) ||
        this.ui.paused ||
        this.ui.map ||
        this.ui.inventory ||
        this.ui.loadout ||
        this.ui.terminal
      )
        return;
      if (e.code === "KeyZ") {
        this.zoomIndex++;
        return;
      }
      if (e.code === "KeyI" && this.local?.alive) {
        this.visual.weapon.inspect(performance.now() / 1000);
        return;
      }
      if (e.code === "KeyR") {
        this.action("reload");
      }
      if (e.code === "KeyH") this.action("plate");
      if (e.code === "KeyV") this.action("heal");
      if (e.code === "Digit1") this.action("swap", "0");
      if (e.code === "Digit2") this.action("swap", "1");
      if (e.code === "Digit3") this.action("swap", "2");
      if (e.code === "KeyG") {
        this.action("throw", this.ui.grenade);
        this.audio.sound("reload");
      }
      if (e.code === "KeyQ") {
        const all = ["frag", "smoke", "flash"] as const;
        this.ui.grenade = all[(all.indexOf(this.ui.grenade) + 1) % 3];
        this.emit();
      }
      if (e.code === "Space" && this.local?.air !== "ground") {
        if (this.local?.air === "chute") this.action("chute");
        else this.airJump = true;
      }
      if (
        (e.code === "KeyC" || e.code === "ControlLeft") &&
        this.settings.crouchToggle
      )
        this.crouch = !this.crouch;
    });
    this.listen("keyup", (e) => this.keys.delete(e.code));
    this.listen(
      "wheel",
      (e) => {
        if (!this.controlsActive || e.ctrlKey || !e.deltaY) return;
        e.preventDefault();
        const now = performance.now() / 1000;
        if (now - this.wheelAt < 0.14) return;
        this.wheelAt = now;
        this.action(
          "swap",
          String(cycleWeaponSlot(this.local!.selected, e.deltaY)),
        );
      },
      { passive: false },
    );
    this.listen("blur", () => this.clearInput());
    this.listen("mousemove", (e) => {
      if (
        !this.controlsActive ||
        (!this.locked && !(this.fallback && e.buttons & 2))
      )
        return;
      const slot = this.local?.weapons[this.local.selected];
      const levels = slot ? scopeLevels(WEAPONS[slot.id], slot.attachment) : [];
      const aiming = this.aiming;
      const zoom =
        aiming && levels.length ? levels[this.zoomIndex % levels.length] : 1;
      const sens =
        0.00165 *
        this.settings.sensitivity *
        (aiming ? this.settings.adsSensitivity / zoom : 1);
      this.yaw -= e.movementX * sens;
      this.pitch = clamp(
        this.pitch - e.movementY * sens * (this.settings.invertY ? -1 : 1),
        -1.54,
        1.54,
      );
    });
    this.listen("mousedown", (e) => {
      if (
        (!this.locked && !this.fallback) ||
        this.ui.paused ||
        this.ui.map ||
        this.ui.inventory ||
        this.ui.loadout ||
        this.ui.terminal
      )
        return;
      if (e.button === 0) {
        this.mouseFire = true;
        this.clickFire = true;
      }
      if (e.button === 2) this.ads = true;
    });
    this.listen("mouseup", (e) => {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2) this.ads = false;
    });
    this.listen("contextmenu", (e) => {
      if (this.ui.playing) e.preventDefault();
    });
    const lock = () => {
      this.locked = document.pointerLockElement === this.renderer.domElement;
      this.ui.paused =
        this.ui.playing &&
        !this.locked &&
        !this.fallback &&
        !this.ui.map &&
        !this.ui.inventory &&
        !this.ui.loadout &&
        !this.ui.terminal &&
        !!this.local?.alive;
      this.clearInput();
      this.emit();
    };
    document.addEventListener("pointerlockchange", lock);
    this.cleanup.push(() =>
      document.removeEventListener("pointerlockchange", lock),
    );
    const error = () => {
      this.ui.paused = true;
      this.ui.pointerError =
        "Mouse capture was unavailable. You can use drag aim.";
      this.notice(this.ui.pointerError);
      this.emit();
    };
    document.addEventListener("pointerlockerror", error);
    this.cleanup.push(() =>
      document.removeEventListener("pointerlockerror", error),
    );
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.ui.error =
        "Graphics context lost. Reload the game to restore the renderer.";
      this.emit();
    });
  }
  applySettings(s: Settings) {
    if (
      this.ui.playing &&
      (s.loadout !== this.settings.loadout ||
        s.attachment !== this.settings.attachment ||
        s.perk !== this.settings.perk)
    )
      this.action("loadout", s.loadout + ":" + s.attachment + ":" + s.perk);
    this.settings = s;
    this.audio.apply(s);
    if (!this.renderer) return;
    this.renderer.shadowMap.enabled = s.shadows;
    const graphicsKey = s.preset + ":" + s.effects;
    if (this.graphics && this.graphicsKey !== graphicsKey) {
      this.graphics.apply(s);
      this.graphicsKey = graphicsKey;
    }
    if (!s.adaptiveResolution) this.renderScale = 1;
    if (this.world) {
      this.world.sun.castShadow = s.shadows;
      const resolution = s.preset === "low" ? 1024 : 2048;
      if (this.world.sun.shadow.mapSize.x !== resolution) {
        this.world.sun.shadow.map?.dispose();
        this.world.sun.shadow.map = null;
        this.world.sun.shadow.mapSize.set(resolution, resolution);
      }
      this.world.vegetation.visible = s.vegetation;
    }
    this.resize();
  }
  private resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.visual.weapon.camera.aspect = this.camera.aspect;
    this.visual.weapon.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(1.25, devicePixelRatio * this.settings.scale) * this.renderScale,
    );
    this.renderer.setSize(innerWidth, innerHeight);
  }
  async connect(room = "") {
    this.audio.resume();
    if (this.ui.loading) return;
    this.leave(false);
    this.ui.error = "";
    this.ui.stage = "CONNECTING TO OPERATION";
    this.ui.notice = "";
    this.ui.playing = true;
    this.emit();
    const generation = ++this.generation;
    let endpoint: string;
    try {
      endpoint = await gameServerUrl(this.settings.server);
    } catch (error) {
      if (generation === this.generation) this.fail((error as Error).message);
      return;
    }
    if (generation !== this.generation || this.disposed) return;
    this.serverUrl = endpoint;
    this.roomCode = room;
    this.openSocket(endpoint, room, undefined, generation);
  }
  private openSocket(
    endpoint: string,
    room: string,
    token?: string,
    generation = ++this.generation,
  ) {
    try {
      const url = new URL(endpoint);
      if (!["ws:", "wss:"].includes(url.protocol))
        throw Error("Use a ws:// or wss:// game server address.");
      this.socket = new WebSocket(url);
    } catch (e) {
      this.fail((e as Error).message);
      return;
    }
    this.socket.onopen = () => {
      if (generation !== this.generation) return;
      this.socket!.send(
        JSON.stringify({
          type: "hello",
          ...(token ? { resumeToken: token } : {}),
          map: this.settings.mapId,
          perk: this.settings.perk,
          name: this.settings.name,
          room,
          loadout: this.settings.loadout,
          attachment: this.settings.attachment,
          operator: this.settings.operator,
          difficulty: this.settings.difficulty,
        }),
      );
    };
    this.socket.onmessage = (event) => {
      if (generation !== this.generation) return;
      this.bytes += event.data.length;
      let m;
      try {
        m = JSON.parse(event.data);
      } catch {
        this.fail("The server sent an unreadable response.");
        return;
      }
      if (m.type === "welcome") {
        this.id = m.id;
        this.resumeToken = m.resumeToken || "";
        this.roomCode = m.room;
        this.seq = m.lastSeq || 0;
        this.seenEvents = m.eventSeq || 0;
        this.pending = [];
        this.cameraOffset.set(0, 0, 0);
        this.awaitingSnapshot = true;
        this.reconnectUntil = 0;
        this.reconnectAttempt = 0;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.ui.reconnecting = false;
        this.ui.error = "";
        this.ui.connected = true;
        this.ui.stage = "WARMUP";
        this.ui.paused = true;
        this.notice("OPERATION " + m.room + " · SHARE THIS ROOM CODE");
      }
      if (m.type === "snapshot") this.receive(m as Snapshot);
      if (m.type === "error") {
        if (m.code === "RESUME_IN_USE") this.ui.reconnecting = true;
        else {
          if (token) {
            this.resumeToken = "";
            this.reconnectUntil = 0;
            this.ui.reconnecting = false;
          }
          this.fail(m.message);
        }
      }
      if (m.type === "pong")
        this.ui.ping = Math.round(performance.now() - m.time);
    };
    this.socket.onerror = () => {
      if (generation === this.generation && !token)
        this.fail(
          "Unable to reach the game server. Check the server address in Settings or retry.",
        );
    };
    this.socket.onclose = (e) => {
      console.info("Game connection closed", e.code, e.reason);
      if (generation !== this.generation || !this.ui.playing) return;
      this.ui.connected = false;
      this.ui.paused = true;
      this.clearInput();
      if (e.code !== 1000 && e.code !== 1008 && this.resumeToken) {
        this.reconnectUntil ||= performance.now() + 10000;
        if (performance.now() < this.reconnectUntil) {
          this.ui.reconnecting = true;
          this.ui.error = "";
          const delay = Math.min(
            2000,
            500 * Math.pow(2, this.reconnectAttempt++),
          );
          this.reconnectTimer = setTimeout(() => {
            if (!this.disposed && this.ui.playing)
              this.openSocket(this.serverUrl, this.roomCode, this.resumeToken);
          }, delay);
          this.emit();
          return;
        }
      }
      this.ui.reconnecting = false;
      this.ui.error ||= "Connection ended. Join a new match to continue.";
      document.exitPointerLock();
      this.emit();
    };
    setTimeout(() => {
      if (
        generation === this.generation &&
        !this.ui.connected &&
        this.ui.playing
      ) {
        this.socket?.close();
        this.fail("Connection timed out. Verify the game service is running.");
      }
    }, 12000);
  }
  private fail(message: string) {
    this.clearInput();
    this.ui.error = message;
    this.ui.paused = true;
    this.ui.loading = false;
    this.emit();
  }
  fallbackResume() {
    this.clearInput();
    this.fallback = true;
    this.ui.paused = false;
    this.ui.map = false;
    this.ui.inventory = false;
    this.ui.loadout = false;
    this.ui.terminal = false;
    this.ui.error = "";
    this.audio.resume();
    this.notice("DRAG AIM · HOLD RIGHT MOUSE TO LOOK · ESC TO PAUSE");
    this.emit();
  }
  resume() {
    this.clearInput();
    if (this.fallback) {
      this.fallbackResume();
      return;
    }
    this.audio.resume();
    this.ui.error = "";
    this.ui.paused = false;
    this.ui.map = false;
    this.ui.inventory = false;
    this.ui.loadout = false;
    this.ui.terminal = false;
    try {
      const result = this.renderer.domElement.requestPointerLock();
      if (result && typeof result.catch === "function")
        void result.catch((e: Error) => {
          this.ui.paused = true;
          this.ui.pointerError = e.message;
          console.info("Pointer capture:", e.message);
          this.emit();
        });
    } catch {
      this.ui.paused = true;
    }
    this.emit();
  }
  closeOverlay() {
    this.ui.map = false;
    this.ui.inventory = false;
    this.ui.loadout = false;
    this.ui.terminal = false;
    this.resume();
  }
  action(
    action: Extract<ClientMessage, { type: "action" }>["action"],
    value?: string,
    x?: number,
    z?: number,
  ) {
    if (
      action === "swap" &&
      this.local &&
      (value === "0" || value === "1" || value === "2") &&
      this.local.selected === Number(value)
    )
      return;
    if (action === "swap") {
      this.nextShot = Math.max(this.nextShot, performance.now() / 1000 + 0.2);
      this.shotIndex = this.shotTime = 0;
      this.ads = false;
      this.zoomIndex = 0;
    }
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "action", action, value, x, z }));
  }
  ping(x: number, z: number) {
    this.action("ping", undefined, x, z);
  }
  private notice(text: string) {
    this.ui.notice = text;
    this.noticeUntil = performance.now() / 1000 + 3.5;
  }
  private receive(s: Snapshot) {
    if (!s.you || !Array.isArray(s.entities)) return;
    const oldAuth = this.ui.snapshot?.you,
      oldRound = this.ui.snapshot?.round;
    const oldPhase = this.ui.snapshot?.phase,
      previous = this.local;
    this.ui.snapshot = s;
    this.ui.connected = true;
    this.receivedAt = performance.now() / 1000;
    this.awaitingSnapshot = false;
    if (
      previous &&
      oldPhase === s.phase &&
      s.phase === "active" &&
      s.you.hp + s.you.armor < this.oldHealth
    ) {
      this.ui.damage = 1;
      this.audio.sound("hit");
      this.ui.damageAngle = 0;
    }
    if (oldAuth) {
      if (oldAuth.air === "fall" && s.you.air === "chute")
        this.audio.sound("parachute");
      if (oldAuth.air === "chute" && s.you.air === "fall")
        this.audio.sound("cut");
      if (!oldAuth.grounded && s.you.grounded)
        this.audio.sound(
          "land",
          undefined,
          Math.min(1.6, 0.6 + Math.abs(oldAuth.vy) / 10),
        );
      if (oldAuth.grounded && !s.you.grounded && s.you.air === "ground")
        this.audio.sound("jump");
      if (oldAuth.armor > 0 && s.you.armor === 0)
        this.audio.sound("armor-break");
      if (!oldAuth.plateAt && s.you.plateAt) this.audio.sound("plate");
      if (oldAuth.plateAt && !s.you.plateAt && s.you.armor > oldAuth.armor)
        this.audio.sound("mag-in");
      if (!oldAuth.healAt && s.you.healAt) this.audio.sound("heal");
      if (
        s.you.grenades.frag < oldAuth.grenades.frag ||
        s.you.grenades.smoke < oldAuth.grenades.smoke ||
        s.you.grenades.flash < oldAuth.grenades.flash
      )
        this.audio.sound("throw");
      if (oldAuth.alive && !s.you.alive) this.audio.sound("defeat");
    }
    this.oldHealth = s.you.hp + s.you.armor;
    if (s.you.lastSeq > this.seq) this.seq = s.you.lastSeq;
    const respawned =
      !oldAuth || (!oldAuth.alive && s.you.alive) || oldPhase !== s.phase;
    if (oldRound !== s.round) this.ui.killFeed = [];
    if (respawned) {
      this.visual.weapon.reset();
      this.pending = [];
      this.yaw = s.you.yaw;
      this.pitch = s.you.pitch;
      this.cameraOffset.set(0, 0, 0);
      this.landing.position =
        this.landing.velocity =
        this.stepOffset =
        this.recoil =
          0;
      this.zoomIndex = 0;
      this.scopeBlend = 0;
      this.weaponKey = "";
      this.mouseFire =
        this.clickFire =
        this.airJump =
        this.wasFire =
        this.ads =
        this.crouch =
          false;
      this.nextShot = 0;
      if (!this.locked && !this.fallback) this.ui.paused = true;
    }
    if (!s.you.alive) this.pending = [];
    this.pending = this.pending.filter((i) => i.seq > s.you.lastSeq);
    this.local = structuredClone(s.you);
    for (const i of this.pending) movePlayer(this.local, i);
    if (
      !respawned &&
      previous &&
      previous.air === this.local.air &&
      oldPhase === s.phase
    ) {
      const error = new T.Vector3(
        previous.x - this.local.x,
        previous.y - this.local.y,
        previous.z - this.local.z,
      );
      if (error.length() < 1) this.cameraOffset.add(error).clampLength(0, 0.18);
      else this.cameraOffset.set(0, 0, 0);
    }
    if (oldPhase !== s.phase) {
      this.ui.damage = 0;
      this.pending = [];
      this.cameraOffset.set(0, 0, 0);
      if (s.phase === "insertion") {
        this.notice("INSERTION · SPACE TO JUMP");
        this.yaw = -0.7;
        this.pitch = -0.2;
      }
      if (s.phase === "active") {
        this.notice(
          "TEAM DEATHMATCH · FIRST TO 50 · " +
            s.you.team.toUpperCase() +
            " TEAM",
        );
        this.audio.sound("zone");
      }
      if (s.phase === "finished") {
        document.exitPointerLock();
        if (s.winnerTeam === s.you.team) this.audio.sound("victory");
      }
    }
    if (!s.you.alive && s.phase !== "finished") this.ui.paused = false;
    this.ui.flash = clamp((s.you.flashUntil - s.time) / 2, 0, 1);
    if (s.full) this.knownLoot.clear();
    for (const id of s.removedLoot || []) this.knownLoot.delete(id);
    for (const l of s.loot) this.knownLoot.set(l.id, l);
    const merged = { ...s, loot: [...this.knownLoot.values()] };
    this.visual.snapshot(merged);
    this.ui.snapshot = {
      ...merged,
      entities: [...this.visual.avatars.values()].map((a) => a.target),
    };
    for (const e of s.events) {
      if (e.id <= this.seenEvents) continue;
      this.event(e);
      this.seenEvents = Math.max(this.seenEvents, e.id);
    }
    this.emit();
  }
  private event(e: GameEvent) {
    this.visual.event(e, this.settings.effects);
    if (e.type === "shot" && e.from !== this.id)
      this.audio.shot(
        (e.text && Object.hasOwn(WEAPONS, e.text)
          ? e.text
          : "kestrel") as keyof typeof WEAPONS,
        e,
      );
    if (e.type === "hit") {
      if (e.from === this.id) {
        this.ui.hit = 1;
        this.ui.headshot = !!e.head;
        this.audio.sound("hit");
      }
      if (e.to === this.id && e.from) {
        const attacker = this.visual.avatars.get(e.from);
        if (attacker)
          this.ui.damageAngle =
            Math.atan2(attacker.target.x - e.x, attacker.target.z - e.z) -
            this.yaw;
      }
    }
    if (e.type === "kill") {
      this.ui.killFeed = [...(this.ui.killFeed || []), e].slice(-4);
      if (e.from === this.id) {
        this.audio.sound("kill");
        this.notice("+1 TEAM SCORE · " + e.text?.split(" → ")[1]);
      } else if (e.to === this.id) this.notice("ELIMINATED · REDEPLOYING");
    }
    if (e.type === "pickup" && e.to === this.id) {
      this.audio.sound(e.text?.includes("CACHE") ? "crate" : "pickup");
      this.notice(e.text || "SUPPLIES ACQUIRED");
    }
    if (e.type === "notice") this.notice(e.text || "");
    if (e.type === "explosion") this.audio.sound("explosion", e);
    if (e.type === "melee" && e.from !== this.id) this.audio.sound("swing", e);
  }
  private input(): Input {
    const active = this.controlsActive,
      k = this.keys;
    const p = this.local,
      slot = p?.weapons[p.selected],
      w = slot && WEAPONS[slot.id];
    const aiming = this.aiming;
    const scoped = aiming && !!w && scopeLevels(w, slot!.attachment).length > 0;
    const time = this.ui.snapshot
      ? this.ui.snapshot.time +
        Math.min(0.1, performance.now() / 1000 - this.receivedAt)
      : 0;
    const sway = scoped
      ? scopeSway(time, !!p?.steadied, !!p?.crouched)
      : { yaw: 0, pitch: 0 };
    const i = {
      seq: ++this.seq,
      forward: active ? (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0) : 0,
      strafe: active ? (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) : 0,
      yaw: this.yaw + sway.yaw,
      pitch: clamp(this.pitch + sway.pitch, -1.54, 1.54),
      jump:
        !!active &&
        (this.local?.air === "ground" ? k.has("Space") : this.airJump),
      sprint: !!active && !aiming && k.has("ShiftLeft"),
      crouch:
        !!active &&
        (this.settings.crouchToggle
          ? this.crouch
          : k.has("KeyC") || k.has("ControlLeft")),
      fire: !!active && (this.mouseFire || this.clickFire),
      ads: aiming,
      steady: scoped && k.has("ShiftLeft"),
      at: this.ui.snapshot
        ? this.ui.snapshot.time +
          Math.min(0.1, performance.now() / 1000 - this.receivedAt) -
          0.1
        : 0,
    };
    this.clickFire = false;
    this.airJump = false;
    return i;
  }
  private tick() {
    if (
      this.awaitingSnapshot ||
      !this.local ||
      !this.local.alive ||
      this.ui.snapshot?.phase === "finished" ||
      !this.ui.connected
    )
      return;
    const input = this.input();
    this.lastInput = input;
    const grounded = this.local.grounded,
      previousY = this.local.y,
      previousVy = this.local.vy;
    movePlayer(this.local, input);
    if (this.settings.motion) {
      if (!grounded && this.local.grounded)
        this.landing.velocity -= clamp(Math.abs(previousVy) * 0.38, 0.5, 4.5);
      if (grounded && this.local.grounded)
        this.stepOffset = clamp(
          this.stepOffset + previousY - this.local.y,
          -0.4,
          0.4,
        );
    }
    this.pending.push(input);
    if (this.pending.length > 100) {
      this.fail("Server is not acknowledging movement. Reconnect to continue.");
      this.pending = [];
      this.socket?.close();
      return;
    }
    if (
      this.socket?.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 16384
    )
      this.socket.send(JSON.stringify({ type: "input", input }));
    const slot = this.local.weapons[this.local.selected],
      w = WEAPONS[slot.id],
      now = performance.now() / 1000;
    if (
      input.fire &&
      !(w.mode === "semi" && this.wasFire) &&
      this.local.air === "ground" &&
      !this.local.reloadAt &&
      !this.local.plateAt &&
      !this.local.healAt &&
      slot.ammo > 0 &&
      now >= this.nextShot &&
      (!input.sprint || input.ads)
    ) {
      this.nextShot = Math.max(
        this.nextShot + 60 / w.rpm,
        now + 60 / w.rpm - TICK,
      );
      this.shotIndex = now - this.shotTime > 0.32 ? 0 : this.shotIndex + 1;
      this.shotTime = now;
      this.recoil = Math.min(
        0.18,
        this.recoil + w.recoil * ATTACHMENTS[slot.attachment].recoil,
      );
      const kick = weaponKick(w, this.shotIndex);
      this.pitch = clamp(
        this.pitch + kick.pitch * ATTACHMENTS[slot.attachment].recoil,
        -1.54,
        1.54,
      );
      this.yaw += kick.yaw * ATTACHMENTS[slot.attachment].recoil;
      this.audio.shot(slot.id);
      this.visual.weapon.kick(slot.id, now);
      if (this.settings.effects && slot.id !== "knife")
        this.visual.shell(
          this.visual.weapon.ejection(this.camera, this.ejection),
          this.yaw,
        );
    }
    this.wasFire = input.fire;
    if (
      input.fire &&
      slot.ammo === 0 &&
      !this.local.reloadAt &&
      now - this.emptyAt > 0.35
    ) {
      this.audio.sound("empty");
      this.emptyAt = now;
    }
  }
  private frame(time: number) {
    if (this.disposed) return;
    const frameStart = performance.now();
    const dt = Math.min(0.075, this.lastTime ? time - this.lastTime : 0.016);
    this.lastTime = time;
    this.accumulator += dt;
    while (this.accumulator >= TICK) {
      this.tick();
      this.accumulator -= TICK;
    }
    if (time + 0.000001 < this.renderDeadline) return;
    this.renderDeadline = nextRenderDeadline(
      this.renderDeadline,
      time,
      this.settings.fpsLimit,
    );
    const rd = Math.min(0.1, time - this.renderedTime || 0.016);
    this.renderedTime = time;
    this.menuTime += rd;
    this.ui.damage = Math.max(0, this.ui.damage - rd * 0.8);
    this.ui.hit = Math.max(0, this.ui.hit - rd * 4);
    this.recoil *= Math.exp(-rd * 12);
    this.ui.recoil = this.recoil;
    if (this.local)
      this.ui.recoil +=
        weaponInaccuracy(
          WEAPONS[this.local.weapons[this.local.selected].id],
          Math.hypot(this.local.vx, this.local.vz),
          this.local.grounded,
          this.local.crouched,
          this.ads,
          0,
        ) * 0.8;
    this.ui.ads = this.ads;
    if (time > this.noticeUntil) this.ui.notice = "";
    const p = this.local,
      v = this.visual;
    if (v.menuOperator) v.menuOperator.visible = !this.ui.playing;
    if (this.ui.playing && p) {
      const speed = Math.hypot(p.vx, p.vz);
      // Preview the fractional tick with the same collision solver; never extrapolate through a wall.
      this.renderPlayer ??= { ...p };
      Object.assign(this.renderPlayer, p);
      if (this.lastInput && this.accumulator > 0)
        movePlayer(
          this.renderPlayer,
          { ...this.lastInput, jump: p.jumpHeld },
          this.accumulator,
        );
      const display = this.renderPlayer;
      this.foot += rd * speed;
      this.cameraOffset.multiplyScalar(Math.exp(-rd * 18));
      stepSpring(this.landing, rd, 19, 0.82);
      this.stepOffset *= Math.exp(-rd * 16);
      const slot = p.weapons[p.selected],
        w = WEAPONS[slot.id],
        key = slot.id + ":" + p.selected;
      if (key !== this.weaponKey) {
        this.zoomIndex = 0;
        this.weaponKey = key;
      }
      const aiming = this.aiming;
      const zooms = scopeLevels(w, slot.attachment),
        scoped = aiming && zooms.length > 0;
      const zoom = scoped ? zooms[this.zoomIndex % zooms.length] : 1;
      this.scopeBlend = T.MathUtils.damp(
        this.scopeBlend,
        scoped ? 1 : 0,
        18,
        rd,
      );
      this.ui.scope =
        this.scopeBlend > 0.75 && scoped
          ? { zoom, focus: p.focus, steady: p.steadied, label: w.name }
          : null;
      this.ui.ads = aiming;
      const aimTime =
        (this.ui.snapshot?.time || 0) + Math.min(0.1, time - this.receivedAt);
      const sway = scoped
        ? scopeSway(aimTime, p.steadied, p.crouched)
        : { yaw: 0, pitch: 0 };
      const impact =
        this.settings.motion && !scoped ? this.landing.position : 0;
      const bob =
        this.settings.motion && p.grounded && !scoped
          ? Math.sin(this.foot * 2.3) * Math.min(0.025, speed * 0.004)
          : 0;
      this.camera.position
        .set(
          display.x,
          (p.grounded ? p.y : display.y) +
            display.eyeHeight +
            bob +
            impact +
            (this.settings.motion ? this.stepOffset : 0),
          display.z,
        )
        .add(this.cameraOffset);
      this.camera.rotation.set(
        clamp(this.pitch + sway.pitch, -1.54, 1.54),
        this.yaw + sway.yaw,
        this.settings.motion ? Math.sin(this.foot) * speed * 0.0008 : 0,
        "YXZ",
      );
      if (!p.alive) {
        const survivor = [...v.avatars.values()].find(
          (a) => a.target.alive && a.target.team === p.team,
        );
        if (survivor) {
          this.camera.position
            .copy(survivor.root.position)
            .add(new T.Vector3(0, 3, 5));
          this.camera.lookAt(
            survivor.root.position.clone().add(new T.Vector3(0, 1, 0)),
          );
        }
      }
      const targetFov = scoped
        ? scopeFov(this.settings.fov, zoom)
        : aiming
          ? 60
          : this.settings.fov + (speed > 6 && this.settings.motion ? 4 : 0);
      this.camera.fov = T.MathUtils.lerp(
        this.camera.fov,
        targetFov,
        Math.min(1, rd * 12),
      );
      this.camera.updateProjectionMatrix();
      if (!this.ui.scope)
        v.weapon.update(
          p,
          rd,
          time,
          (this.ui.snapshot?.time || 0) +
            Math.min(0.15, time - this.receivedAt),
          aiming,
          !aiming && this.keys.has("ShiftLeft"),
          this.settings.motion,
          this.yaw,
          this.pitch,
          impact,
        );
      else v.weapon.advanceHidden(p, rd, time);
      if (
        speed > 1 &&
        p.grounded &&
        time - this.stepTime > 0.46 / (speed > 6 ? 1.4 : 1)
      ) {
        this.audio.sound(
          "step",
          undefined,
          1,
          nearbyColliders(p.x, p.z, 2).find(
            (c) =>
              Math.abs(p.y - (c.y + c.h / 2)) < 0.12 &&
              Math.abs(p.x - c.x) < c.w / 2 &&
              Math.abs(p.z - c.z) < c.d / 2,
          )?.material || "dirt",
        );
        this.stepTime = time;
      }
      this.updatePrompt();
    } else {
      const t = this.menuTime * 0.045,
        center = arenaCenter(this.settings.mapId);
      if (v.menuOperator) v.menuOperator.visible = false;
      this.camera.position.set(
        center.x + Math.sin(t) * 45,
        38,
        center.z + 68 + Math.cos(t) * 6,
      );
      this.camera.lookAt(center.x, 1, center.z - 4);
      this.camera.fov = 58;
      this.camera.updateProjectionMatrix();
      v.view.visible = false;

      if (v.menuOperator?.visible) {
        v.menuMixer?.update(rd);
        v.updateMenuPose();
      }
    }
    this.ui.thirdPerson = false;
    v.plane.visible = false;
    v.parachute.visible = false;
    this.camera.getWorldDirection(this.audioDirection);
    this.audio.listener(
      this.camera.position,
      Math.atan2(-this.audioDirection.x, -this.audioDirection.z),
      Math.asin(this.audioDirection.y),
    );
    v.update(
      rd,
      (this.ui.snapshot?.time || 0) +
        Math.min(0.1, time - this.receivedAt) -
        0.1,
      this.settings.distance,
    );
    this.world?.update(
      time,
      this.camera.position,
      this.settings.distance,
      arenaFor(this.ui.snapshot?.map ?? this.settings.mapId),
    );
    this.graphics.render();
    this.ui.cpuMs = T.MathUtils.lerp(
      this.ui.cpuMs,
      performance.now() - frameStart,
      0.1,
    );
    this.fpsFrames++;
    if (time - this.fpsAt > 1) {
      this.ui.fps = Math.round(this.fpsFrames / (time - this.fpsAt));
      this.ui.frameMs = 1000 / Math.max(1, this.ui.fps);
      this.fpsFrames = 0;
      this.fpsAt = time;
      if (
        this.settings.adaptiveResolution &&
        !this.ui.loading &&
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        time - this.scaleAt > 1.25
      ) {
        const target = Math.min(60, this.settings.fpsLimit);
        const slow = this.ui.fps < target * 0.98;
        if (slow) this.scaleRecoveryAt = time + 8;
        const next = clamp(
          this.renderScale +
            (slow
              ? this.ui.fps < target * 0.75
                ? -0.12
                : -0.06
              : this.ui.fps >= target && time > this.scaleRecoveryAt
                ? 0.02
                : 0),
          0.5,
          1,
        );
        if (Math.abs(next - this.renderScale) > 0.01) {
          this.renderScale = next;
          this.resize();
        }
        this.scaleAt = time;
      }
      this.ui.renderScale = this.renderScale;
    }
    if (time - this.bandwidthAt > 1) {
      this.ui.networkKB = Math.round(this.bytes / 1024);
      this.bytes = 0;
      this.bandwidthAt = time;
    }
    if (time - this.pingAt > 2 && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({ type: "ping", time: performance.now() }),
      );
      this.pingAt = time;
    }
    if (time - this.uiTime > 0.1) {
      const info = this.renderer.info;
      this.ui.calls = info.render.drawCalls;
      this.ui.triangles = info.render.triangles;
      this.ui.rendered = [...v.avatars.values()].filter(
        (a) => a.root.visible,
      ).length;
      this.uiTime = time;
      this.emit();
    }
  }
  private updatePrompt() {
    const p = this.local;
    this.ui.prompt =
      p && p.alive && p.protectedUntil > (this.ui.snapshot?.time || 0)
        ? "SPAWN PROTECTION · FIRING ENDS PROTECTION"
        : "";
  }
  leave(emit = true) {
    this.clearInput();
    this.generation++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.resumeToken = "";
    this.reconnectUntil = 0;
    this.reconnectAttempt = 0;
    this.awaitingSnapshot = false;
    this.ui.reconnecting = false;
    this.socket?.close(1000, "leave");
    this.socket = null;
    this.local = null;
    this.pending = [];
    this.seq = 0;
    this.seenEvents = 0;
    this.cameraOffset.set(0, 0, 0);
    this.fallback = false;
    this.ui.playing = false;
    this.ui.connected = false;
    this.ui.paused = false;
    this.ui.map = false;
    this.ui.inventory = false;
    this.ui.loadout = false;
    this.ui.terminal = false;
    this.ui.snapshot = null;
    this.ui.scope = null;
    this.scopeBlend = 0;
    this.ui.killFeed = [];
    this.ui.error = "";
    document.exitPointerLock();
    this.visual.clear();
    this.audio.silence();
    this.knownLoot.clear();
    if (emit) this.emit();
  }
  dispose() {
    this.disposed = true;
    this.leave(false);
    this.renderer?.setAnimationLoop(null);
    this.cleanup.forEach((f) => f());
    this.audio.dispose();
    this.visual.dispose();
    this.graphics?.dispose();
    this.renderer?.dispose();
    this.mount.replaceChildren();
  }
}

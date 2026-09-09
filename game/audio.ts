import type { Vec3, WeaponId } from "../packages/game-shared/data";
import { WEAPONS } from "../packages/game-shared/data";
import type { Settings } from "./settings";
export type Sound =
  | "swing"
  | "shot"
  | "reload"
  | "step"
  | "hit"
  | "kill"
  | "pickup"
  | "explosion"
  | "land"
  | "ui"
  | "mag-out"
  | "mag-in"
  | "bolt"
  | "cloth"
  | "equip"
  | "empty"
  | "jump"
  | "plate"
  | "heal"
  | "throw"
  | "bounce"
  | "parachute"
  | "cut"
  | "zone"
  | "victory"
  | "defeat"
  | "crate"
  | "armor-break";
const FILES: Record<string, string> = {
  "mag-out": "mag-out.wav",
  "mag-in": "mag-in.wav",
  bolt: "bolt.wav",
  reload: "rifle-reload.wav",
  "pistol-reload": "pistol-reload.wav",
  throw: "grenade-handle.wav",
  "rifle-shot": "rifle-shot.ogg",
  "pistol-shot": "pistol-shot.ogg",
  "shotgun-shot": "shotgun-shot.ogg",
  "sniper-shot": "sniper-shot.ogg",
  helicopter: "helicopter-loop.ogg",
  ...Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [
      "step-" + i,
      "footstep-" + (i + 1) + ".ogg",
    ]),
  ),
};
export class GameAudio {
  context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private windGain: GainNode | null = null;
  private rotorGain: GainNode | null = null;
  private rotor: AudioBufferSourceNode | null = null;
  private noise: AudioBuffer | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private bytes = new Map<string, ArrayBuffer>();
  private voices = new Set<AudioScheduledSourceNode>();
  private loading: Promise<void> | null = null;
  settings: Settings;
  constructor(settings: Settings) {
    this.settings = settings;
  }
  prepare() {
    if (!this.loading)
      this.loading = Promise.all(
        Object.entries(FILES).map(async ([key, file]) => {
          try {
            const r = await fetch("/assets/upgrade/audio/" + file);
            if (!r.ok) throw Error(file);
            this.bytes.set(key, await r.arrayBuffer());
          } catch {
            console.warn("Audio sample unavailable:", file);
          }
        }),
      ).then(() => {});
    return this.loading;
  }
  resume() {
    if (!this.context) {
      const c = (this.context = new AudioContext());
      this.master = c.createGain();
      this.effectsBus = c.createGain();
      this.ambientBus = c.createGain();
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 12;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.16;
      this.effectsBus.connect(this.master);
      this.ambientBus.connect(this.master);
      this.master.connect(limiter).connect(c.destination);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const wind = c.createBufferSource();
      wind.buffer = this.noise;
      wind.loop = true;
      const low = c.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 420;
      this.windGain = c.createGain();
      wind.connect(low).connect(this.windGain).connect(this.ambientBus);
      wind.start();
      this.windGain.gain.value = 0.08;
      this.rotorGain = c.createGain();
      this.rotorGain.gain.value = 0;
      this.rotorGain.connect(this.effectsBus);
      this.apply(this.settings);
      void this.prepare().then(async () => {
        for (const [key, bytes] of this.bytes) {
          try {
            this.buffers.set(key, await c.decodeAudioData(bytes.slice(0)));
          } catch {
            console.warn("Could not decode sound:", key);
          }
        }
        const buffer = this.buffers.get("helicopter");
        if (buffer && this.context === c) {
          this.rotor = c.createBufferSource();
          this.rotor.buffer = buffer;
          this.rotor.loop = true;
          this.rotor.connect(this.rotorGain!);
          this.rotor.start();
        }
      });
    }
    void this.context.resume();
  }
  apply(s: Settings) {
    this.settings = s;
    const c = this.context;
    if (!c) return;
    this.master?.gain.setTargetAtTime(s.master, c.currentTime, 0.025);
    this.effectsBus?.gain.setTargetAtTime(
      s.effectsVolume,
      c.currentTime,
      0.025,
    );
    this.ambientBus?.gain.setTargetAtTime(s.ambience, c.currentTime, 0.1);
  }
  flight(air: string, verticalSpeed: number, rotorDistance: number) {
    const c = this.context;
    if (!c) return;
    this.windGain?.gain.setTargetAtTime(
      air === "fall"
        ? 0.15 + Math.min(0.55, Math.abs(verticalSpeed) * 0.013)
        : air === "chute"
          ? 0.17
          : 0.055,
      c.currentTime,
      0.2,
    );
    this.rotorGain?.gain.setTargetAtTime(
      air === "plane" ? 0.66 : Math.max(0, 0.46 * (1 - rotorDistance / 100)),
      c.currentTime,
      0.18,
    );
  }
  listener(p: Vec3, yaw: number, pitch: number) {
    const c = this.context;
    if (!c) return;
    const l = c.listener;
    for (const [param, value] of [
      [l.positionX, p.x],
      [l.positionY, p.y],
      [l.positionZ, p.z],
      [l.forwardX, -Math.sin(yaw) * Math.cos(pitch)],
      [l.forwardY, Math.sin(pitch)],
      [l.forwardZ, -Math.cos(yaw) * Math.cos(pitch)],
      [l.upX, 0],
      [l.upY, 1],
      [l.upZ, 0],
    ] as const)
      param.value = value;
  }
  private output(position?: Vec3) {
    const c = this.context!;
    if (!position) return { node: this.effectsBus!, cleanup: () => {} };
    const p = c.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 7;
    p.maxDistance = 300;
    p.rolloffFactor = 1.3;
    p.positionX.value = position.x;
    p.positionY.value = position.y;
    p.positionZ.value = position.z;
    p.connect(this.effectsBus!);
    return { node: p, cleanup: () => p.disconnect() };
  }
  private sample(
    key: string,
    position?: Vec3,
    volume = 1,
    rate = 1,
    duration?: number,
  ) {
    const c = this.context,
      buffer = this.buffers.get(key);
    if (!c || !buffer || !this.effectsBus) return false;
    const source = c.createBufferSource(),
      gain = c.createGain(),
      out = this.output(position);
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain).connect(out.node);
    this.track(source, () => {
      gain.disconnect();
      out.cleanup();
    });
    source.start();
    if (duration) source.stop(c.currentTime + duration);
    return true;
  }
  private track(source: AudioScheduledSourceNode, cleanup: () => void) {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      cleanup();
    };
    if (this.voices.size > 40) {
      const oldest = this.voices.values().next().value;
      try {
        oldest?.stop();
      } catch {}
    }
  }
  private noiseBurst(
    frequency: number,
    duration: number,
    volume: number,
    position?: Vec3,
    delay = 0,
    q = 0.6,
  ) {
    const c = this.context;
    if (!c || !this.noise || !this.effectsBus) return;
    const source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain(),
      out = this.output(position),
      now = c.currentTime + delay;
    source.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume),
      now + 0.003,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(out.node);
    this.track(source, () => {
      filter.disconnect();
      gain.disconnect();
      out.cleanup();
    });
    source.start(now, Math.random());
    source.stop(now + duration + 0.01);
  }
  private tone(
    frequency: number,
    end: number,
    duration: number,
    volume: number,
    position?: Vec3,
    delay = 0,
  ) {
    const c = this.context;
    if (!c || !this.effectsBus) return;
    const source = c.createOscillator(),
      gain = c.createGain(),
      out = this.output(position),
      now = c.currentTime + delay;
    source.type = "triangle";
    source.frequency.setValueAtTime(frequency, now);
    source.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(gain).connect(out.node);
    this.track(source, () => {
      gain.disconnect();
      out.cleanup();
    });
    source.start(now);
    source.stop(now + duration + 0.01);
  }
  shot(id: WeaponId, position?: Vec3) {
    if (id === "knife") {
      this.sound("swing", position);
      return;
    }
    const w = WEAPONS[id],
      key =
        w.category === "Pistol"
          ? "pistol-shot"
          : w.category === "Shotgun"
            ? "shotgun-shot"
            : w.category === "Sniper rifle"
              ? "sniper-shot"
              : "rifle-shot";
    const rate =
      (id === "pike" ? 1.16 : id === "bastion" ? 0.88 : 1) *
      (0.97 + Math.random() * 0.06);
    if (!this.sample(key, position, position ? 0.7 : 0.9, rate)) {
      this.noiseBurst(1200, 0.12, 0.8, position);
      this.noiseBurst(340, 0.3, 0.45, position);
      this.tone(110, 36, 0.2, 0.4, position);
    }
    this.noiseBurst(2600, 0.04, 0.1, position, 0.015);
  }
  sound(kind: Sound, position?: Vec3, weight = 1, surface = "concrete") {
    if (!this.context) return;
    if (kind === "swing") {
      this.noiseBurst(1100, 0.16, 0.13, position);
      return;
    }
    const recorded: Partial<Record<Sound, string>> = {
      "mag-out": "mag-out",
      "mag-in": "mag-in",
      bolt: "bolt",
      throw: "throw",
      equip: "mag-in",
      reload: "reload",
      crate: "mag-out",
    };
    if (kind === "shot") {
      this.shot("kestrel", position);
      return;
    }
    if (kind === "step") {
      const key = "step-" + Math.floor(Math.random() * 6);
      this.sample(
        key,
        position,
        0.32 * weight,
        (surface === "metal" ? 1.16 : 0.9) + Math.random() * 0.13,
      );
      if (surface === "metal")
        this.tone(430, 200, 0.055, 0.06 * weight, position);
      return;
    }
    if (
      recorded[kind] &&
      this.sample(
        recorded[kind]!,
        position,
        (kind === "bolt" ? 0.75 : 0.65) * weight,
        0.96 + Math.random() * 0.08,
        kind === "equip" ? 0.13 : undefined,
      )
    )
      return;
    switch (kind) {
      case "explosion":
        this.noiseBurst(190, 0.9, 1.1 * weight, position);
        this.noiseBurst(1250, 0.18, 0.9 * weight, position);
        this.tone(80, 23, 0.65, 0.9 * weight, position);
        break;
      case "land":
        this.noiseBurst(145, 0.2, 0.5 * weight, position);
        this.sample("step-2", position, 0.6 * weight, 0.8);
        this.noiseBurst(1200, 0.16, 0.15 * weight, position, 0.04);
        break;
      case "cloth":
      case "jump":
      case "heal":
        this.noiseBurst(1350, 0.22, 0.12 * weight, position);
        break;
      case "plate":
        this.noiseBurst(430, 0.26, 0.28 * weight, position);
        this.tone(180, 125, 0.12, 0.08 * weight, position, 0.12);
        break;
      case "empty":
        this.tone(1300, 400, 0.035, 0.12 * weight, position);
        break;
      case "bounce":
        this.noiseBurst(
          surface === "metal" ? 1100 : 480,
          0.08,
          0.22 * weight,
          position,
        );
        break;
      case "parachute":
        this.noiseBurst(700, 0.45, 0.5 * weight);
        this.tone(90, 40, 0.3, 0.1);
        break;
      case "cut":
        this.noiseBurst(1500, 0.06, 0.27 * weight);
        break;
      case "armor-break":
        this.noiseBurst(3300, 0.2, 0.25 * weight);
        this.tone(1400, 400, 0.12, 0.17);
        break;
      case "hit":
        this.tone(1250, 850, 0.045, 0.09 * weight);
        break;
      case "kill":
        this.tone(780, 460, 0.12, 0.15 * weight);
        this.tone(1120, 620, 0.16, 0.12 * weight, undefined, 0.06);
        break;
      case "pickup":
      case "ui":
        this.tone(kind === "ui" ? 600 : 950, 400, 0.05, 0.08 * weight);
        break;
      case "zone":
        this.tone(220, 220, 0.22, 0.15);
        this.tone(160, 160, 0.25, 0.13, undefined, 0.3);
        break;
      case "victory":
        for (let i = 0; i < 4; i++)
          this.tone(
            [220, 277, 330, 440][i],
            [220, 277, 330, 440][i],
            0.75,
            0.11,
            undefined,
            i * 0.18,
          );
        break;
      case "defeat":
        this.tone(200, 55, 1, 0.16);
        break;
      default:
        this.noiseBurst(1000, 0.11, 0.2 * weight, position);
    }
  }
  silence() {
    const c = this.context;
    if (c) {
      this.rotorGain?.gain.setTargetAtTime(0, c.currentTime, 0.1);
      this.windGain?.gain.setTargetAtTime(0.04, c.currentTime, 0.2);
    }
  }
  dispose() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.rotor?.stop();
    void this.context?.close();
    this.context = null;
  }
}

import type { PerkId } from "../packages/game-shared/combat";
import type { MapId } from "../packages/game-shared/arenas";
export type Settings = {
  mapId: MapId;
  perk: PerkId;
  adaptiveResolution: boolean;
  preset: "low" | "medium" | "high" | "ultra";
  scale: number;
  distance: number;
  shadows: boolean;
  effects: boolean;
  vegetation: boolean;
  fov: number;
  fpsLimit: number;
  backend: "auto" | "webgl";
  master: number;
  effectsVolume: number;
  ambience: number;
  sensitivity: number;
  adsSensitivity: number;
  invertY: boolean;
  motion: boolean;
  crouchToggle: boolean;
  name: string;
  operator: "sable" | "ochre";
  loadout: string;
  attachment: string;
  difficulty: "regular" | "veteran";
  server: string;
};
export const defaults: Settings = {
  mapId: "verdant",
  perk: "balanced",
  adaptiveResolution: true,
  preset: "high",
  scale: 1,
  distance: 320,
  shadows: true,
  effects: true,
  vegetation: true,
  fov: 85,
  fpsLimit: 60,
  backend: "auto",
  master: 0.7,
  effectsVolume: 0.8,
  ambience: 0.28,
  sensitivity: 1,
  adsSensitivity: 0.65,
  invertY: false,
  motion: true,
  crouchToggle: false,
  name: "GUEST",
  operator: "sable",
  loadout: "kestrel",
  attachment: "balanced",
  difficulty: "regular",
  server: "",
};
export const presets = {
  low: {
    scale: 0.7,
    distance: 190,
    shadows: false,
    effects: false,
    vegetation: false,
  },
  medium: {
    scale: 1,
    distance: 360,
    shadows: true,
    effects: true,
    vegetation: true,
  },
  high: {
    scale: 1.25,
    distance: 480,
    shadows: true,
    effects: true,
    vegetation: true,
  },
  ultra: {
    scale: 1.5,
    distance: 620,
    shadows: true,
    effects: true,
    vegetation: true,
  },
};
export function readSettings(): Settings {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("ashvector-settings") || "{}"),
    };
  } catch {
    return { ...defaults };
  }
}
export type Career = {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  damage: number;
  best: number;
  playtime: number;
  top5: number;
};
export function readCareer(): Career {
  try {
    return {
      matches: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      damage: 0,
      best: 0,
      playtime: 0,
      top5: 0,
      ...JSON.parse(localStorage.getItem("ashvector-career") || "{}"),
    };
  } catch {
    return {
      matches: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      damage: 0,
      best: 0,
      playtime: 0,
      top5: 0,
    };
  }
}

import type { PerkId } from "./combat";
import type { MapId } from "./arenas";
import type { AttachmentId, Vec3, WeaponId, LootKind } from "./data";
export type Input = {
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  fire: boolean;
  ads: boolean;
  steady?: boolean;
  at: number;
};
export type WeaponSlot = {
  id: WeaponId;
  ammo: number;
  reserve: number;
  attachment: AttachmentId;
};
export type Team = "blue" | "red";
export type Player = Vec3 & {
  map: MapId;
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  perk: PerkId;
  eyeHeight: number;
  focus: number;
  focusCooldown: number;
  steadied: boolean;
  assists: number;
  streak: number;
  bestStreak: number;
  lastKiller: string;
  lastKillerWeapon: string;
  team: Team;
  deaths: number;
  respawnAt: number;
  protectedUntil: number;
  jumpHeld: boolean;
  coyote: number;
  jumpBuffer: number;
  crouchHeld: boolean;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  crouched: boolean;
  slide: number;
  air: "plane" | "fall" | "chute" | "ground";
  hp: number;
  armor: number;
  plates: number;
  meds: number;
  credits: number;
  grenades: { frag: number; smoke: number; flash: number };
  selected: 0 | 1 | 2;
  weapons: [WeaponSlot, WeaponSlot, WeaponSlot];
  kills: number;
  damage: number;
  alive: boolean;
  reloadAt: number;
  plateAt: number;
  healAt: number;
  lastShot: number;
  lastDamage: number;
  lastSeq: number;
  fireHeld: boolean;
  burst: number;
  spray: number;
  placement: number;
  ping: Vec3 | null;
  pingUntil: number;
  scanUntil: number;
  recon: number;
  reconProgress: number;
  operator: string;
  flashUntil: number;
};
export type Loot = Vec3 & {
  id: string;
  kind: LootKind;
  weapon?: WeaponId;
  slot?: WeaponSlot;
  rarity: number;
  opened?: boolean;
};
export type Projectile = Vec3 & {
  id: string;
  owner: string;
  kind: "frag" | "smoke" | "flash";
  vx: number;
  vy: number;
  vz: number;
  end: number;
};
export type GameEvent = {
  id: number;
  type:
    | "shot"
    | "melee"
    | "hit"
    | "kill"
    | "pickup"
    | "explosion"
    | "smoke"
    | "flash"
    | "notice";
  x: number;
  y: number;
  z: number;
  from?: string;
  to?: string;
  value?: number;
  text?: string;
  head?: boolean;
  end?: Vec3;
  material?: string;
  time: number;
};
export type Phase = "warmup" | "insertion" | "active" | "finished";
export type Zone = {
  x: number;
  z: number;
  radius: number;
  nextX: number;
  nextZ: number;
  nextRadius: number;
  phase: number;
  remaining: number;
  closing: boolean;
};
export type Remote = Pick<
  Player,
  | "id"
  | "name"
  | "bot"
  | "team"
  | "protectedUntil"
  | "x"
  | "y"
  | "z"
  | "yaw"
  | "pitch"
  | "crouched"
  | "grounded"
  | "eyeHeight"
  | "vx"
  | "vz"
  | "air"
  | "alive"
  | "selected"
  | "operator"
> & { weapon: WeaponId; attachment: AttachmentId; firing: boolean };
export type Snapshot = {
  type: "snapshot";
  mode: "tdm";
  round: number;
  rematchReady: string[];
  teamPings: (Vec3 & { name: string; expires: number })[];
  map: MapId;
  scores: Record<Team, number>;
  scoreLimit: number;
  winnerTeam: Team | null;
  scoreboard: {
    id: string;
    name: string;
    team: Team;
    kills: number;
    deaths: number;
    assists: number;
    bot: boolean;
  }[];
  time: number;
  tick: number;
  phase: Phase;
  phaseEnd: number;
  elapsed: number;
  you: Player;
  entities: Remote[];
  removed: string[];
  removedLoot: string[];
  loot: Loot[];
  projectiles: Projectile[];
  events: GameEvent[];
  zone: Zone;
  alive: number;
  total: number;
  winner: string | null;
  humans: number;
  room: string;
  tickMs: number;
  full: boolean;
};
export type ClientMessage =
  | {
      type: "hello";
      resumeToken?: string;
      map?: MapId;
      perk?: PerkId;
      name: string;
      room: string;
      loadout: WeaponId;
      attachment: AttachmentId;
      operator: string;
      difficulty: "regular" | "veteran";
    }
  | { type: "input"; input: Input }
  | {
      type: "action";
      action:
        | "rematch"
        | "loadout"
        | "reload"
        | "plate"
        | "heal"
        | "interact"
        | "swap"
        | "throw"
        | "chute"
        | "ping"
        | "buy"
        | "drop"
        | "mode";
      value?: string;
      x?: number;
      z?: number;
    }
  | { type: "ping"; time: number };
export const neutralInput = (seq = 0): Input => ({
  seq,
  forward: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  sprint: false,
  crouch: false,
  fire: false,
  ads: false,
  at: 0,
});
export function validInput(v: unknown): v is Input {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    ["seq", "forward", "strafe", "yaw", "pitch", "at"].every(
      (k) => typeof p[k] === "number" && Number.isFinite(p[k]),
    ) &&
    (p.steady === undefined || typeof p.steady === "boolean") &&
    Number.isSafeInteger(p.seq) &&
    Number(p.seq) >= 0 &&
    Math.abs(Number(p.forward)) <= 1 &&
    Math.abs(Number(p.strafe)) <= 1 &&
    Math.abs(Number(p.yaw)) < 1e5 &&
    Math.abs(Number(p.pitch)) <= 1.56 &&
    ["jump", "sprint", "crouch", "fire", "ads"].every(
      (k) => typeof p[k] === "boolean",
    )
  );
}

export {
  ARENAS,
  MAP_IDS,
  arenaFor,
  arenaCenter,
  type MapId,
  type Arena,
} from "./arenas";
export const TICK = 1 / 60,
  MAX_HUMANS = 12,
  COMBATANTS = 12,
  MAP_SIZE = 680;
export const TDM = {
  scoreLimit: 50,
  duration: 480,
  respawnDelay: 3,
  protection: 2,
  minX: -64,
  maxX: 72,
  minZ: -108,
  maxZ: 58,
};
export type Vec3 = { x: number; y: number; z: number };
export type WeaponId =
  | "kestrel"
  | "pike"
  | "wraith"
  | "bastion"
  | "breach"
  | "morrow"
  | "longbow"
  | "vesper"
  | "deagle"
  | "revolver"
  | "wa2000"
  | "knife";
export type Weapon = {
  id: WeaponId;
  name: string;
  category: string;
  damage: number;
  head: number;
  torso: number;
  limb: number;
  armor: number;
  rpm: number;
  mag: number;
  reserve: number;
  reload: number;
  ads: number;
  speed: number;
  sprintDelay: number;
  spread: number;
  adsSpread: number;
  recoil: number;
  horizontal: number;
  recovery: number;
  velocity: number;
  range: number;
  weight: number;
  rarity: number;
  mode: "auto" | "semi" | "burst";
  pellets: number;
  model: string;
  asset?: string;
  thumbnail?: string;
  length?: number;
  scope?: readonly number[];
};
const weapon = (
  id: WeaponId,
  name: string,
  category: string,
  model: string,
  damage: number,
  rpm: number,
  mag: number,
  range: number,
  mode: Weapon["mode"],
  extra: Partial<Weapon> = {},
): Weapon => ({
  id,
  name,
  category,
  model,
  damage,
  rpm,
  mag,
  range,
  mode,
  head: 1.8,
  torso: 1,
  limb: 0.75,
  armor: 1,
  reserve: mag * 4,
  reload: 2.2,
  ads: 0.2,
  speed: 1,
  sprintDelay: 0.18,
  spread: 0.027,
  adsSpread: 0.003,
  recoil: 0.012,
  horizontal: 0.003,
  recovery: 9,
  velocity: 800,
  weight: 3.5,
  rarity: 2,
  pellets: 1,
  ...extra,
});
export const WEAPONS: Record<WeaponId, Weapon> = {
  knife: weapon(
    "knife",
    "FIELD KNIFE",
    "Melee",
    "knife",
    55,
    100,
    1,
    2.2,
    "auto",
    {
      head: 1,
      limb: 1,
      reserve: 0,
      reload: 0,
      speed: 1.12,
      weight: 0.3,
      recoil: 0,
      horizontal: 0,
      spread: 0,
      adsSpread: 0,
      length: 0.28,
      asset: "weapons-real/knife.glb",
    },
  ),
  kestrel: weapon(
    "kestrel",
    "AK-74",
    "Assault rifle",
    "ak74",
    32,
    660,
    30,
    85,
    "auto",
    {
      head: 4.8,
      recoil: 0.017,
      horizontal: 0.004,
      asset: "weapons-real/ak74.glb",
    },
  ),
  pike: weapon(
    "pike",
    "SMG-45",
    "Submachine gun",
    "smg45",
    19,
    900,
    30,
    40,
    "auto",
    {
      reload: 1.85,
      speed: 1.06,
      spread: 0.022,
      recoil: 0.009,
      asset: "weapons-real/smg45.glb",
    },
  ),
  wraith: weapon(
    "wraith",
    "M4A1",
    "Assault rifle",
    "m4a1",
    30,
    720,
    30,
    95,
    "auto",
    { head: 3.7, recoil: 0.013, asset: "weapons-real/m4a1.glb" },
  ),
  bastion: weapon(
    "bastion",
    "AKM",
    "Assault rifle",
    "akm",
    36,
    600,
    30,
    100,
    "auto",
    {
      head: 4.3,
      recoil: 0.021,
      horizontal: 0.005,
      asset: "weapons-real/akm.glb",
    },
  ),
  breach: weapon(
    "breach",
    "REMINGTON 870",
    "Shotgun",
    "remington870",
    13,
    85,
    8,
    23,
    "semi",
    {
      pellets: 8,
      spread: 0.095,
      adsSpread: 0.047,
      reload: 2.8,
      recoil: 0.065,
      length: 1,
      asset: "weapons-real/remington870.glb",
    },
  ),
  morrow: weapon(
    "morrow",
    "COLT LIGHTNING",
    "Marksman rifle",
    "lightning",
    67,
    160,
    10,
    140,
    "semi",
    {
      ads: 0.26,
      recoil: 0.034,
      head: 2.4,
      asset: "weapons-real/lightning.glb",
    },
  ),
  longbow: weapon(
    "longbow",
    "SCOPED HUNTING RIFLE",
    "Sniper rifle",
    "scoped-hunting",
    110,
    60,
    5,
    230,
    "semi",
    {
      ads: 0.34,
      speed: 0.9,
      recoil: 0.06,
      head: 2.4,
      reload: 2.8,
      length: 1.08,
      asset: "weapons-real/scoped-hunting.glb",
      scope: [4, 8],
    },
  ),
  vesper: weapon(
    "vesper",
    "SERVICE-17",
    "Pistol",
    "pistol",
    27,
    340,
    17,
    40,
    "semi",
    {
      reload: 1.3,
      speed: 1.08,
      weight: 1,
      rarity: 0,
      spread: 0.019,
      recoil: 0.021,
      length: 0.25,
      asset: "weapons-real/pistol.glb",
    },
  ),
  deagle: weapon(
    "deagle",
    "DESERT EAGLE",
    "Pistol",
    "deagle",
    63,
    180,
    7,
    75,
    "semi",
    {
      head: 2.5,
      reload: 2.1,
      recoil: 0.047,
      adsSpread: 0.002,
      length: 0.3,
      asset: "weapons-real/deagle.glb",
    },
  ),
  wa2000: weapon(
    "wa2000",
    "WA2000",
    "Sniper rifle",
    "wa2000",
    88,
    150,
    10,
    220,
    "semi",
    {
      head: 2.3,
      ads: 0.34,
      recoil: 0.04,
      reload: 2.8,
      speed: 0.86,
      length: 1.1,
      scope: [4, 8],
      asset: "weapons-real/wa2000.glb",
    },
  ),
  revolver: weapon(
    "revolver",
    "COLT DETECTIVE",
    "Pistol",
    "revolver",
    52,
    210,
    6,
    55,
    "semi",
    {
      head: 3,
      reload: 2.6,
      recoil: 0.039,
      adsSpread: 0.003,
      length: 0.26,
      asset: "weapons-real/revolver.glb",
    },
  ),
};
for (const w of Object.values(WEAPONS))
  if (w.id !== "knife")
    w.thumbnail = "/assets/weapons-real/" + w.model + ".png";
// A steady first shot, movement penalties, and spray bloom reward deliberate bursts.
export function weaponInaccuracy(
  w: Weapon,
  speed: number,
  grounded: boolean,
  crouched: boolean,
  ads: boolean,
  spray: number,
) {
  const base =
    w.category === "Shotgun"
      ? ads
        ? w.adsSpread
        : w.spread
      : ads
        ? w.adsSpread
        : w.adsSpread * 1.8;
  const mobility =
    w.category === "Submachine gun" || w.category === "Pistol" ? 0.035 : 0.075;
  const motion = Math.pow(Math.min(1, speed / (5.5 * w.speed)), 1.5) * mobility;
  return (
    base * (crouched ? 0.7 : 1) +
    motion +
    (grounded ? 0 : 0.13) +
    Math.min(18, spray) * 0.00075
  );
}
export function weaponKick(w: Weapon, shot: number) {
  const sway = [
    0, 0.1, 0.2, 0.4, 0.6, 0.8, 0.6, 0.2, -0.3, -0.7, -1, -0.8, -0.4, 0.1, 0.5,
    0.8,
  ];
  return {
    pitch: w.recoil * (0.55 + Math.min(shot, 9) * 0.045),
    yaw: w.horizontal * sway[shot % sway.length],
  };
}
// Every loadout receives a knife; the arsenal chooses the primary firearm.
export const WEAPON_IDS = (Object.keys(WEAPONS) as WeaponId[]).filter(
  (id) => id !== "knife",
);
export const ATTACHMENTS = {
  balanced: {
    name: "STANDARD ISSUE",
    description: "Factory balance.",
    spread: 1,
    recoil: 1,
    mag: 1,
    ads: 1,
  },
  control: {
    name: "COMPENSATOR + FOREGRIP",
    description: "25% less recoil. Slightly slower aim.",
    spread: 1,
    recoil: 0.75,
    mag: 1,
    ads: 1.15,
  },
  optic: {
    name: "PRECISION OPTIC",
    description: "30% tighter aimed spread.",
    spread: 0.7,
    recoil: 1,
    mag: 1,
    ads: 1.12,
  },
  extended: {
    name: "EXTENDED MAGAZINE",
    description: "40% more rounds. Longer reload.",
    spread: 1,
    recoil: 1,
    mag: 1.4,
    ads: 1.08,
  },
};
export type AttachmentId = keyof typeof ATTACHMENTS;
export const RARITIES = [
  "FIELD",
  "IMPROVED",
  "SPECIALIST",
  "ELITE",
  "SIGNATURE",
];
export const RARITY_COLORS = [
  "#a8b1a4",
  "#9dbc89",
  "#80b7bd",
  "#b49bc4",
  "#e8b971",
];
export type LootKind =
  | "weapon"
  | "ammo"
  | "plate"
  | "med"
  | "frag"
  | "smoke"
  | "flash"
  | "credits"
  | "crate";
export const LOOT_WEIGHTS = [
  { kind: "ammo", weight: 26 },
  { kind: "plate", weight: 25 },
  { kind: "weapon", weight: 28 },
  { kind: "credits", weight: 12 },
  { kind: "med", weight: 5 },
  { kind: "frag", weight: 4 },
] as const;
export function rollLoot(n: number): LootKind {
  let total = 0;
  for (const item of LOOT_WEIGHTS) {
    total += item.weight;
    if (n * 100 < total) return item.kind;
  }
  return "frag";
}
export function weaponDamage(
  id: WeaponId,
  distance: number,
  region: "head" | "torso" | "limb" = "torso",
) {
  const w = WEAPONS[id];
  return (
    w.damage *
    w[region] *
    Math.max(0.4, 1 - (Math.max(0, distance - w.range) / w.range) * 0.5)
  );
}
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const dist = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const POIS = [
  { name: "SABLE HARBOR", x: 0, z: 0, type: "harbor" },
  { name: "RELAY RIDGE", x: -190, z: -190, type: "radar" },
  { name: "GLASSWORKS", x: 185, z: -175, type: "factory" },
  { name: "SLATE QUARRY", x: -215, z: 105, type: "quarry" },
  { name: "LOWLAND ARRAY", x: 185, z: 140, type: "solar" },
  { name: "NORTHWATCH", x: 10, z: -260, type: "base" },
  { name: "TIDAL DEPOT", x: 5, z: 230, type: "depot" },
  { name: "BRACKEN ROW", x: -125, z: 250, type: "village" },
];
export const TERMINALS = [
  { x: 12, z: 13 },
  { x: 185, z: 152 },
  { x: -180, z: -182 },
];
export const RELAYS = [
  { id: 0, x: -43, z: -27 },
  { id: 1, x: 190, z: -195 },
  { id: 2, x: -197, z: 100 },
];

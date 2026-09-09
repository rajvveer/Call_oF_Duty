import type { Weapon } from "./data";
export const HEAL_DURATION = 2.8;

export function cycleWeaponSlot(
  selected: number,
  direction: number,
): 0 | 1 | 2 {
  return ((selected + (direction < 0 ? -1 : 1) + 3) % 3) as 0 | 1 | 2;
}

export const PERKS = {
  balanced: {
    name: "STANDARD",
    description: "Full armor and ammunition. No trade-offs.",
    speed: 1,
    reload: 1,
    armor: 50,
    reserve: 1,
    explosive: 1,
    flash: 1,
  },
  quickhands: {
    name: "QUICK HANDS",
    description: "18% faster reloads; carry 25% less reserve ammunition.",
    speed: 1,
    reload: 0.82,
    armor: 50,
    reserve: 0.75,
    explosive: 1,
    flash: 1,
  },
  lightweight: {
    name: "LIGHTWEIGHT",
    description: "8% faster movement; maximum armor reduced to 35.",
    speed: 1.08,
    reload: 1,
    armor: 35,
    reserve: 1,
    explosive: 1,
    flash: 1,
  },
  tactical: {
    name: "TACTICAL",
    description:
      "25% less blast damage and 40% shorter flashes; move 5% slower.",
    speed: 0.95,
    reload: 1,
    armor: 50,
    reserve: 1,
    explosive: 0.75,
    flash: 0.6,
  },
};
export type PerkId = keyof typeof PERKS;
export const perkFor = (id: string | undefined) =>
  PERKS[id as PerkId] || PERKS.balanced;

export function reloadTime(
  w: Weapon,
  empty: boolean,
  extended: boolean,
  perk: PerkId = "balanced",
) {
  return (
    (w.reload * (extended ? 1.15 : 1) + (empty ? 0.3 : 0)) *
    perkFor(perk).reload
  );
}

export function scopeLevels(w: Weapon, attachment: string): readonly number[] {
  if (w.category === "Melee") return [];
  if (w.scope) return w.scope;
  if (attachment === "optic" && !["Pistol", "Shotgun"].includes(w.category))
    return [2, 4];
  return [];
}

// Magnification scales the tangent of the field of view, not the angle itself.
export function scopeFov(base: number, magnification: number) {
  return (
    (2 *
      Math.atan(Math.tan((base * Math.PI) / 360) / Math.max(1, magnification)) *
      180) /
    Math.PI
  );
}

export function scopeSway(time: number, steady: boolean, crouched: boolean) {
  const strength = (steady ? 0.15 : 1) * (crouched ? 0.65 : 1);
  return {
    yaw: Math.sin(time * 1.47) * 0.0014 * strength,
    pitch: Math.sin(time * 1.93 + 0.7) * 0.001 * strength,
  };
}

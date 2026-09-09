type Collider = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: "concrete" | "metal" | "wood";
  kind?: string;
};

export const VERDANT_ARENA = {
  id: "verdant",
  name: "VERDANT CORE",
  subtitle: "BIO ATRIUM / COMPACT TDM",
  description:
    "A living research core, sheltered garden loops and close ceramic cover.",
  color: "#81edc1",
  minX: -90,
  maxX: -30,
  minZ: -210,
  maxZ: -140,
} as const;

// Local coordinates around arena center. All player collision is exact, opaque AABB.
// [x, z, width, height, depth, purpose]
export const VERDANT_LAYOUT: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
  string,
])[] = [
  [0, 0, 8, 4.2, 8, "core"],
  // Two broad, offset exits per protected spawn strip.
  [-19, 0, 1.4, 3.6, 20, "screen"],
  [19, 0, 1.4, 3.6, 20, "screen"],
  [-19, -27, 1.4, 3.6, 12, "screen"],
  [19, -27, 1.4, 3.6, 12, "screen"],
  [-19, 27, 1.4, 3.6, 12, "screen"],
  [19, 27, 1.4, 3.6, 12, "screen"],
  // Short inner baffles protect doorway-to-spawn sightlines without dead ends.
  [-12, -15.5, 2, 2.6, 7, "baffle"],
  [12, -15.5, 2, 2.6, 7, "baffle"],
  [-12, 15.5, 2, 2.6, 7, "baffle"],
  [12, 15.5, 2, 2.6, 7, "baffle"],
  // Opposite garden islands bend the outer lanes around their ends.
  [0, -26, 7, 3, 5, "garden"],
  [0, 26, 7, 3, 5, "garden"],
  // Waist-high inner planters reward peeking; four broad crosscuts remain open.
  [-9, -7.5, 5, 1.25, 3, "planter"],
  [9, -7.5, 5, 1.25, 3, "planter"],
  [-9, 7.5, 5, 1.25, 3, "planter"],
  [9, 7.5, 5, 1.25, 3, "planter"],
  [-8, -23, 3, 1.25, 3, "planter"],
  [8, -23, 3, 1.25, 3, "planter"],
  [-8, 23, 3, 1.25, 3, "planter"],
  [8, 23, 3, 1.25, 3, "planter"],
];

export function addVerdantArena(colliders: Collider[], x: number, z: number) {
  for (const [dx, dz, w, h, d, role] of VERDANT_LAYOUT)
    colliders.push({
      x: x + dx,
      y: h / 2,
      z: z + dz,
      w,
      h,
      d,
      material: role === "core" ? "metal" : "concrete",
      kind: "verdant-" + role,
    });
}

// Two sheltered deployment strips sized for the compact arena.
export function verdantSpawnCandidates(
  team: "blue" | "red",
  centerX = -60,
  centerZ = -175,
) {
  const sign = team === "blue" ? -1 : 1;
  return [24, 27].flatMap((x) =>
    [-29, -25, -4, 4, 25, 29].map((z) => ({
      x: centerX + sign * x,
      y: 0,
      z: centerZ + z,
    })),
  );
}

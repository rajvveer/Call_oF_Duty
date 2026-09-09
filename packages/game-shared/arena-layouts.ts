import { ARENAS } from "./arenas";
import { addVerdantArena } from "./verdant";

export const EXTRA_ARENAS = Object.values(ARENAS).filter(
  (a) => a.id !== "harbor",
);

export const inExtraArena = (x: number, z: number, margin = 0) =>
  EXTRA_ARENAS.some(
    (a) =>
      x >= a.minX - margin &&
      x <= a.maxX + margin &&
      z >= a.minZ - margin &&
      z <= a.maxZ + margin,
  );

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
type Building = {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
  style: number;
};
type Prop = {
  x: number;
  y: number;
  z: number;
  type: string;
  scale: number;
  angle: number;
};

export function addExtraArenas(
  buildings: Building[],
  colliders: Collider[],
  props: Prop[],
) {
  const wall = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: Collider["material"] = "concrete",
    kind = "wall",
  ) => colliders.push({ x, y, z, w, h, d, material, kind });
  const cover = (
    x: number,
    z: number,
    w = 4,
    d = 1.4,
    h = 1.3,
    material: Collider["material"] = "concrete",
  ) => wall(x, h / 2, z, w, h, d, material, "cover");
  const stairs = (x: number, z: number, height: number) => {
    for (let k = 0; k < Math.ceil(height / 0.25); k++) {
      const h = Math.min(height, (k + 1) * 0.25);
      wall(x, h / 2, z + k * 0.48, 2.2, h, 0.5, "concrete", "stairs");
    }
  };
  // Four entrances keep every room connected to both team approaches.
  const house = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    style: number,
    roofAccess = true,
  ) => {
    buildings.push({ x, z, y: 0, w, d, h, style });
    wall(x, -0.15, z, w, 0.3, d, "concrete", "floor");
    const door = 4;
    for (const sign of [-1, 1]) {
      for (const side of [-1, 1]) {
        const span = (w - door) / 2;
        wall(
          x + side * (door / 2 + span / 2),
          h / 2,
          z + (sign * d) / 2,
          span,
          h,
          0.45,
        );
        const depth = (d - door) / 2;
        wall(
          x + (sign * w) / 2,
          h / 2,
          z + side * (door / 2 + depth / 2),
          0.45,
          h,
          depth,
        );
      }
      wall(x, 3.2 + (h - 3.2) / 2, z + (sign * d) / 2, door, h - 3.2, 0.45);
      wall(x + (sign * w) / 2, 3.2 + (h - 3.2) / 2, z, 0.45, h - 3.2, door);
    }
    wall(x, h + 0.1, z, w + 0.5, 0.25, d + 0.5, "metal", "roof");
    if (roofAccess) stairs(x + w / 2 + 1.4, z - d / 2, h);
  };
  const container = (x: number, z: number, floor = 0) =>
    wall(x, floor + 2.1, z, 6, 4.2, 12, "metal", "container");
  const rock = (x: number, z: number, scale: number) => {
    // Renderer uses these exact scale ratios. Zero yaw preserves AABB alignment.
    props.push({ x, y: 0, z, type: "rock", scale, angle: 0 });
    wall(
      x,
      scale * 0.25,
      z,
      scale * 0.6,
      scale * 0.5,
      scale * 0.65,
      "concrete",
      "rock",
    );
  };

  for (const a of EXTRA_ARENAS) {
    const x = (a.minX + a.maxX) / 2,
      z = (a.minZ + a.maxZ) / 2;
    for (const xx of [a.minX, a.maxX])
      wall(xx, 4, z, 1.2, 8, a.maxZ - a.minZ, "concrete", "perimeter");
    for (const zz of [a.minZ, a.maxZ])
      wall(x, 4, zz, a.maxX - a.minX, 8, 1.2, "concrete", "perimeter");
    // Cover in front of deployment strips, with alternating openings. Both
    if (a.id === "verdant") {
      addVerdantArena(colliders, x, z);
      continue;
    }
    // x=min+10 and x=max-10 stay clear at every z, not only the six spawn rows.
    for (const side of [-1, 1])
      for (const dz of [-54, -18, 18, 54])
        cover(x + side * 44, z + dz, 2.2, 7, 2.1, "concrete");

    if (a.id === "foundry") {
      house(x, z, 48, 34, 8, 1);
      for (const dx of [-15, 15])
        for (const dz of [-10, 10])
          wall(x + dx, 4, z + dz, 1.2, 8, 1.2, "metal", "column");
      // Offset presses block a direct firing line through opposing doorways.
      cover(x - 5, z - 3, 8, 4, 2.4, "metal");
      cover(x + 6, z + 5, 7, 4, 2.1, "metal");
      cover(x, z, 2.4, 3, 2.5, "metal");
      house(x - 24, z - 51, 18, 14, 4.5, 3);
      house(x + 24, z + 51, 18, 14, 4.5, 1);
      for (const side of [-1, 1]) {
        container(x + side * 28, z + side * -48);
        cover(x - side * 18, z + side * 36, 8, 3, 2, "metal");
        cover(x + side * 34, z, 3, 10, 1.3, "concrete");
      }
    } else if (a.id === "railyard") {
      for (const dx of [-28, 0, 28]) {
        for (const side of [-1, 1])
          wall(x + dx + side * 1.45, 0.04, z, 0.13, 0.08, 142, "metal", "rail");
        for (let dz = -70; dz <= 70; dz += 5)
          wall(x + dx, 0.025, z + dz, 3.6, 0.05, 0.24, "wood", "sleeper");
        for (const dz of [-56, -28, 0, 28, 56]) container(x + dx, z + dz);
      }
      // Container access adds a short elevated option above the crosscuts.
      stairs(x - 23.5, z - 6, 4.2);
      stairs(x + 32.5, z - 6, 4.2);
      house(x, z + 71, 22, 10, 4.5, 3, false);
      for (const dx of [-14, 14]) {
        cover(x + dx, z - 42, 3, 2, 1.2, "wood");
        cover(x + dx, z + 42, 3, 2, 1.2, "wood");
      }
    } else if (a.id === "citadel") {
      for (const dx of [-30, 0, 30])
        for (const dz of [-44, 0, 44]) {
          if (dx === 0 && dz === 0) continue;
          const h = dx === 0 ? 6 : dz === 0 ? 5.25 : 4.5;
          house(x + dx, z + dz, 14, 18, h, dx === 0 ? 2 : dz === 0 ? 0 : 3);
          cover(x + dx - 3, z + dz + 4, 2.4, 1.2, 1.15, "wood");
        }
      // Open central courtyard, crossed streets, and small blast planters.
      cover(x, z, 5, 5, 1.4, "concrete");
      for (const dx of [-14, 14])
        for (const dz of [-24, 24])
          cover(x + dx, z + dz, 3.5, 2, 1.2, "concrete");
    } else {
      // Deliberate rock clusters create three curved mining routes. The tall
      // central formations break long views; low stockpiles support peeking.
      for (const [dx, dz, size] of [
        [-24, -53, 22],
        [13, -56, 17],
        [-30, -22, 17],
        [21, -24, 23],
        [-15, 10, 24],
        [24, 9, 18],
        [-27, 45, 20],
        [15, 42, 23],
        [0, -34, 9],
        [4, 27, 10],
      ])
        rock(x + dx, z + dz, size);
      house(x, z + 67, 18, 12, 4.5, 2, false);
      for (const side of [-1, 1]) {
        cover(x + side * 34, z - side * 7, 4, 3, 1.4, "wood");
        container(x + side * 32, z + side * 68);
        cover(x - side * 5, z + side * 65, 3, 1.3, 1.2, "metal");
      }
    }
  }
}

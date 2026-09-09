import { VERDANT_ARENA } from "./verdant";
export type MapId =
  "harbor" | "foundry" | "railyard" | "citadel" | "quarry" | "verdant";
export type Arena = {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  color: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
export const ARENAS: Record<MapId, Arena> = {
  verdant: VERDANT_ARENA,
  harbor: {
    id: "harbor",
    name: "SABLE HARBOR",
    subtitle: "CONTAINERS / WAREHOUSES",
    description: "Open loading yard, warehouse windows and container flanks.",
    color: "#6bc9ee",
    minX: -64,
    maxX: 72,
    minZ: -108,
    maxZ: 58,
  },
  foundry: {
    id: "foundry",
    name: "THE FOUNDRY",
    subtitle: "FACTORY / CLOSE QUARTERS",
    description:
      "A central factory floor, machinery cover and tight service lanes.",
    color: "#e5a05c",
    minX: -258,
    maxX: -122,
    minZ: -274,
    maxZ: -108,
  },
  railyard: {
    id: "railyard",
    name: "SWITCHYARD",
    subtitle: "FREIGHT LANES / LONG SIGHTLINES",
    description: "Three freight lanes with cross routes between the cars.",
    color: "#dca1a3",
    minX: 118,
    maxX: 254,
    minZ: -258,
    maxZ: -92,
  },
  citadel: {
    id: "citadel",
    name: "CITADEL",
    subtitle: "STREETS / ROOFTOPS",
    description:
      "Urban blocks, narrow streets and accessible rooftop positions.",
    color: "#a6cdba",
    minX: 118,
    maxX: 254,
    minZ: 58,
    maxZ: 224,
  },
  quarry: {
    id: "quarry",
    name: "SLATE QUARRY",
    subtitle: "ROCK COVER / OPEN GROUND",
    description:
      "Mining equipment and massive rock formations divide an open pit.",
    color: "#ccb186",
    minX: -282,
    maxX: -146,
    minZ: 22,
    maxZ: 188,
  },
};
export const MAP_IDS = Object.keys(ARENAS) as MapId[];
export function arenaFor(id: string | undefined): Arena {
  return ARENAS[id as MapId] || ARENAS.harbor;
}
export function arenaCenter(id: string | undefined) {
  const a = arenaFor(id);
  return { x: (a.minX + a.maxX) / 2, z: (a.minZ + a.maxZ) / 2 };
}

"use client";
import { useEffect, useRef } from "react";
import { ARENAS, MAP_IDS, type MapId } from "../packages/game-shared/arenas";
import { colliders } from "../packages/game-shared/map";

function LayoutPreview({ id }: { id: MapId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const a = ARENAS[id],
      w = 320,
      h = 160,
      scale = Math.min(300 / (a.maxX - a.minX), 146 / (a.maxZ - a.minZ));
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a1721";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(a.minX + a.maxX) / 2, -(a.minZ + a.maxZ) / 2);
    ctx.fillStyle = id === "quarry" ? "#6f6650" : "#34444d";
    ctx.fillRect(a.minX, a.minZ, a.maxX - a.minX, a.maxZ - a.minZ);
    ctx.fillStyle = "#4285a1";
    ctx.fillRect(a.minX + 3, a.minZ + 3, 12, a.maxZ - a.minZ - 6);
    ctx.fillStyle = "#a36963";
    ctx.fillRect(a.maxX - 15, a.minZ + 3, 12, a.maxZ - a.minZ - 6);
    for (const c of colliders) {
      if (
        c.x < a.minX ||
        c.x > a.maxX ||
        c.z < a.minZ ||
        c.z > a.maxZ ||
        ["floor", "stairs", "sleeper"].includes(c.kind || "")
      )
        continue;
      ctx.fillStyle =
        c.kind === "rock"
          ? "#b6ae96"
          : c.kind === "container"
            ? "#b69f79"
            : c.kind === "roof"
              ? "#93a4ad"
              : "#bcc7c9";
      ctx.fillRect(c.x - c.w / 2, c.z - c.d / 2, c.w, c.d);
    }
    ctx.restore();
  }, [id]);
  return (
    <canvas
      ref={canvas}
      width={320}
      height={160}
      aria-label={ARENAS[id].name + " layout"}
    />
  );
}

export function MapPicker({
  selected,
  onSelect,
}: {
  selected: MapId;
  onSelect: (id: MapId) => void;
}) {
  return (
    <aside className="map-selection-panel">
      <div className="map-selection-heading">
        <span className="eyebrow">CHOOSE BATTLEGROUND</span>
        <b>{MAP_IDS.length} MAPS</b>
      </div>
      <div className="map-cards">
        {MAP_IDS.map((id) => (
          <button
            key={id}
            className={"map-card " + (selected === id ? "chosen" : "")}
            onClick={() => onSelect(id)}
            aria-label={"Select " + ARENAS[id].name}
          >
            <LayoutPreview id={id} />
            <div>
              <h3>{ARENAS[id].name}</h3>
              <span>{ARENAS[id].subtitle}</span>
            </div>
            {selected === id && <b className="map-selected-label">SELECTED</b>}
          </button>
        ))}
      </div>
      <p>{ARENAS[selected].description}</p>
    </aside>
  );
}

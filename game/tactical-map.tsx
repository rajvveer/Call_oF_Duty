"use client";
import { useEffect, useRef, useState } from "react";
import {
  buildings,
  colliders,
  groundHeight,
} from "../packages/game-shared/map";
import { POIS, arenaFor, arenaCenter } from "../packages/game-shared/data";
import type { Snapshot } from "../packages/game-shared/protocol";
const backgrounds = new Map<string, HTMLCanvasElement>();
function mapBackground(id: string) {
  const cached = backgrounds.get(id);
  if (cached) return cached;
  const image = document.createElement("canvas");
  image.width = image.height = 1360;
  const ctx = image.getContext("2d")!,
    arena = arenaFor(id);
  ctx.scale(2, 2);
  ctx.translate(340, 340);
  for (let x = -340; x < 340; x += 12)
    for (let z = -340; z < 340; z += 12) {
      const h = groundHeight(x, z);
      ctx.fillStyle =
        h < -5 ? "#25434a" : h > 8 ? "#626e55" : h > 1 ? "#596953" : "#485a48";
      ctx.fillRect(x, z, 12.2, 12.2);
    }
  ctx.strokeStyle = "#293b34";
  ctx.lineWidth = 8;
  for (const p of POIS) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(p.x, p.z);
    ctx.stroke();
  }
  ctx.fillStyle = "#b5ad8e";
  for (const b of buildings) {
    ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
    ctx.strokeStyle = "#343f36";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
  }
  ctx.fillStyle = "#172330";
  ctx.fillRect(arena.minX, arena.minZ, 9, arena.maxZ - arena.minZ);
  ctx.fillStyle = "#245876";
  ctx.fillRect(arena.minX + 1, arena.minZ + 1, 8, arena.maxZ - arena.minZ - 2);
  ctx.fillStyle = "#784138";
  ctx.fillRect(arena.maxX - 9, arena.minZ + 1, 8, arena.maxZ - arena.minZ - 2);
  ctx.strokeStyle = "#cad7de";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    arena.minX,
    arena.minZ,
    arena.maxX - arena.minX,
    arena.maxZ - arena.minZ,
  );
  ctx.fillStyle = "#8498a1";
  for (const c of colliders.filter(
    (c) => c.kind === "container" || c.kind === "cover",
  ))
    ctx.fillRect(c.x - c.w / 2, c.z - c.d / 2, c.w, c.d);
  backgrounds.set(id, image);
  return image;
}
export function TacticalMap({
  snapshot,
  mini = false,
  onPing,
}: {
  snapshot: Snapshot;
  mini?: boolean;
  onPing?: (x: number, z: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drag = useRef<{ x: number; y: number; panX: number; panZ: number } | null>(
      null,
    );
  const [zoom, setZoom] = useState(3.4),
    [pan, setPan] = useState(arenaCenter(snapshot.map));
  const size = mini ? 240 : 720,
    scale = mini ? 4 : zoom,
    center = mini ? snapshot.you : pan;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#18343a";
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale((size / 680) * scale, (size / 680) * scale);
    ctx.translate(-center.x, -center.z);
    ctx.drawImage(mapBackground(snapshot.map), -340, -340, 680, 680);
    for (const e of snapshot.entities)
      if (
        e.alive &&
        (e.team === snapshot.you.team ||
          snapshot.you.scanUntil > snapshot.time ||
          e.firing)
      ) {
        ctx.fillStyle = e.team === "blue" ? "#67cfff" : "#ff816f";
        ctx.beginPath();
        ctx.arc(e.x, e.z, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    for (const p of snapshot.teamPings || []) {
      ctx.strokeStyle = "#f4d378";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.z - 7);
      ctx.lineTo(p.x + 5, p.z);
      ctx.lineTo(p.x, p.z + 7);
      ctx.lineTo(p.x - 5, p.z);
      ctx.closePath();
      ctx.stroke();
      if (!mini) {
        ctx.font = "9px Arial";
        ctx.fillStyle = "#f4d378";
        ctx.fillText(p.name, p.x + 7, p.z);
      }
    }
    ctx.translate(snapshot.you.x, snapshot.you.z);
    ctx.rotate(-snapshot.you.yaw);
    ctx.fillStyle = "#eef6e9";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#c5c7b512";
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i * size) / 8, 0);
      ctx.lineTo((i * size) / 8, size);
      ctx.moveTo(0, (i * size) / 8);
      ctx.lineTo(size, (i * size) / 8);
      ctx.stroke();
    }
  }, [snapshot, mini, size, scale, center.x, center.z]);
  return (
    <div className={mini ? "minimap-canvas" : "tactical-canvas"}>
      <canvas
        ref={canvas}
        width={size}
        height={size}
        aria-label={
          mini ? "Minimap" : "Tactical map. Click to place a ping; drag to pan."
        }
        onWheel={(e) => {
          if (!mini)
            setZoom((z) => Math.max(2, Math.min(6, z - e.deltaY * 0.001)));
        }}
        onPointerDown={(e) => {
          if (!mini) {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              panX: pan.x,
              panZ: pan.z,
            };
          }
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            setPan({
              x:
                drag.current.panX -
                ((e.clientX - drag.current.x) * 680) / rect.width / scale,
              z:
                drag.current.panZ -
                ((e.clientY - drag.current.y) * 680) / rect.height / scale,
            });
          }
        }}
        onPointerUp={(e) => {
          if (!mini && drag.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            if (
              Math.hypot(
                e.clientX - drag.current.x,
                e.clientY - drag.current.y,
              ) < 5
            )
              onPing?.(
                ((e.clientX - rect.left - rect.width / 2) * 680) /
                  rect.width /
                  scale +
                  center.x,
                ((e.clientY - rect.top - rect.height / 2) * 680) /
                  rect.height /
                  scale +
                  center.z,
              );
            drag.current = null;
          }
        }}
      />
      {!mini && (
        <div className="map-zoom">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(2, z - 0.25))}
          >
            −
          </button>
          <span>{zoom.toFixed(2)}×</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(6, z + 0.25))}
          >
            +
          </button>
          <button
            onClick={() => {
              setPan(arenaCenter(snapshot.map));
              setZoom(3.4);
            }}
          >
            RESET
          </button>
        </div>
      )}
    </div>
  );
}

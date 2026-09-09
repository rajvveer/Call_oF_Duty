"use client";
import { useCallback, useEffect, useState } from "react";
import { gameServerUrl } from "./server-url";
import type { MapId } from "../packages/game-shared/arenas";

type Room = {
  code: string;
  map: MapId;
  mapName: string;
  phase: string;
  round: number;
  humans: number;
  reserved: number;
  capacity: number;
  bots: number;
  joinable: boolean;
  scores: { blue: number; red: number };
};

export function Lobby({
  server,
  onJoin,
  onCreate,
}: {
  server: string;
  onJoin: (room: string, map: MapId) => void;
  onCreate: () => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [code, setCode] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const base = await gameServerUrl(server, signal);
        const url = new URL(base);
        url.protocol = url.protocol === "wss:" ? "https:" : "http:";
        url.pathname = "/rooms";
        url.search = "";
        const response = await fetch(url, { signal });
        if (!response.ok) throw Error("The game server is unavailable.");
        const data = (await response.json()) as { rooms?: Room[] };
        if (!Array.isArray(data.rooms))
          throw Error("This server does not support the room browser.");
        setRooms(data.rooms);
        setError("");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [server],
  );
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void refresh(controller.signal), 0);
    const timer = setInterval(() => void refresh(controller.signal), 2500);
    return () => {
      controller.abort();
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  return (
    <div className="lobby">
      <p className="panel-intro">
        Join a live room on this game server. Room codes use the host&apos;s
        map. Empty places are filled by AI.
      </p>
      <div className="lobby-actions">
        <button className="secondary-button" onClick={onCreate}>
          QUICK JOIN / CREATE ROOM
        </button>
        <button className="secondary-button" onClick={() => void refresh()}>
          REFRESH
        </button>
      </div>
      <form
        className="lobby-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onJoin(code.trim().toUpperCase(), "harbor");
        }}
      >
        <label htmlFor="lobby-code">JOIN BY CODE</label>
        <input
          id="lobby-code"
          aria-label="Multiplayer room code"
          maxLength={24}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ROOM CODE"
        />
        <button className="secondary-button" disabled={!code.trim()}>
          JOIN ROOM
        </button>
      </form>
      {error && (
        <p role="alert" className="lobby-error">
          {error}
        </p>
      )}
      {loading && <p>Looking for rooms...</p>}
      {!loading && !error && !rooms.length && (
        <div className="lobby-empty">
          No rooms yet. Create a match and share its code with your friends.
        </div>
      )}
      <div className="room-list">
        {rooms.map((room) => (
          <article key={room.code} className="room-card">
            <div>
              <span className="eyebrow">
                {room.phase.toUpperCase()} / ROUND {room.round}
              </span>
              <h3>{room.mapName}</h3>
              <code>{room.code}</code>
            </div>
            <div className="room-players">
              <b>
                {room.humans}/{room.capacity}
              </b>
              <span>
                PLAYERS · {room.bots} AI
                {room.reserved ? ` · ${room.reserved} RECONNECTING` : ""}
              </span>
            </div>
            <div className="room-score">
              <span>{room.scores.blue} BLUE</span>
              <span>{room.scores.red} RED</span>
            </div>
            <button
              className="secondary-button"
              disabled={!room.joinable}
              onClick={() => onJoin(room.code, room.map)}
            >
              {room.joinable
                ? "JOIN MATCH"
                : room.phase === "finished"
                  ? "IN RESULTS"
                  : "ROOM FULL"}
            </button>
          </article>
        ))}
      </div>
      <p className="fine-print">
        On this computer, friends can use another browser. For computers on the
        same Wi-Fi, start the local LAN mode and open the host&apos;s LAN
        address. No public hosting is required.
      </p>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { arenaFor } from "../packages/game-shared/arenas";
import { Lobby } from "../game/lobby";
import { MapPicker } from "../game/map-picker";
import { WEAPONS } from "../packages/game-shared/data";
import {
  defaults,
  presets,
  readCareer,
  readSettings,
  type Career,
  type Settings,
} from "../game/settings";
import type { Engine, GameUI } from "../game/engine";
import { Arsenal } from "../game/arsenal";
import { HUD, Scoreboard } from "../game/hud";
import { TacticalMap } from "../game/tactical-map";
type Panel =
  | "operations"
  | "multiplayer"
  | "arsenal"
  | "operator"
  | "career"
  | "settings"
  | "controls"
  | "credits";
const initUI: GameUI = {
  scope: null,
  renderScale: 1,
  cpuMs: 0,
  loading: true,
  progress: 0.02,
  stage: "INITIALIZING ENGINE",
  connected: false,
  reconnecting: false,
  playing: false,
  paused: false,
  map: false,
  inventory: false,
  loadout: false,
  terminal: false,
  error: "",
  notice: "",
  hit: 0,
  headshot: false,
  damage: 0,
  damageAngle: 0,
  flash: 0,
  ads: false,
  prompt: "",
  grenade: "frag",
  snapshot: null,
  fps: 0,
  frameMs: 0,
  calls: 0,
  triangles: 0,
  backend: "INITIALIZING",
  ping: 0,
  networkKB: 0,
  rendered: 0,
  debug: false,
  recoil: 0,
};
export default function Home() {
  const mount = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null),
    recorded = useRef("");
  const [ui, setUI] = useState<GameUI>(initUI),
    [settings, setSettings] = useState<Settings>(defaults),
    [panel, setPanel] = useState<Panel>("operations"),
    [room, setRoom] = useState(""),
    [shareText, setShareText] = useState(""),
    [career, setCareer] = useState<Career>(() => ({
      matches: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      damage: 0,
      best: 0,
      playtime: 0,
      top5: 0,
    }));
  useEffect(() => {
    let cancelled = false;
    const saved = readSettings();
    const invite = new URL(location.href);
    const inviteRoom = invite.searchParams.get("room");
    if (inviteRoom)
      setRoom(inviteRoom.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24));
    const inviteMap = invite.searchParams.get("map");
    if (inviteMap && arenaFor(inviteMap).id === inviteMap)
      saved.mapId = arenaFor(inviteMap).id;
    setSettings(saved);
    setCareer(readCareer());
    import("../game/engine").then(async ({ Engine }) => {
      if (cancelled || !mount.current) return;
      const game = new Engine(mount.current, saved, (state) => {
        if (!cancelled) setUI(state);
      });
      engine.current = game;
      try {
        await game.init();
      } catch (e) {
        setUI((u) => ({
          ...u,
          loading: false,
          error:
            "Graphics or asset initialization failed: " + (e as Error).message,
        }));
      }
    });
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  const selectedArena = arenaFor(settings.mapId);
  const s = ui.snapshot,
    p = s?.you;
  useEffect(() => {
    if (
      !s ||
      s.phase !== "finished" ||
      recorded.current === `${s.room}:${s.round}`
    )
      return;
    recorded.current = `${s.room}:${s.round}`;
    const old = readCareer(),
      win = s.winnerTeam === s.you.team,
      next = {
        matches: old.matches + 1,
        wins: old.wins + (win ? 1 : 0),
        kills: old.kills + s.you.kills,
        deaths: old.deaths + s.you.deaths,
        damage: old.damage + Math.round(s.you.damage),
        best: Math.max(old.best, s.you.kills),
        playtime: old.playtime + Math.round(s.elapsed),
        top5: old.top5,
      };
    localStorage.setItem("ashvector-career", JSON.stringify(next));
    setCareer(next);
  }, [s, p?.alive]);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((previous) => {
      const next = { ...previous, [key]: value };
      localStorage.setItem("ashvector-settings", JSON.stringify(next));
      engine.current?.applySettings(next);
      return next;
    });
  };
  const preset = (value: Settings["preset"]) => {
    const next = { ...settings, ...presets[value], preset: value };
    setSettings(next);
    localStorage.setItem("ashvector-settings", JSON.stringify(next));
    engine.current?.applySettings(next);
  };
  const copyInvite = async (value: string) => {
    setShareText(value);
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      /* The visible field supports manual copy on insecure LAN origins. */
    }
  };
  const leave = () => {
    engine.current?.leave();
    setShareText("");
    setPanel("operations");
  };
  const join = (code = room.trim()) => {
    setShareText("");
    setRoom(code);
    setPanel("operations");
    recorded.current = "";
    void engine.current?.connect(code);
  };
  const open = (name: Panel) => {
    setPanel(name);
    engine.current?.audio.resume();
    engine.current?.audio.sound("ui");
  };
  const range = (
    label: string,
    key:
      | "scale"
      | "distance"
      | "fov"
      | "master"
      | "effectsVolume"
      | "ambience"
      | "sensitivity"
      | "adsSensitivity",
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="setting-row" key={key}>
      <span>{label}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => change(key, Number(e.target.value))}
      />
      <output>{settings[key].toFixed(step < 1 ? 2 : 0)}</output>
    </label>
  );
  const toggle = (
    label: string,
    key:
      | "adaptiveResolution"
      | "shadows"
      | "effects"
      | "vegetation"
      | "motion"
      | "invertY"
      | "crouchToggle",
  ) => (
    <label className="setting-row" key={key}>
      <span>{label}</span>
      <input
        aria-label={label}
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => change(key, e.target.checked)}
      />
    </label>
  );
  const controls = [
    ["W A S D", "Move"],
    ["MOUSE", "Look / aim"],
    ["LEFT CLICK", "Fire"],
    ["RIGHT CLICK", "Aim down sights"],
    ["SHIFT", "Sprint"],
    ["C / CTRL", "Crouch · sprint + crouch to slide"],
    ["SPACE", "Jump"],
    ["R", "Reload"],
    ["WHEEL / 1 2 3", "Primary / pistol / knife"],
    ["H", "Insert armor plate"],
    ["V", "Use healing syringe"],
    ["G", "Throw equipped grenade"],
    ["Q", "Cycle frag / smoke / flash"],
    ["M", "Tactical map / ping"],
    ["TAB", "Team scoreboard"],
    ["B", "Choose next respawn loadout / perk"],
    ["Z", "Cycle scope zoom"],
    ["I", "Inspect weapon"],
    ["SHIFT WHILE SCOPED", "Hold breath"],
    ["ESC", "Pause / release mouse"],
    ["F3", "Performance monitor"],
  ];
  const result = !!s && s.phase === "finished";
  return (
    <main className="game-shell">
      <div ref={mount} className="world-mount" />
      {!ui.playing && (
        <>
          <div className="menu-shade" />
          <header className="topbar">
            <button
              className="brand"
              onClick={leave}
              aria-label="ASHVECTOR home"
            >
              A<span>╱</span>V
            </button>
            <nav>
              {(
                [
                  "operations",
                  "multiplayer",
                  "arsenal",
                  "operator",
                  "career",
                ] as Panel[]
              ).map((name) => (
                <button
                  key={name}
                  className={panel === name ? "selected" : ""}
                  onClick={() => open(name)}
                >
                  {name.toUpperCase()}
                </button>
              ))}
            </nav>
            <div className="profile">
              <span className="online-dot" />
              {settings.name}{" "}
              <b>
                {String(1 + Math.floor(career.kills / 10)).padStart(2, "0")}
              </b>
            </div>
          </header>
          {panel === "operations" && (
            <>
              <section className="hero">
                <div className="eyebrow">
                  <span /> MULTIPLAYER <i /> TEAM DEATHMATCH
                </div>
                <h1>
                  ASHVECTOR<span>TEAM DEATHMATCH</span>
                </h1>
                <p>
                  Your team. Your loadout.
                  <br />
                  Hold your ground. Win the fight.
                </p>
                <div className="operation">
                  <span className="tiny">ACTIVE OPERATION</span>
                  <h2>{selectedArena.name} / TDM</h2>
                  <div className="tags">
                    6v6 <i /> FIRST TO 50 <i /> FAST RESPAWNS
                  </div>
                </div>
                <button
                  className="deploy"
                  disabled={ui.loading}
                  onClick={() => join()}
                >
                  {ui.loading ? "PREPARING OPERATION" : "FIND TDM MATCH"}
                  <span>↗</span>
                </button>
                <div className="join-room">
                  <label htmlFor="room">JOIN FRIENDS</label>
                  <input
                    id="room"
                    aria-label="Room code"
                    value={room}
                    maxLength={24}
                    placeholder="Room code · optional"
                    onChange={(e) => setRoom(e.target.value)}
                  />
                </div>
                <div className="server-status">
                  <span className="online-dot" />
                  {ui.loading
                    ? ui.stage
                    : "LOCAL PVP + AI · " + ui.backend + " READY"}
                </div>
              </section>
              <MapPicker
                selected={selectedArena.id}
                onSelect={(id) => change("mapId", id)}
              />
              <div className="coordinates">
                {selectedArena.name}
                <br />
                <b>41° 08′ N &nbsp; 17° 42′ E</b>
                <span>{selectedArena.subtitle}</span>
              </div>
            </>
          )}
          <footer className="menu-footer">
            <span>
              ASHVECTOR <b>FIELD BUILD / 0.2</b>
            </span>
            <div>
              <button onClick={() => open("controls")}>CONTROLS</button>
              <button onClick={() => open("settings")}>SETTINGS</button>
              <button onClick={() => open("credits")}>CREDITS</button>
            </div>
            <span>HEADPHONES RECOMMENDED ↗</span>
          </footer>
        </>
      )}
      {((!ui.playing && panel !== "operations") ||
        (ui.playing && panel === "settings")) && (
        <section
          className={"menu-panel " + (ui.playing ? "in-match-panel" : "")}
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                MERIDIAN FIELD MANUAL / 0
                {[
                  "arsenal",
                  "operator",
                  "career",
                  "settings",
                  "controls",
                  "credits",
                ].indexOf(panel) + 1}
              </span>
              <h2>
                {panel === "arsenal"
                  ? "YOUR ARSENAL"
                  : panel === "operator"
                    ? "SIGNAL OPERATORS"
                    : panel.toUpperCase()}
              </h2>
            </div>
            <button
              className="close-button"
              onClick={() => setPanel("operations")}
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          {panel === "multiplayer" && (
            <Lobby
              server={settings.server}
              onCreate={() => join("")}
              onJoin={(code, map) => {
                change("mapId", map);
                join(code);
              }}
            />
          )}
          {panel === "arsenal" && (
            <Arsenal settings={settings} onChange={change} />
          )}
          {panel === "operator" && (
            <div className="operator-panel">
              <div className="operator-emblem">
                A<span>╱</span>V<small>SIGNAL CORPS</small>
              </div>
              <div>
                <label className="field-label">
                  CALLSIGN
                  <input
                    value={settings.name}
                    maxLength={18}
                    onChange={(e) =>
                      change("name", e.target.value.replace(/[<>]/g, ""))
                    }
                    aria-label="Callsign"
                  />
                </label>
                <div className="operator-choices">
                  {(["sable", "ochre"] as const).map((o) => (
                    <button
                      key={o}
                      className={settings.operator === o ? "chosen" : ""}
                      onClick={() => change("operator", o)}
                    >
                      <h3>{o.toUpperCase()}</h3>
                      <span>
                        {o === "sable"
                          ? "SIGNAL CORPS · FIELD SPECIALIST"
                          : "PATHFINDER · COASTAL SURVEY"}
                      </span>
                      <p>
                        {o === "sable"
                          ? "When every network failed, Sable kept listening."
                          : "No extraction plan. Every route is a way forward."}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="fine-print">
                  Your callsign and operator identity appear to other players.
                  Guest profile saved on this browser.
                </p>
              </div>
            </div>
          )}
          {panel === "career" && (
            <>
              <p className="panel-intro">
                Your local field record. Results are recorded after each
                completed deployment.
              </p>
              <div className="career-grid">
                {[
                  ["MATCHES", career.matches],
                  ["VICTORIES", career.wins],
                  ["ELIMINATIONS", career.kills],
                  [
                    "K / D",
                    (career.kills / Math.max(1, career.deaths)).toFixed(2),
                  ],
                  ["DEATHS", career.deaths],
                  ["BEST KILLS", career.best],
                  ["DAMAGE DEALT", career.damage.toLocaleString()],
                  ["TIME IN FIELD", Math.round(career.playtime / 60) + " MIN"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          {panel === "settings" && (
            <div className="settings-grid">
              <div>
                <h3>GRAPHICS</h3>
                <div className="preset-buttons">
                  {(["low", "medium", "high", "ultra"] as const).map((v) => (
                    <button
                      key={v}
                      className={settings.preset === v ? "chosen" : ""}
                      onClick={() => preset(v)}
                    >
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
                {range("Resolution scale", "scale", 0.5, 1.5, 0.05)}
                {range("Render distance", "distance", 150, 650, 10)}
                {range("Field of view", "fov", 65, 110, 1)}
                {toggle("Adaptive resolution", "adaptiveResolution")}
                {toggle("Shadows", "shadows")}
                {toggle("Effects", "effects")}
                {toggle("Vegetation", "vegetation")}
                {toggle("Camera motion", "motion")}
                <label className="setting-row">
                  <span>Frame limit</span>
                  <select
                    aria-label="Frame limit"
                    value={settings.fpsLimit}
                    onChange={(e) => change("fpsLimit", Number(e.target.value))}
                  >
                    {[30, 60, 90, 120].map((v) => (
                      <option key={v} value={v}>
                        {v} FPS
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setting-row">
                  <span>Renderer · restart required</span>
                  <select
                    aria-label="Renderer"
                    value={settings.backend}
                    onChange={(e) =>
                      change("backend", e.target.value as Settings["backend"])
                    }
                  >
                    <option value="auto">WebGPU / auto fallback</option>
                    <option value="webgl">WebGL2</option>
                  </select>
                </label>
                <button
                  className="secondary-button"
                  onClick={() => {
                    if (document.fullscreenElement)
                      void document.exitFullscreen();
                    else
                      void document.documentElement
                        .requestFullscreen()
                        .catch(() => {});
                  }}
                >
                  TOGGLE FULLSCREEN
                </button>
                <button
                  className="text-button"
                  onClick={() => location.reload()}
                >
                  RESTART GRAPHICS ↗
                </button>
              </div>
              <div>
                <h3>AUDIO & CONTROLS</h3>
                {range("Master volume", "master", 0, 1, 0.05)}
                {range("Effects volume", "effectsVolume", 0, 1, 0.05)}
                {range("Environment volume", "ambience", 0, 1, 0.05)}
                {range("Mouse sensitivity", "sensitivity", 0.2, 3, 0.1)}
                {range("ADS sensitivity", "adsSensitivity", 0.2, 1.5, 0.05)}
                {toggle("Invert vertical aim", "invertY")}
                {toggle("Toggle crouch", "crouchToggle")}
                <h3>OPERATION</h3>
                <label className="setting-row">
                  <span>Bot difficulty</span>
                  <select
                    aria-label="Bot difficulty"
                    value={settings.difficulty}
                    onChange={(e) =>
                      change(
                        "difficulty",
                        e.target.value as Settings["difficulty"],
                      )
                    }
                  >
                    <option value="regular">Regular</option>
                    <option value="veteran">Veteran</option>
                  </select>
                </label>
                <label className="field-label">
                  GAME SERVER · OPTIONAL OVERRIDE
                  <input
                    aria-label="Game server"
                    placeholder="Automatic · or wss://your-server"
                    value={settings.server}
                    onChange={(e) => change("server", e.target.value)}
                  />
                </label>
                <p className="fine-print">
                  Settings save automatically. Difficulty applies when you
                  create an operation. Current renderer: {ui.backend}.
                </p>
              </div>
            </div>
          )}
          {panel === "controls" && (
            <>
              <p className="panel-intro">
                Mouse and keyboard required. Click Enter Operation to capture
                the mouse. Escape releases it.
              </p>
              <div className="controls-grid">
                {controls.map(([key, description]) => (
                  <div key={key}>
                    <kbd>{key}</kbd>
                    <span>{description}</span>
                  </div>
                ))}
              </div>
              <p className="fine-print">
                First team to 50 kills wins. Respawn after three seconds with
                your chosen loadout. Blue and red identify teams; a diamond
                marks your allies. Spawn protection ends when you fire or throw.
              </p>
            </>
          )}
          {panel === "credits" && (
            <div className="credits">
              <p>
                ASHVECTOR is an original team deathmatch shooter set in the
                Meridian Exclusion. Design, code, map architecture, procedural
                effects and interactive sound design created for this project.
              </p>
              <h3>ASSET CREATORS</h3>
              <p>
                <b>Quaternius</b> · Animated operator and Ultimate Guns Pack
                <br />
                <b>Kenney</b> · Industrial Kit, Nature Kit and supply containers
                <br />
                <b>Rob Tuytel / Poly Haven</b> · Aerial Grass Rock PBR terrain
                <br />
                <b>Geibu3D / Cheese Animal Productions</b> ·{" "}
                <a
                  href="https://opengameart.org/content/attack-chopper"
                  target="_blank"
                  rel="noreferrer"
                >
                  Attack Chopper
                </a>
                ,{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 4.0
                </a>
                . Converted to GLB, camouflage materials adjusted and rotors
                animated.
                <br />
                <b>Greg Zaal, Jarod Guest, Kless Gyzen / Poly Haven</b> · Sunset
                sky and moss rocks, CC0.
                <br />
                <b>
                  Tabasco, SpringySpringo, Brian MacIntosh, aquinn,
                  GboxMikeFozzy and LFA
                </b>{" "}
                · Recorded gunshots, mechanical handling, footsteps and rotor
                audio, CC0.
              </p>
              <p>
                Tactical arms and SMG: DJMaesen; grip/reload adaptations:
                AetherRadar. AK-74: Cransh and creationwasteland. Desert Eagle:
                ELIZION. Service pistol: arcade_b. These assets use CC BY 4.0.
              </p>
              <p>
                M4A1: nisu. AKM, Detective Special and Colt Lightning:
                LonesomeDucky. Hunting rifle: Lucian Pavel. Remington 870:
                MikeMoon. These models use CC0. Vanguard operator: Mixamo /
                Adobe, used under its royalty-free game-use terms. All sources,
                license links and modifications are in the ledger below.
              </p>
              <a
                className="secondary-button"
                href="/ASSET_LICENSES.md"
                target="_blank"
                rel="noreferrer"
              >
                READ FULL ASSET & LICENSE LEDGER ↗
              </a>
              <p>
                Built with Three.js, Rapier, React, Vite and Node.js. No assets,
                brands, maps, sounds or proprietary game files from Call of Duty
                or Warzone are used.
              </p>
            </div>
          )}
        </section>
      )}
      {ui.playing && s && <HUD ui={ui} />}
      {ui.loading && (
        <div className="boot-overlay">
          <span className="brand">
            A<span>╱</span>V
          </span>
          <div className="boot-content">
            <span className="eyebrow">ESTABLISHING TEAM DEATHMATCH</span>
            <h2>{selectedArena.name} / TDM</h2>
            <div className="load-line">
              <i style={{ width: ui.progress * 100 + "%" }} />
            </div>
            <div className="boot-status">
              <span>{ui.stage}</span>
              <b>{Math.round(ui.progress * 100)}%</b>
            </div>
            <p>6v6. First to 50 kills. Respawn and get back in the fight.</p>
          </div>
          <span className="boot-bottom">ASHVECTOR / FIELD BUILD 0.2</span>
        </div>
      )}
      {ui.playing && !s && !ui.error && (
        <div className="overlay">
          <div className="dialog">
            <span className="eyebrow">MATCHMAKING</span>
            <h2>CONNECTING TO {selectedArena.name}</h2>
            <p>Establishing your signal with the operation server.</p>
            <button className="secondary-button" onClick={leave}>
              CANCEL
            </button>
          </div>
        </div>
      )}
      {ui.paused &&
        s &&
        !ui.error &&
        !ui.reconnecting &&
        !result &&
        panel !== "settings" &&
        !ui.map &&
        !ui.inventory &&
        !ui.loadout &&
        !ui.terminal && (
          <div className="overlay">
            <div className="dialog">
              <span className="eyebrow">
                {s.phase === "warmup"
                  ? "WARMUP / " +
                    Math.max(0, Math.ceil(s.phaseEnd - s.time)) +
                    "s"
                  : "OPERATION CONTINUES"}
              </span>
              <h2>
                {s.phase === "warmup"
                  ? "SIGNAL ESTABLISHED"
                  : "STAY ON FREQUENCY"}
              </h2>
              <p>
                Room <b>{s.room}</b> · {s.humans} human{" "}
                {s.humans === 1 ? "operator" : "operators"} ·{" "}
                {s.total - s.humans} AI combatants
              </p>
              <p className="fine-print">
                WASD move · Mouse aim · Shift sprint · Tab scoreboard
                <br />
                The match continues while the mouse is released.
              </p>
              <button
                className="deploy"
                onClick={() => engine.current?.resume()}
              >
                {s.phase === "warmup" ? "ENTER OPERATION" : "RESUME OPERATION"}
                <span>↗</span>
              </button>
              <div className="dialog-actions">
                <button onClick={() => void copyInvite(s.room)}>
                  COPY ROOM CODE
                </button>
                <button
                  onClick={() => {
                    const link = new URL(location.origin + location.pathname);
                    link.searchParams.set("room", s.room);
                    link.searchParams.set("map", s.map);
                    void copyInvite(link.toString());
                  }}
                >
                  COPY INVITE LINK
                </button>
                {ui.pointerError && (
                  <button onClick={() => engine.current?.fallbackResume()}>
                    PLAY WITH DRAG AIM
                  </button>
                )}
                {shareText && (
                  <input
                    className="share-output"
                    aria-label="Share room link or code"
                    readOnly
                    value={shareText}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                )}
                <button onClick={() => open("settings")}>SETTINGS</button>
                <button onClick={leave}>LEAVE OPERATION</button>
              </div>
            </div>
          </div>
        )}
      {ui.reconnecting && (
        <div className="overlay">
          <div className="dialog">
            <span className="eyebrow">RECONNECTING</span>
            <h2>RESTORING YOUR SESSION</h2>
            <p>
              Your team, score and equipment are reserved briefly while the
              connection returns.
            </p>
            <button className="secondary-button" onClick={leave}>
              LEAVE MATCH
            </button>
          </div>
        </div>
      )}
      {ui.error && (
        <div className="overlay error-overlay">
          <div className="dialog">
            <span className="eyebrow">SIGNAL INTERRUPTED</span>
            <h2>CONNECTION CHECK</h2>
            <p>{ui.error}</p>
            <button
              className="deploy"
              onClick={ui.playing ? () => join() : () => location.reload()}
            >
              RETRY <span>↗</span>
            </button>
            <button className="text-button" onClick={leave}>
              RETURN TO OPERATIONS
            </button>
          </div>
        </div>
      )}
      {ui.loadout && s && (
        <div className="overlay arsenal-overlay">
          <section className="arsenal-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">TDM / NEXT RESPAWN</span>
                <h2>CHOOSE YOUR WEAPON</h2>
              </div>
              <button
                className="close-button"
                aria-label="Close loadout"
                onClick={() => engine.current?.closeOverlay()}
              >
                ?
              </button>
            </div>
            <Arsenal settings={settings} onChange={change} playing />
            <button
              className="secondary-button"
              onClick={() => engine.current?.closeOverlay()}
            >
              BACK TO THE FIGHT
            </button>
          </section>
        </div>
      )}
      {ui.inventory && s && (
        <div className="overlay scoreboard-overlay">
          <section className="scoreboard-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  {arenaFor(s.map).name} / FIRST TO {s.scoreLimit}
                </span>
                <h2>TEAM SCOREBOARD</h2>
              </div>
              <button
                className="close-button"
                aria-label="Close scoreboard"
                onClick={() => engine.current?.closeOverlay()}
              >
                ×
              </button>
            </div>
            <Scoreboard snapshot={s} />
            <p className="fine-print">TAB TO RETURN · MATCH CONTINUES</p>
          </section>
        </div>
      )}
      {ui.map && s && (
        <div className="overlay map-overlay">
          <section className="map-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">MERIDIAN / TACTICAL OVERVIEW</span>
                <h2>{s ? arenaFor(s.map).name : selectedArena.name}</h2>
              </div>
              <button
                className="close-button"
                aria-label="Close map"
                onClick={() => engine.current?.closeOverlay()}
              >
                ×
              </button>
            </div>
            <div className="map-layout">
              <TacticalMap
                snapshot={s}
                onPing={(x, z) => engine.current?.ping(x, z)}
              />
              <aside>
                <h3>{s.room}</h3>
                <p>
                  {s.scores.blue} BLUE / {s.scores.red} RED
                </p>
                <div className="map-legend">
                  <span>■ BLUE TEAM</span>
                  <span>■ RED TEAM</span>
                  <span>◆ YOUR PING</span>
                  <span>■ COVER / BUILDINGS</span>
                </div>
                <p className="fine-print">
                  Click to ping. Drag to pan. Scroll to zoom. Allies stay
                  visible. Enemy signals appear during gunfire.
                </p>
                {s.you.weapons.map((slot, i) => (
                  <div className="inventory-slot" key={i}>
                    <span>SLOT {i + 1}</span>
                    <h3>{WEAPONS[slot.id].name}</h3>
                    <p>
                      {slot.ammo} / {slot.reserve} ROUNDS
                    </p>
                    <button
                      onClick={() => engine.current?.action("swap", String(i))}
                    >
                      EQUIP
                    </button>
                  </div>
                ))}

                <p>{s.you.plates} ARMOR PLATES</p>
              </aside>
            </div>
          </section>
        </div>
      )}
      {result && s && (
        <div
          className={
            "overlay results-overlay " +
            (s.winnerTeam === s.you.team ? "victory" : "")
          }
        >
          <div className="results">
            <span className="eyebrow">
              {s.winnerTeam === s.you.team
                ? "MERIDIAN IS YOURS"
                : "OPERATION COMPLETE"}
            </span>
            <h2>
              {s.winnerTeam === s.you.team
                ? "VICTORY"
                : s.winnerTeam
                  ? "DEFEAT"
                  : "DRAW"}
            </h2>
            <p>
              {s.winnerTeam === s.you.team
                ? "Your team secured " + arenaFor(s.map).name + "."
                : "The match is over. Gear up for the next round."}
            </p>
            <div className="result-stats">
              <div>
                <b>{s.you.deaths}</b>
                <span>DEATHS</span>
              </div>
              <div>
                <b>{s.you.kills}</b>
                <span>ELIMINATIONS</span>
              </div>
              <div>
                <b>{Math.round(s.you.damage)}</b>
                <span>DAMAGE DEALT</span>
              </div>
            </div>
            <Scoreboard snapshot={s} />
            <button
              className="deploy"
              disabled={s.rematchReady.includes(s.you.id)}
              onClick={() => engine.current?.action("rematch")}
            >
              {s.rematchReady.includes(s.you.id)
                ? "WAITING FOR PLAYERS"
                : "READY FOR REMATCH"}{" "}
              <span>
                {s.rematchReady.length}/{s.humans}
              </span>
            </button>
            <button className="deploy" onClick={leave}>
              RETURN TO OPERATIONS <span>↗</span>
            </button>
          </div>
        </div>
      )}
      {ui.debug && (
        <pre className="performance-overlay" aria-label="Performance monitor">
          {"ASHVECTOR / TELEMETRY\n" +
            ui.backend +
            " · " +
            ui.fps +
            " FPS · " +
            ui.frameMs.toFixed(1) +
            " ms\nDraw calls " +
            ui.calls +
            " · Triangles " +
            ui.triangles.toLocaleString() +
            "\nNetwork " +
            ui.networkKB +
            " KB/s · RTT " +
            ui.ping +
            " ms\nServer 60 Hz · " +
            (s?.tickMs.toFixed(2) || "—") +
            " ms/tick\nRendered " +
            ui.rendered +
            " · Networked " +
            (s?.entities.length || 0) +
            "\nBots " +
            (s ? s.total - s.humans : 0) +
            " · Grenades " +
            (s?.projectiles.length || 0)}
        </pre>
      )}
    </main>
  );
}

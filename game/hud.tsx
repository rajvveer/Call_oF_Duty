"use client";
import { ScopeOverlay } from "./scope-overlay";
import { perkFor, HEAL_DURATION } from "../packages/game-shared/combat";
import { WEAPONS, arenaFor } from "../packages/game-shared/data";
import type { Snapshot } from "../packages/game-shared/protocol";
import type { GameUI } from "./engine";
import { TacticalMap } from "./tactical-map";

const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${(Math.ceil(Math.max(0, seconds)) % 60).toString().padStart(2, "0")}`;

export function Scoreboard({ snapshot: s }: { snapshot: Snapshot }) {
  return (
    <div className="team-rosters">
      {(["blue", "red"] as const).map((team) => (
        <section className={`team-roster ${team}`} key={team}>
          <h3>
            {team.toUpperCase()} TEAM <strong>{s.scores[team]}</strong>
          </h3>
          <table>
            <thead>
              <tr>
                <th>OPERATOR</th>
                <th>K</th>
                <th>D</th>
                <th>A</th>
                <th>K/D</th>
              </tr>
            </thead>
            <tbody>
              {s.scoreboard
                .filter((p) => p.team === team)
                .map((p) => (
                  <tr key={p.id} className={p.id === s.you.id ? "you" : ""}>
                    <td>
                      {p.name}{" "}
                      <small>
                        {p.id === s.you.id ? "YOU" : p.bot ? "AI" : "PVP"}
                      </small>
                    </td>
                    <td>{p.kills}</td>
                    <td>{p.deaths}</td>
                    <td>{p.assists}</td>
                    <td>{(p.kills / Math.max(1, p.deaths)).toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export function HUD({ ui }: { ui: GameUI }) {
  const s = ui.snapshot;
  if (!s) return null;
  const p = s.you,
    slot = p.weapons[p.selected],
    w = WEAPONS[slot.id];
  const seconds = Math.ceil(s.phaseEnd - s.time);
  const heading = ((Math.round((-p.yaw * 180) / Math.PI) % 360) + 360) % 360;
  return (
    <div className="hud" aria-label="Team deathmatch HUD">
      {ui.scope && <ScopeOverlay scope={ui.scope} />}
      <div className="tdm-scorebar">
        <div className="team-score blue">
          <span>BLUE {p.team === "blue" && " / YOU"}</span>
          <b>{s.scores.blue.toString().padStart(2, "0")}</b>
          <progress max={s.scoreLimit} value={s.scores.blue} />
        </div>
        <div className="match-clock">
          <span>{s.phase === "warmup" ? "WARMUP" : "TEAM DEATHMATCH"}</span>
          <b>{clock(seconds)}</b>
          <small>FIRST TO {s.scoreLimit}</small>
        </div>
        <div className="team-score red">
          <span>RED {p.team === "red" && " / YOU"}</span>
          <b>{s.scores.red.toString().padStart(2, "0")}</b>
          <progress max={s.scoreLimit} value={s.scores.red} />
        </div>
      </div>
      <div className="compass">
        <span>NW</span>
        <i />
        <span>N</span>
        <i />
        <b>{heading.toString().padStart(3, "0")}°</b>
        <i />
        <span>NE</span>
        <i />
        <span>E</span>
      </div>
      <div className="hud-left">
        <div className="minimap-header">
          <span>{arenaFor(s.map).name}</span>
          <span>N ↑</span>
        </div>
        <TacticalMap snapshot={s} mini />
        <div className="zone-label">
          <b>{p.team.toUpperCase()} TEAM</b>
          <span>
            {p.kills} K / {p.deaths} D
          </span>
        </div>
        <div className="room-code">
          ROOM {s.room}
          <br />
          {s.humans} HUMAN · {s.total - s.humans} AI
        </div>
      </div>
      {p.streak >= 3 && (
        <div className="streak-badge">{p.streak} KILL STREAK</div>
      )}
      <div className="kill-feed">
        {(ui.killFeed || [])
          .filter((e) => e.time > s.time - 6)
          .map((e) => (
            <div key={e.id} className={e.from === p.id ? "your-kill" : ""}>
              {e.text}
            </div>
          ))}
      </div>
      {p.alive && !ui.scope && (
        <div
          className={"crosshair " + (ui.ads ? "aiming" : "")}
          style={{ gap: 4 + ui.recoil * 150 }}
        >
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      <div
        className={"hitmarker " + (ui.headshot ? "headshot" : "")}
        style={{ opacity: ui.hit }}
      >
        ×
      </div>
      <div className="damage-vignette" style={{ opacity: ui.damage }} />
      <div
        className="damage-arrow"
        style={{
          opacity: ui.damage,
          transform: `translateX(-50%) rotate(${ui.damageAngle}rad)`,
        }}
      >
        ▴
      </div>
      <div className="flash-overlay" style={{ opacity: ui.flash }} />
      {p.alive && p.hp < 35 && <div className="low-health" />}
      {ui.notice && <div className="game-notice">{ui.notice}</div>}
      {ui.prompt && p.alive && (
        <div className="interact-prompt">{ui.prompt}</div>
      )}
      {!p.alive && s.phase !== "finished" && (
        <div className="respawn-card">
          <span>ELIMINATED BY {p.lastKiller || "OPPONENT"}</span>
          <small>{p.lastKillerWeapon}</small>
          <b>{Math.max(0, Math.ceil(p.respawnAt - s.time))}</b>
          <strong>REDEPLOYING TO {p.team.toUpperCase()} TEAM</strong>
          <small>Your loadout is ready. Get back in the fight.</small>
        </div>
      )}
      {(p.reloadAt > 0 || p.plateAt > 0 || p.healAt > 0) && (
        <div className="action-status">
          {p.reloadAt
            ? "RELOADING"
            : p.plateAt
              ? "RESTORING ARMOR"
              : "INJECTING SYRINGE"}
          {p.healAt > 0 && (
            <progress
              aria-label="Injection progress"
              max={1}
              value={Math.max(0, 1 - (p.healAt - s.time) / HEAL_DURATION)}
            />
          )}
          <span>
            {Math.max(
              0,
              (p.reloadAt || p.plateAt || p.healAt) - s.time,
            ).toFixed(1)}
            s
          </span>
        </div>
      )}
      <div className="player-vitals">
        <div className="operator-name">
          <span className={`operator-icon ${p.team}`}>AV</span>
          <div>
            <b>{p.name}</b>
            <span>
              {p.team.toUpperCase()} TEAM / {perkFor(p.perk).name}
            </span>
          </div>
        </div>
        <div className="armor-bars">
          <span>
            <i
              style={{
                width:
                  Math.min(100, (p.armor / perkFor(p.perk).armor) * 100) + "%",
              }}
            />
          </span>
          <b>{Math.ceil(p.armor)}</b>
        </div>
        <div className="health-bar">
          <i style={{ width: p.hp + "%" }} />
          <b>{Math.ceil(p.hp)}</b>
        </div>
        <div className="supplies">
          <span>
            <kbd>H</kbd> {p.plates} ARMOR
          </span>
          <span>
            <kbd>V</kbd> {p.meds} SYRINGE
          </span>
          <b>
            {p.kills} K / {p.deaths} D
          </b>
        </div>
      </div>
      <div className="weapon-hud">
        <div className="weapon-slots">
          {p.weapons.map((slot, index) => (
            <span
              key={index}
              className={p.selected === index ? "selected" : ""}
            >
              <kbd>{index + 1}</kbd>{" "}
              {index === 0 ? "PRIMARY" : index === 1 ? "PISTOL" : "KNIFE"}
            </span>
          ))}
        </div>
        <div className="weapon-caption">
          <span>{w.category.toUpperCase()}</span>
          <b>{w.name}</b>
        </div>
        {slot.id === "knife" ? (
          <div className="ammo melee">
            <strong>MELEE</strong>
            <span>2.2 m</span>
            <i>SLASH</i>
          </div>
        ) : (
          <div className="ammo">
            <strong className={slot.ammo === 0 ? "empty" : ""}>
              {slot.ammo.toString().padStart(2, "0")}
            </strong>
            <span>/ {slot.reserve}</span>
            <i>{w.mode.toUpperCase()}</i>
          </div>
        )}
        <div className="equipment">
          <span>
            <kbd>G</kbd> {ui.grenade.toUpperCase()} ×{p.grenades[ui.grenade]}
          </span>
          <span>
            <kbd>Q</kbd> CYCLE
          </span>
        </div>
      </div>
      <div className="hud-bottom">
        <span>
          <kbd>M</kbd> MAP &nbsp; <kbd>TAB</kbd> SCOREBOARD &nbsp; <kbd>B</kbd>{" "}
          LOADOUT
        </span>
        <span>
          {ui.fps} FPS · {ui.ping} MS
        </span>
        <span>
          <kbd>WHEEL / 1 2 3</kbd> SWAP &nbsp; <kbd>R</kbd> RELOAD
        </span>
      </div>
    </div>
  );
}

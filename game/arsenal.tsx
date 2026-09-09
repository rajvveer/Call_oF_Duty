"use client";
import { useState } from "react";
import { ATTACHMENTS, WEAPONS, WEAPON_IDS } from "../packages/game-shared/data";
import { PERKS, type PerkId } from "../packages/game-shared/combat";
import type { Settings } from "./settings";

export function Arsenal({
  settings,
  onChange,
  playing = false,
}: {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  playing?: boolean;
}) {
  const [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState("");
  const group = (category: string) =>
    category === "Pistol"
      ? "PISTOLS"
      : category === "Submachine gun"
        ? "SMGS"
        : category === "Shotgun"
          ? "SHOTGUNS"
          : /Sniper|Marksman/.test(category)
            ? "PRECISION"
            : "RIFLES";
  const chosen =
    WEAPONS[settings.loadout as keyof typeof WEAPONS] || WEAPONS.kestrel;
  const visible = WEAPON_IDS.filter(
    (id) =>
      (filter === "ALL" || group(WEAPONS[id].category) === filter) &&
      WEAPONS[id].name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="arsenal-toolbar">
        <div className="weapon-filters">
          {["ALL", "RIFLES", "SMGS", "PRECISION", "SHOTGUNS", "PISTOLS"].map(
            (category) => (
              <button
                key={category}
                className={filter === category ? "active" : ""}
                onClick={() => setFilter(category)}
              >
                {category}
              </button>
            ),
          )}
        </div>
        <input
          aria-label="Search weapons"
          placeholder="Search weapons"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="panel-intro">
        {playing
          ? "Choose your next spawn loadout. Your current magazine stays in the fight."
          : "Choose your weapon, learn its recoil, and make every burst count."}{" "}
        <b>{WEAPON_IDS.length} WEAPONS</b>
      </p>
      <div className="arsenal-workbench">
        <div className="arsenal-grid">
          {visible.map((id) => {
            const w = WEAPONS[id];
            return (
              <button
                key={id}
                className={
                  "weapon-card " + (settings.loadout === id ? "chosen" : "")
                }
                onClick={() => onChange("loadout", id)}
              >
                <small>{w.category}</small>
                {w.thumbnail ? (
                  <div
                    className="weapon-preview"
                    role="img"
                    aria-label={w.name}
                    style={{ backgroundImage: `url(${w.thumbnail})` }}
                  />
                ) : (
                  <div className="weapon-preview placeholder">
                    <span>{w.mode.toUpperCase()}</span>
                  </div>
                )}
                <h3>{w.name}</h3>
                <span>
                  {w.damage} DMG <i /> {w.rpm} RPM <i /> {w.mag} RND
                </span>
                <b>
                  {settings.loadout === id ? "EQUIPPED" : "SELECT WEAPON"}{" "}
                  <span>↗</span>
                </b>
              </button>
            );
          })}
          {!visible.length && <p>No weapons match this search.</p>}
        </div>
        <aside className="weapon-inspector">
          <span className="eyebrow">YOUR LOADOUT</span>
          <h3>{chosen.name}</h3>
          {chosen.thumbnail && (
            <div
              className="weapon-preview"
              style={{ backgroundImage: `url(${chosen.thumbnail})` }}
            />
          )}
          <p>
            {chosen.category} · {chosen.mode.toUpperCase()}
          </p>
          {[
            ["DAMAGE", chosen.damage, 100],
            ["FIRE RATE", chosen.rpm, 1000],
            ["RANGE", chosen.range, 250],
          ].map(([label, value, max]) => (
            <div className="weapon-meter" key={label}>
              <span>{label}</span>
              <b>{value}</b>
              <progress value={Number(value)} max={Number(max)} />
            </div>
          ))}
          <label className="field-label">
            ATTACHMENT PACKAGE
            <select
              value={settings.attachment}
              onChange={(e) => onChange("attachment", e.target.value)}
            >
              {Object.entries(ATTACHMENTS).map(([key, a]) => (
                <option key={key} value={key}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <p className="fine-print">
            {
              ATTACHMENTS[settings.attachment as keyof typeof ATTACHMENTS]
                ?.description
            }
          </p>
          <div className="perk-selection">
            <span className="eyebrow">OPERATOR PERK</span>
            {Object.entries(PERKS).map(([id, perk]) => (
              <button
                key={id}
                className={settings.perk === id ? "chosen" : ""}
                onClick={() => onChange("perk", id as PerkId)}
              >
                <b>{perk.name}</b>
                <span>{perk.description}</span>
              </button>
            ))}
          </div>
          <div className="loadout-note">
            {playing ? "APPLIES ON NEXT RESPAWN" : "READY FOR DEPLOYMENT"}
          </div>
          <p className="fine-print">
            Stop to shoot accurately. Crouch for tighter bursts. Jumping and
            long sprays increase spread.
          </p>
        </aside>
      </div>
    </>
  );
}

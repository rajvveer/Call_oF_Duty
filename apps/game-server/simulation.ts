import {
  PERKS,
  perkFor,
  reloadTime,
  cycleWeaponSlot,
  HEAL_DURATION,
  type PerkId,
} from "../../packages/game-shared/combat";
import { verdantSpawnCandidates } from "../../packages/game-shared/verdant";
import {
  ATTACHMENTS,
  COMBATANTS,
  MAX_HUMANS,
  POIS,
  RELAYS,
  TERMINALS,
  TICK,
  TDM,
  arenaFor,
  arenaCenter,
  type MapId,
  WEAPONS,
  WEAPON_IDS,
  clamp,
  dist,
  random,
  rollLoot,
  weaponDamage,
  weaponInaccuracy,
  type WeaponId,
  type AttachmentId,
  type Vec3,
} from "../../packages/game-shared/data";
import {
  buildings,
  groundHeight,
  nearbyColliders,
  worldRay,
} from "../../packages/game-shared/map";
import { movePlayer } from "../../packages/game-shared/movement";
import { applyDamage } from "../../packages/game-shared/zone";
import {
  neutralInput,
  type ClientMessage,
  type GameEvent,
  type Input,
  type Loot,
  type Phase,
  type Player,
  type Projectile,
  type Snapshot,
  type Team,
  type WeaponSlot,
} from "../../packages/game-shared/protocol";
import {
  route,
  walkClear,
  canSee,
  cover,
  steering,
  getNav,
} from "./navigation";
import { GrenadePhysics } from "./physics";

type BotBrain = {
  target: string | null;
  think: number;
  react: number;
  goal: Vec3;
  state: string;
  stuck: number;
  lastX: number;
  lastZ: number;
  strafe: number;
  path: Vec3[];
  nextPath: number;
  memoryUntil: number;
  lastSeen: Vec3 | null;
  burstEnd: number;
  nextBurst: number;
  coverUntil: number;
  nextCover: number;
  coverPoint: Vec3 | null;
  nextStrafe: number;
  aimSeed: number;
};
type History = {
  time: number;
  positions: Map<string, Vec3 & { crouched: boolean; eyeHeight?: number }>;
};
export class Match {
  players = new Map<string, Player>();
  inputs = new Map<string, Input[]>();
  bots = new Map<string, BotBrain>();
  loot: Loot[] = [];
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  phase: Phase = "warmup";
  time = Date.now() / 1000;
  phaseEnd = this.time + 8;
  started = this.time;
  activeAt = 0;
  tick = 0;
  round = 1;
  private rematchVotes = new Set<string>();
  private contributors = new Map<
    string,
    Map<string, { damage: number; time: number }>
  >();
  winner: string | null = null;
  scores = { blue: 0, red: 0 };
  winnerTeam: Team | null = null;
  eventSeq = 0;
  history: History[] = [];
  private humanIds = new Set<string>();
  private heldInputs = new Map<string, { input: Input; time: number }>();
  private fireSchedule = new Map<string, number>();
  private smoke: { x: number; y: number; z: number; end: number }[] = [];
  private rng = random(72741);
  private idSeq = 0;
  private loadouts = new Map<
    string,
    { weapon: WeaponId; attachment: AttachmentId; perk?: PerkId }
  >();
  private physics = new GrenadePhysics();
  difficulty: "regular" | "veteran" = "regular";
  constructor(
    public room: string,
    public combatants = COMBATANTS,
    public map: MapId = "harbor",
  ) {}
  get alive() {
    return [...this.players.values()].filter((p) => p.alive).length;
  }
  get humans() {
    return this.humanIds.size;
  }
  get zone() {
    const center = arenaCenter(this.map);
    return {
      x: center.x,
      z: center.z,
      radius: 120,
      nextX: center.x,
      nextZ: center.z,
      nextRadius: 120,
      phase: 0,
      remaining: Math.max(0, this.phaseEnd - this.time),
      closing: false,
    };
  }
  slot(
    id: WeaponId,
    attachment: AttachmentId = "balanced",
    perk: PerkId = "balanced",
  ): WeaponSlot {
    const w = WEAPONS[id];
    return {
      id,
      ammo: Math.floor(w.mag * ATTACHMENTS[attachment].mag),
      reserve: Math.floor(w.reserve * perkFor(perk).reserve),
      attachment,
    };
  }
  addPlayer(id: string, name: string, bot = false, operator = "sable") {
    if (!bot && this.humans >= MAX_HUMANS)
      throw Error("This operation is full. Join another room.");
    if (this.phase === "finished")
      throw Error("This operation is already underway. Choose another room.");
    if (!bot && this.players.size >= this.combatants) {
      const existing = [...this.players.values()].find((p) => p.bot);
      if (existing) {
        this.clearProjectiles(existing.id);
        this.players.delete(existing.id);
        this.bots.delete(existing.id);
        this.inputs.delete(existing.id);
        this.loadouts.delete(existing.id);
        this.fireSchedule.delete(existing.id);
        this.heldInputs.delete(existing.id);
      }
    }
    const blue = [...this.players.values()].filter(
      (p) => p.team === "blue",
    ).length;
    const team: Team = blue <= this.players.size - blue ? "blue" : "red";
    const n = this.players.size,
      angle = n * 2.4,
      x = 10 + Math.cos(angle) * (10 + n * 1.5),
      z = 17 + Math.sin(angle) * (8 + n * 1.2);
    const p: Player = {
      id,
      map: this.map,
      name: name.slice(0, 18),
      bot,
      connected: true,
      perk: "balanced",
      eyeHeight: 1.64,
      focus: 1,
      focusCooldown: 0,
      steadied: false,
      assists: 0,
      streak: 0,
      bestStreak: 0,
      lastKiller: "",
      lastKillerWeapon: "",
      team,
      deaths: 0,
      respawnAt: 0,
      protectedUntil: 0,
      jumpHeld: false,
      coyote: 0.09,
      jumpBuffer: 0,
      crouchHeld: false,
      x,
      y: groundHeight(x, z),
      z,
      yaw: Math.PI,
      pitch: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      grounded: true,
      crouched: false,
      slide: -2,
      air: "ground",
      hp: 100,
      armor: 75,
      plates: 3,
      meds: 1,
      credits: 200,
      grenades: { frag: 2, smoke: 1, flash: 1 },
      selected: 0,
      weapons: [this.slot("kestrel"), this.slot("vesper"), this.slot("knife")],
      kills: 0,
      damage: 0,
      alive: true,
      reloadAt: 0,
      plateAt: 0,
      healAt: 0,
      lastShot: 0,
      lastDamage: 0,
      lastSeq: 0,
      fireHeld: false,
      burst: 0,
      spray: 0,
      placement: 0,
      ping: null,
      pingUntil: 0,
      scanUntil: 0,
      recon: -1,
      reconProgress: 0,
      operator,
      flashUntil: 0,
    };
    this.players.set(id, p);
    if (!bot) this.humanIds.add(id);
    this.inputs.set(id, []);
    this.loadouts.set(id, { weapon: "kestrel", attachment: "balanced" });
    if (bot) {
      const choices: WeaponId[] = [
        "kestrel",
        "wraith",
        "pike",
        "bastion",
        "breach",
        "wa2000",
      ];
      this.loadouts.set(id, {
        weapon: choices[this.bots.size % choices.length],
        attachment: "balanced",
        perk: "balanced",
      });
    }
    if (bot)
      this.bots.set(id, {
        target: null,
        think: 0,
        react: 0,
        goal: { x: 0, y: 0, z: 0 },
        state: "DROP",
        stuck: 0,
        lastX: x,
        lastZ: z,
        strafe: this.rng() > 0.5 ? 1 : -1,
        path: [],
        nextPath: 0,
        memoryUntil: 0,
        lastSeen: null,
        burstEnd: 0,
        nextBurst: 0,
        coverUntil: 0,
        nextCover: 0,
        coverPoint: null,
        nextStrafe: 0,
        aimSeed: this.rng() * 100,
      });
    this.respawn(p);
    return p;
  }
  fillBots() {
    while (this.players.size < this.combatants) {
      const id = "bot-" + ++this.idSeq;
      this.addPlayer(
        id,
        [
          "CIRRUS",
          "OSPREY",
          "MICA",
          "VALE",
          "STRAND",
          "ROOK",
          "FEN",
          "MOTH",
          "SLATE",
          "ION",
          "SCOUR",
          "TALON",
          "REED",
          "NOMAD",
          "KITE",
        ][this.bots.size % 15],
        true,
      );
    }
  }
  setLoadout(
    id: string,
    weapon: WeaponId,
    attachment: AttachmentId,
    equip = true,
    perk?: PerkId,
  ) {
    if (weapon === "knife") return;
    const p = this.players.get(id),
      selected = perk || this.loadouts.get(id)?.perk || p?.perk || "balanced";
    this.loadouts.set(id, { weapon, attachment, perk: selected });
    if (p && equip) {
      p.perk = selected;
      p.armor = Math.min(p.armor, perkFor(selected).armor);
      p.weapons = [
        this.slot(weapon, attachment, selected),
        this.slot("vesper", "balanced", selected),
        this.slot("knife"),
      ];
    }
  }
  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    p.connected = connected;
    this.inputs.set(id, []);
    this.heldInputs.delete(id);
    p.vx = p.vz = 0;
    p.fireHeld = false;
    p.jumpHeld = false;
    p.jumpBuffer = 0;
  }
  private clearProjectiles(owner: string) {
    for (const g of this.projectiles.filter((g) => g.owner === owner))
      this.physics.remove(g.id);
    this.projectiles = this.projectiles.filter((g) => g.owner !== owner);
  }
  remove(id: string) {
    this.clearProjectiles(id);
    this.rematchVotes.delete(id);
    this.contributors.delete(id);
    this.humanIds.delete(id);
    this.players.delete(id);
    this.inputs.delete(id);
    this.bots.delete(id);
    this.loadouts.delete(id);
    this.fireSchedule.delete(id);
    this.heldInputs.delete(id);
    for (const h of this.history) h.positions.delete(id);
    if (this.humans > 0 && this.phase !== "finished") this.fillBots();
    if (
      this.humans > 0 &&
      this.phase === "finished" &&
      this.rematchVotes.size >= this.humans
    ) {
      this.round++;
      this.transition("warmup");
    }
  }
  respawn(p: Player) {
    const arena = arenaFor(this.map);
    const enemies = [...this.players.values()].filter(
      (o) => o !== p && o.alive && o.team !== p.team,
    );
    const allies = [...this.players.values()].filter(
      (o) => o !== p && o.alive && o.team === p.team,
    );
    const candidates = (
      arena.id === "verdant"
        ? verdantSpawnCandidates(p.team)
        : (p.team === "blue"
            ? [arena.minX + 10, arena.minX + 18]
            : [arena.maxX - 12, arena.maxX - 6]
          ).flatMap((x) =>
            [14, 42, 94, 110, 128, 150]
              .map((n) => arena.minZ + n)
              .map((z) => ({
                x,
                y: groundHeight(x, z),
                z,
              })),
          )
    ).filter(
      (v) =>
        v.x > arena.minX + 1 &&
        v.x < arena.maxX - 1 &&
        v.z > arena.minZ + 1 &&
        v.z < arena.maxZ - 1 &&
        !nearbyColliders(v.x, v.z).some(
          (c) =>
            Math.abs(v.x - c.x) < c.w / 2 + 0.5 &&
            Math.abs(v.z - c.z) < c.d / 2 + 0.5 &&
            v.y < c.y + c.h / 2 &&
            v.y + 1.8 > c.y - c.h / 2,
        ),
    );
    const safety = (v: Vec3) => {
      let score = Math.min(90, ...enemies.map((e) => dist(v, e)));
      for (const e of enemies) {
        const d = Math.max(0.1, dist(v, e));
        if (
          d < 60 &&
          worldRay(
            { ...v, y: v.y + 1.6 },
            { x: (e.x - v.x) / d, y: 0, z: (e.z - v.z) / d },
            d,
          ).distance >=
            d - 0.5
        )
          score -= 45;
      }
      return score + Math.min(12, ...allies.map((e) => dist(v, e))) * 2;
    };
    candidates.sort((a, b) => safety(b) - safety(a));
    const spawn =
      candidates[0] ||
      (arena.id === "verdant"
        ? verdantSpawnCandidates(p.team)[0]
        : {
            x: p.team === "blue" ? arena.minX + 10 : arena.maxX - 6,
            y: 0,
            z: arena.minZ + 150,
          });
    const loadout = this.loadouts.get(p.id) || {
      weapon: "kestrel" as WeaponId,
      attachment: "balanced" as AttachmentId,
    };
    Object.assign(p, spawn, {
      alive: true,
      perk: loadout.perk || "balanced",
      eyeHeight: 1.64,
      focus: 1,
      focusCooldown: 0,
      steadied: false,
      lastKiller: "",
      lastKillerWeapon: "",
      hp: 100,
      armor: perkFor(loadout.perk).armor,
      plates: 2,
      meds: 1,
      credits: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: p.team === "blue" ? -Math.PI / 2 : Math.PI / 2,
      pitch: 0,
      grounded: true,
      crouched: false,
      slide: -2,
      air: "ground",
      jumpHeld: false,
      coyote: 0.09,
      jumpBuffer: 0,
      crouchHeld: false,
      selected: 0,
      weapons: [
        this.slot(loadout.weapon, loadout.attachment, loadout.perk),
        this.slot("vesper", "balanced", loadout.perk),
        this.slot("knife"),
      ],
      grenades: { frag: 1, smoke: 1, flash: 1 },
      reloadAt: 0,
      plateAt: 0,
      healAt: 0,
      lastShot: 0,
      lastDamage: 0,
      fireHeld: false,
      burst: 0,
      spray: 0,
      flashUntil: 0,
      scanUntil: 0,
      recon: -1,
      reconProgress: 0,
      ping: null,
      pingUntil: 0,
      respawnAt: 0,
      protectedUntil: this.time + TDM.protection,
    });
    this.inputs.set(p.id, []);
    this.contributors.delete(p.id);
    this.fireSchedule.delete(p.id);
    this.heldInputs.delete(p.id);
    for (const h of this.history) h.positions.delete(p.id);
    const brain = this.bots.get(p.id);
    if (brain)
      Object.assign(brain, {
        target: null,
        think: this.time + this.rng() * 0.1,
        stuck: 0,
        goal: { ...arenaCenter(this.map), y: 0 },
        state: "ADVANCE",
        path: [],
        nextPath: this.time + this.rng() * 0.2,
        memoryUntil: 0,
        lastSeen: null,
        coverPoint: null,
        coverUntil: 0,
        nextBurst: 0,
        burstEnd: 0,
      });
  }
  input(id: string, input: Input) {
    const p = this.players.get(id),
      q = this.inputs.get(id);
    if (
      !p ||
      !q ||
      input.seq <= p.lastSeq ||
      input.seq > p.lastSeq + 1000 ||
      q.some((i) => i.seq >= input.seq)
    )
      return false;
    if (q.length >= 5) q.shift();
    q.push(input);
    return true;
  }
  event(type: GameEvent["type"], p: Vec3, extra: Partial<GameEvent> = {}) {
    this.events.push({
      id: ++this.eventSeq,
      type,
      x: p.x,
      y: p.y,
      z: p.z,
      time: this.time,
      ...extra,
    });
    if (this.events.length > 250)
      this.events.splice(0, this.events.length - 250);
  }
  seedLoot() {
    for (const [i, b] of buildings.entries()) {
      for (let j = 0; j < 3; j++) {
        this.loot.push({
          id: "loot-" + ++this.idSeq,
          x: b.x - 4 + j * 4,
          y: b.y + 0.2,
          z: b.z + 2,
          kind:
            j === 0 ? "crate" : j === 1 ? "weapon" : i % 2 ? "plate" : "ammo",
          rarity: Math.floor(this.rng() * 4),
          weapon: WEAPON_IDS[i % 7],
        });
      }
    }
    for (const p of POIS)
      this.loot.push({
        id: "loot-" + ++this.idSeq,
        x: p.x + 10,
        y: groundHeight(p.x + 10, p.z + 8) + 0.2,
        z: p.z + 8,
        kind: "crate",
        rarity: 3,
      });
  }
  transition(phase: Phase) {
    // Old local tools may still request insertion; TDM starts on the ground.
    this.phase = phase === "insertion" ? "active" : phase;
    if (this.phase === "warmup" && this.humans > 0) this.fillBots();
    if (this.phase === "active" || this.phase === "warmup") {
      this.started = this.time;
      this.activeAt = this.phase === "active" ? this.time : 0;
      this.phaseEnd = this.time + (this.phase === "active" ? TDM.duration : 5);
      this.rematchVotes.clear();
      this.contributors.clear();
      this.scores = { blue: 0, red: 0 };
      this.winner = this.winnerTeam = null;
      this.loot = [];
      this.history = [];
      this.smoke = [];
      for (const g of this.projectiles) this.physics.remove(g.id);
      this.projectiles = [];
      for (const p of this.players.values()) p.alive = false;
      for (const p of this.players.values()) {
        p.kills =
          p.deaths =
          p.damage =
          p.placement =
          p.assists =
          p.streak =
          p.bestStreak =
            0;
        this.respawn(p);
      }
      this.event(
        "notice",
        { x: 0, y: 0, z: 0 },
        { text: "TEAM DEATHMATCH · FIRST TO 50" },
      );
    }
    if (this.phase === "finished") {
      this.phaseEnd = this.time + 15;
      this.winnerTeam =
        this.scores.blue === this.scores.red
          ? null
          : this.scores.blue > this.scores.red
            ? "blue"
            : "red";
      this.winner = this.winnerTeam;
      this.event(
        "notice",
        { x: 0, y: 0, z: 0 },
        {
          text: this.winnerTeam
            ? this.winnerTeam.toUpperCase() + " TEAM WINS"
            : "MATCH DRAW",
        },
      );
    }
  }
  step() {
    this.time += TICK;
    this.tick++;
    if (this.phase === "finished") return;
    if (
      this.phase === "warmup" &&
      this.time >= this.phaseEnd &&
      this.humans > 0
    )
      this.transition("active");
    const elapsed = this.time - this.started;
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (
          this.phase === "active" &&
          this.time >= p.respawnAt &&
          p.connected !== false
        )
          this.respawn(p);
        else continue;
      }
      let input: Input;
      const q = this.inputs.get(p.id)!;
      const receivedInput = p.bot || q.length > 0;
      if (p.bot) input = this.botInput(p);
      else {
        const next = q.shift(),
          held = this.heldInputs.get(p.id);
        if (next) {
          input = next;
          this.heldInputs.set(p.id, { input: next, time: this.time });
        } else if (held && this.time - held.time < 0.1) {
          input = { ...held.input, seq: p.lastSeq, fire: false };
        } else
          input = {
            ...neutralInput(p.lastSeq),
            yaw: p.yaw,
            pitch: p.pitch,
            jump: p.jumpHeld,
            crouch: p.crouched,
          };
      }
      p.lastSeq = input.seq;
      p.yaw = input.yaw;
      p.pitch = input.pitch;
      if (p.air === "plane") {
        p.x = -65 + elapsed * 8;
        p.z = 60 - elapsed * 5;
        p.y = 105;
        if (
          input.jump ||
          (p.bot && elapsed > 2 + [...this.bots.keys()].indexOf(p.id) * 0.55) ||
          elapsed > 12
        ) {
          p.air = "fall";
          p.vy = -5;
          p.x += p.bot ? (this.rng() - 0.5) * 65 : 0;
          p.z += p.bot ? (this.rng() - 0.5) * 65 : 0;
        }
      } else {
        if (
          p.air === "fall" &&
          (input.jump || p.y - groundHeight(p.x, p.z) < 20)
        ) {
          p.air = "chute";
          p.vy = -5;
        }
        // Movement snapshots acknowledge only consumed commands, so replay never double-counts a network gap.
        if (receivedInput || p.connected === false) movePlayer(p, input);
        else if (
          this.time - (this.heldInputs.get(p.id)?.time ?? -Infinity) >=
          0.2
        ) {
          // Beyond normal packet jitter, a stalled client still falls and remains vulnerable.
          p.vx = p.vz = 0;
          p.jumpBuffer = 0;
          if (!p.grounded) p.coyote = 0;
          movePlayer(p, {
            ...neutralInput(p.lastSeq),
            yaw: p.yaw,
            pitch: p.pitch,
            crouch: p.crouched,
            jump: p.jumpHeld,
          });
        }
      }
      if (p.air === "ground") {
        if (p.reloadAt && this.time >= p.reloadAt) {
          const slot = p.weapons[p.selected],
            max = Math.floor(
              WEAPONS[slot.id].mag * ATTACHMENTS[slot.attachment].mag,
            ),
            rounds = Math.min(max - slot.ammo, slot.reserve);
          slot.ammo += rounds;
          slot.reserve -= rounds;
          p.reloadAt = 0;
        }
        if (p.plateAt && this.time >= p.plateAt) {
          if (p.plates > 0) {
            p.armor = Math.min(perkFor(p.perk).armor, p.armor + 50);
            p.plates--;
          }
          p.plateAt = 0;
        }
        if (p.healAt && this.time >= p.healAt) {
          if (p.meds > 0) {
            p.hp = 100;
            p.meds--;
          }
          p.healAt = 0;
        }
        if (p.lastDamage && this.time - p.lastDamage > 5 && p.hp < 100)
          p.hp = Math.min(100, p.hp + 18 * TICK);
        if (input.fire) {
          if (
            p.weapons[p.selected].ammo === 0 &&
            !p.reloadAt &&
            p.weapons[p.selected].reserve > 0
          )
            this.action(p.id, { type: "action", action: "reload" });
          this.fire(p, input);
        } else if (receivedInput) p.fireHeld = false;
        if (p.recon >= 0) {
          const relay = RELAYS[p.recon];
          if (dist(p, relay) < 5) {
            p.reconProgress += TICK;
            if (p.reconProgress >= 8) {
              p.credits += 400;
              p.scanUntil = this.time + 20;
              p.recon = -1;
              p.reconProgress = 0;
              this.event("notice", p, {
                to: p.id,
                text: "SIGNAL RECOVERED · +400 CR · 20s RECON",
              });
            }
          } else p.reconProgress = Math.max(0, p.reconProgress - TICK);
        }
      }
    }
    this.physics.step();
    for (const g of [...this.projectiles]) {
      const pos = this.physics.position(g.id);
      if (pos) Object.assign(g, pos);
      if (this.time >= g.end) {
        this.explode(g);
        this.physics.remove(g.id);
        this.projectiles.splice(this.projectiles.indexOf(g), 1);
      }
    }
    this.history.push({
      time: this.time,
      positions: new Map(
        [...this.players].map(([id, p]) => [
          id,
          {
            x: p.x,
            y: p.y,
            z: p.z,
            crouched: p.crouched,
            eyeHeight: p.eyeHeight,
          },
        ]),
      ),
    });
    if (this.history.length > Math.ceil(0.25 / TICK)) this.history.shift();
    if (
      this.phase === "active" &&
      (this.time >= this.phaseEnd ||
        this.scores.blue >= TDM.scoreLimit ||
        this.scores.red >= TDM.scoreLimit)
    )
      this.transition("finished");
  }
  fire(p: Player, i: Input) {
    const slot = p.weapons[p.selected],
      w = WEAPONS[slot.id];
    const wasHeld = p.fireHeld;
    p.fireHeld = true;
    if (w.mode === "semi" && wasHeld) return;
    if (
      !p.alive ||
      this.phase === "finished" ||
      p.reloadAt ||
      p.plateAt ||
      p.healAt ||
      p.air !== "ground" ||
      (i.sprint && !i.ads) ||
      this.time < (this.fireSchedule.get(p.id) || 0) - 0.0001 ||
      slot.ammo <= 0
    )
      return;
    if (w.mode === "burst" && p.burst >= 3 && this.time - p.lastShot < 0.45)
      return;
    if (w.mode === "burst") {
      if (this.time - p.lastShot >= 0.45) p.burst = 0;
      p.burst++;
    }
    p.protectedUntil = 0;
    p.fireHeld = true;
    this.fireSchedule.set(
      p.id,
      Math.max(
        (this.fireSchedule.get(p.id) || this.time) + 60 / w.rpm,
        this.time + 60 / w.rpm - TICK,
      ),
    );
    p.spray = this.time - p.lastShot > 0.32 ? 0 : p.spray + 1;
    p.lastShot = this.time;
    if (slot.id === "knife") {
      this.slash(p, i);
      return;
    }
    slot.ammo--;
    const eye = { x: p.x, y: p.y + p.eyeHeight, z: p.z };
    const rewind = clamp(i.at, this.time - 0.2, this.time),
      hist = [...this.history].reverse().find((h) => h.time <= rewind);
    let firstEnd: Vec3 | undefined;
    let surface = "concrete";
    for (let pellet = 0; pellet < w.pellets; pellet++) {
      const spread =
          weaponInaccuracy(
            w,
            Math.hypot(p.vx, p.vz),
            p.grounded,
            p.crouched,
            i.ads,
            p.spray,
          ) *
          (i.ads ? ATTACHMENTS[slot.attachment].spread : 1) *
          (p.bot ? 1.25 : 1),
        yaw = i.yaw + (this.rng() - 0.5) * spread,
        pitch = i.pitch + (this.rng() - 0.5) * spread;
      const d = {
        x: -Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * Math.cos(pitch),
      };
      const world = worldRay(eye, d, 350);
      let nearest = world.distance;
      let victim: Player | undefined,
        region: "head" | "torso" | "limb" = "torso";
      for (const other of this.players.values()) {
        if (
          other === p ||
          !other.alive ||
          other.team === p.team ||
          other.protectedUntil > this.time
        )
          continue;
        const pos = hist?.positions.get(other.id) || other;
        for (const [offset, radius, part] of [
          [
            (pos.eyeHeight ?? (pos.crouched ? 1.03 : 1.64)) - 0.06,
            0.15,
            "head",
          ],
          [pos.crouched ? 0.58 : 1.02, 0.38, "torso"],
          [0.36, 0.29, "limb"],
        ] as const) {
          const delta = {
              x: pos.x - eye.x,
              y: pos.y + offset - eye.y,
              z: pos.z - eye.z,
            },
            along = delta.x * d.x + delta.y * d.y + delta.z * d.z;
          if (along < -radius || along > nearest + radius) continue;
          const perpendicular =
            delta.x * delta.x +
            delta.y * delta.y +
            delta.z * delta.z -
            along * along;
          if (perpendicular <= radius * radius) {
            const entry = Math.max(
              0,
              along - Math.sqrt(radius * radius - perpendicular),
            );
            if (entry < nearest) {
              nearest = entry;
              victim = other;
              region = part;
            }
          }
        }
      }
      const end = {
        x: eye.x + d.x * nearest,
        y: eye.y + d.y * nearest,
        z: eye.z + d.z * nearest,
      };
      if (!firstEnd) {
        firstEnd = end;
        surface = world.material;
      }
      if (victim && this.phase === "active") {
        const damage = weaponDamage(slot.id, nearest, region);
        this.damage(victim, damage, p);
        this.event("hit", end, {
          from: p.id,
          to: victim.id,
          value: Math.round(damage),
          head: region === "head",
          text: victim.armor <= 0 ? "FLESH" : "ARMOR",
        });
      }
    }
    this.event("shot", eye, {
      from: p.id,
      end: firstEnd,
      material: surface,
      text: slot.id,
    });
  }
  private slash(p: Player, input: Input) {
    const eye = { x: p.x, y: p.y + p.eyeHeight, z: p.z };
    const forward = {
      x: -Math.sin(input.yaw) * Math.cos(input.pitch),
      y: Math.sin(input.pitch),
      z: -Math.cos(input.yaw) * Math.cos(input.pitch),
    };
    const candidates = [...this.players.values()]
      .filter(
        (o) =>
          o !== p &&
          o.alive &&
          o.team !== p.team &&
          o.protectedUntil <= this.time,
      )
      .map((o) => {
        const delta = {
          x: o.x - eye.x,
          y: o.y + o.eyeHeight * 0.7 - eye.y,
          z: o.z - eye.z,
        };
        return { o, delta, distance: Math.hypot(delta.x, delta.y, delta.z) };
      })
      .filter(
        (t) =>
          t.distance <= WEAPONS.knife.range &&
          (t.delta.x * forward.x +
            t.delta.y * forward.y +
            t.delta.z * forward.z) /
            Math.max(0.001, t.distance) >
            0.65,
      )
      .sort((a, b) => a.distance - b.distance);
    for (const target of candidates) {
      const length = Math.max(0.001, target.distance);
      const direction = {
        x: target.delta.x / length,
        y: target.delta.y / length,
        z: target.delta.z / length,
      };
      if (
        worldRay(eye, direction, target.distance).distance <
        target.distance - 0.2
      )
        continue;
      if (this.phase === "active") {
        this.damage(target.o, WEAPONS.knife.damage, p, "FIELD KNIFE");
        this.event("hit", target.o, {
          from: p.id,
          to: target.o.id,
          value: WEAPONS.knife.damage,
          text: "MELEE",
        });
      }
      break;
    }
    this.event("melee", eye, { from: p.id, text: "knife" });
  }
  damage(p: Player, amount: number, from: Player | null, source?: string) {
    if (
      !p.alive ||
      this.phase !== "active" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      p.protectedUntil > this.time ||
      (from && from !== p && from.team === p.team)
    )
      return;
    const before = p.hp + p.armor,
      result = applyDamage(p.hp, p.armor, amount);
    p.hp = result.hp;
    p.armor = result.armor;
    p.lastDamage = this.time;
    p.plateAt = p.healAt = 0;
    if (from && from !== p) {
      from.damage += Math.min(before, amount);
      const hits =
        this.contributors.get(p.id) ||
        new Map<string, { damage: number; time: number }>();
      hits.set(from.id, {
        damage: (hits.get(from.id)?.damage || 0) + Math.min(before, amount),
        time: this.time,
      });
      this.contributors.set(p.id, hits);
    }
    if (p.hp <= 0) {
      p.alive = false;
      p.deaths++;
      p.streak = 0;
      p.lastKiller = from?.name || "ENVIRONMENT";
      p.lastKillerWeapon =
        source ?? (from ? WEAPONS[from.weapons[from.selected].id].name : "");
      for (const [id, hit] of this.contributors.get(p.id) || []) {
        const helper = this.players.get(id);
        if (
          helper &&
          helper !== from &&
          helper !== p &&
          hit.damage >= 30 &&
          this.time - hit.time < 10
        )
          helper.assists++;
      }
      this.contributors.delete(p.id);
      p.respawnAt = this.time + TDM.respawnDelay;
      p.reloadAt = 0;
      p.vx = p.vy = p.vz = 0;
      this.inputs.set(p.id, []);
      if (from && from !== p) {
        from.kills++;
        from.streak++;
        from.bestStreak = Math.max(from.bestStreak, from.streak);
        this.scores[from.team]++;
      }
      this.event("kill", p, {
        from: from?.id,
        to: p.id,
        text: (from?.name || "ENVIRONMENT") + " → " + p.name,
      });
      if (
        this.scores.blue >= TDM.scoreLimit ||
        this.scores.red >= TDM.scoreLimit
      )
        this.transition("finished");
    }
  }
  action(id: string, m: Extract<ClientMessage, { type: "action" }>) {
    const p = this.players.get(id);
    if (p && m.action === "loadout" && this.phase !== "finished") {
      const [weapon, attachment, perk] = (m.value || "").split(":");
      if (
        Object.hasOwn(WEAPONS, weapon) &&
        Object.hasOwn(ATTACHMENTS, attachment) &&
        (perk === undefined || Object.hasOwn(PERKS, perk))
      ) {
        this.setLoadout(
          id,
          weapon as WeaponId,
          attachment as AttachmentId,
          false,
          perk as PerkId | undefined,
        );
        this.event("notice", p, {
          to: id,
          text: WEAPONS[weapon as WeaponId].name + " READY FOR NEXT RESPAWN",
        });
      }
      return;
    }
    if (p && !p.bot && m.action === "rematch" && this.phase === "finished") {
      this.rematchVotes.add(id);
      if (this.rematchVotes.size >= this.humans) {
        this.round++;
        this.transition("warmup");
      }
      return;
    }
    if (!p || !p.alive || this.phase === "finished") return;
    if (["buy", "interact", "drop", "chute"].includes(m.action)) return;
    const busy = !!(p.reloadAt || p.plateAt || p.healAt),
      slot = p.weapons[p.selected],
      w = WEAPONS[slot.id];
    if (m.action === "ping" && Number.isFinite(m.x) && Number.isFinite(m.z)) {
      const a = arenaFor(this.map);
      p.ping = {
        x: clamp(m.x!, a.minX + 1, a.maxX - 1),
        y: 0,
        z: clamp(m.z!, a.minZ + 1, a.maxZ - 1),
      };
      p.pingUntil = this.time + 8;
      return;
    }
    if (m.action === "chute") {
      if (p.air === "fall") {
        p.air = "chute";
        p.vy = -5;
      } else if (p.air === "chute" && p.y - groundHeight(p.x, p.z) > 15)
        p.air = "fall";
      return;
    }
    if (p.air !== "ground") return;
    if (
      m.action === "reload" &&
      !busy &&
      slot.reserve > 0 &&
      slot.ammo < Math.floor(w.mag * ATTACHMENTS[slot.attachment].mag)
    )
      p.reloadAt =
        this.time +
        reloadTime(w, slot.ammo === 0, slot.attachment === "extended", p.perk);
    if (
      m.action === "plate" &&
      !busy &&
      p.plates > 0 &&
      p.armor < perkFor(p.perk).armor
    )
      p.plateAt = this.time + 1.6;
    if (m.action === "heal" && !busy && p.meds > 0 && p.hp < 100)
      p.healAt = this.time + HEAL_DURATION;
    if (m.action === "swap") {
      const selected =
        m.value === "0"
          ? 0
          : m.value === "1"
            ? 1
            : m.value === "2"
              ? 2
              : cycleWeaponSlot(p.selected, 1);
      if (selected === p.selected) return;
      p.selected = selected;
      p.reloadAt = 0;
      p.plateAt = 0;
      p.healAt = 0;
      this.fireSchedule.set(
        id,
        Math.max(this.fireSchedule.get(id) || 0, this.time + 0.2),
      );
      p.spray = 0;
    }
    if (m.action === "drop" && !busy) {
      this.loot.push({
        id: "drop-" + ++this.idSeq,
        x: p.x - Math.sin(p.yaw) * 1.8,
        y: p.y + 0.2,
        z: p.z - Math.cos(p.yaw) * 1.8,
        kind: "weapon",
        weapon: slot.id,
        slot: { ...slot },
        rarity: 2,
      });
      p.weapons[p.selected] = this.slot("vesper");
      p.weapons[p.selected].ammo = 0;
      p.weapons[p.selected].reserve = 0;
    }
    if (m.action === "interact" && !busy) {
      const loot = this.loot
        .filter(
          (l) => !l.opened && dist(p, l) < 3.5 && Math.abs(p.y - l.y) < 2.5,
        )
        .sort((a, b) => dist(p, a) - dist(p, b))[0];
      if (loot) {
        this.pickup(p, loot);
        return;
      }
      const relay = RELAYS.find((r) => dist(p, r) < 5);
      if (relay) {
        p.recon = relay.id;
        p.reconProgress = 0;
        this.event("notice", p, {
          to: id,
          text: "RECOVERING SIGNAL · HOLD THIS POSITION",
        });
      }
    }
    if (
      m.action === "throw" &&
      !busy &&
      ["frag", "smoke", "flash"].includes(m.value || "")
    ) {
      const kind = m.value as Projectile["kind"];
      if (p.grenades[kind] <= 0 || this.time - p.lastShot < 0.5) return;
      p.protectedUntil = 0;
      p.grenades[kind]--;
      p.lastShot = this.time;
      const g: Projectile = {
        id: "g-" + ++this.idSeq,
        owner: id,
        kind,
        x: p.x - Math.sin(p.yaw) * 0.6,
        y: p.y + 1.5,
        z: p.z - Math.cos(p.yaw) * 0.6,
        vx: -Math.sin(p.yaw) * 15,
        vy: 5 + Math.sin(p.pitch) * 12,
        vz: -Math.cos(p.yaw) * 15,
        end: this.time + 2.7,
      };
      this.projectiles.push(g);
      this.physics.add(g);
    }
    if (m.action === "buy" && TERMINALS.some((t) => dist(p, t) < 5)) {
      const price: Record<string, number> = {
        armor: 100,
        ammo: 100,
        delivery: 500,
        recon: 300,
        grenade: 100,
      };
      const item = m.value || "";
      if (
        !Object.hasOwn(price, item) ||
        !Number.isFinite(p.credits) ||
        p.credits < price[item]
      )
        return;
      p.credits -= price[item];
      if (item === "armor") p.plates = Math.min(12, p.plates + 3);
      if (item === "ammo")
        for (const s of p.weapons)
          s.reserve = Math.min(500, s.reserve + WEAPONS[s.id].mag * 3);
      if (item === "delivery") {
        const l = this.loadouts.get(id) || {
          weapon: "kestrel" as WeaponId,
          attachment: "balanced" as AttachmentId,
        };
        p.weapons[0] = this.slot(l.weapon, l.attachment);
        p.selected = 0;
        p.reloadAt = 0;
      }
      if (item === "recon") p.scanUntil = this.time + 20;
      if (item === "grenade")
        p.grenades.frag = Math.min(8, p.grenades.frag + 2);
      this.event("notice", p, { to: id, text: "FIELD REQUISITION COMPLETE" });
    }
  }
  pickup(p: Player, l: Loot) {
    if (l.kind === "crate") {
      l.opened = true;
      this.event("pickup", l, { to: p.id, text: "SUPPLY CACHE OPENED" });
      for (let j = 0; j < 4; j++) {
        const kind = j === 0 ? "weapon" : rollLoot(this.rng());
        this.loot.push({
          id: "loot-" + ++this.idSeq,
          x: l.x + (j - 1.5) * 0.7,
          y: l.y,
          z: l.z + 1,
          kind,
          rarity: Math.floor(this.rng() * 5),
          weapon: WEAPON_IDS[Math.floor(this.rng() * 7)],
        });
      }
      return;
    }
    if (l.kind === "weapon" && l.weapon) {
      const old = p.weapons[p.selected];
      if (old.id !== "vesper")
        this.loot.push({
          id: "drop-" + ++this.idSeq,
          x: p.x + 1.2,
          y: p.y + 0.2,
          z: p.z,
          kind: "weapon",
          weapon: old.id,
          slot: { ...old },
          rarity: 1,
        });
      p.weapons[p.selected] = l.slot
        ? { ...l.slot }
        : this.slot(l.weapon, l.rarity >= 3 ? "control" : "balanced");
      p.reloadAt = 0;
    }
    if (l.kind === "ammo")
      for (const s of p.weapons)
        s.reserve = Math.min(500, s.reserve + WEAPONS[s.id].mag * 2);
    if (l.kind === "plate") p.plates = Math.min(12, p.plates + 2);
    if (l.kind === "med") p.meds = Math.min(5, p.meds + 1);
    if (l.kind === "credits") p.credits += 200;
    if (l.kind === "frag" || l.kind === "smoke" || l.kind === "flash")
      p.grenades[l.kind] = Math.min(8, p.grenades[l.kind] + 1);
    this.loot.splice(this.loot.indexOf(l), 1);
    this.event("pickup", l, {
      to: p.id,
      text:
        l.kind === "weapon"
          ? WEAPONS[l.weapon!].name
          : l.kind.toUpperCase() + " ACQUIRED",
    });
  }
  explode(g: Projectile) {
    this.event(g.kind === "frag" ? "explosion" : g.kind, g, {
      from: g.owner,
      value: g.kind === "smoke" ? 18 : 3,
    });
    if (g.kind === "smoke") {
      this.smoke.push({ x: g.x, y: g.y, z: g.z, end: this.time + 18 });
      return;
    }
    for (const p of this.players.values()) {
      if (
        !p.alive ||
        p.protectedUntil > this.time ||
        (p.id !== g.owner && p.team === this.players.get(g.owner)?.team)
      )
        continue;
      const distance = Math.max(
        0.01,
        Math.hypot(p.x - g.x, p.y + 1 - g.y, p.z - g.z),
      );
      if (distance > 12) continue;
      const delta = {
        x: (p.x - g.x) / distance,
        y: (p.y + 1 - g.y) / distance,
        z: (p.z - g.z) / distance,
      };
      if (
        worldRay({ ...g, y: g.y + 0.1 }, delta, distance).distance <
        distance - 0.6
      )
        continue;
      if (g.kind === "frag" && this.phase === "active")
        this.damage(
          p,
          170 * (1 - distance / 12) * perkFor(p.perk).explosive,
          this.players.get(g.owner) || null,
          "FRAG GRENADE",
        );
      if (g.kind === "flash")
        p.flashUntil = Math.max(
          p.flashUntil,
          this.time + Math.max(0.5, 4 - distance / 4) * perkFor(p.perk).flash,
        );
    }
  }
  botInput(p: Player): Input {
    const brain = this.bots.get(p.id)!,
      now = this.time;
    const input = {
      ...neutralInput(p.lastSeq + 1),
      yaw: p.yaw,
      pitch: p.pitch,
      at: now,
    };
    if (p.air !== "ground" || !p.alive) return input;
    const arena = arenaFor(p.map),
      nav = getNav(p.map);
    const allies = [...this.players.values()].filter(
      (o) => o.team === p.team && o.alive,
    );
    const veteran = this.difficulty === "veteran",
      slot = p.weapons[p.selected],
      weapon = WEAPONS[slot.id];
    if (now >= brain.think) {
      brain.think = now + 0.2 + this.rng() * 0.1;
      const candidates = [...this.players.values()]
        .filter((o) => {
          if (
            o.team === p.team ||
            !o.alive ||
            dist(o, p) > (veteran ? 110 : 85)
          )
            return false;
          const angle = Math.atan2(-(o.x - p.x), -(o.z - p.z)) - p.yaw;
          const heard = now - o.lastShot < 0.7 && dist(o, p) < 45;
          return (
            (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 1.5 ||
              heard ||
              dist(o, p) < 10) &&
            canSee(p, o, this.smoke, now)
          );
        })
        .sort((a, b) => dist(a, p) - dist(b, p));
      const target =
        candidates.find((o) => o.id === brain.target) || candidates[0];
      if (target) {
        if (brain.target !== target.id)
          brain.react =
            now + (veteran ? 0.24 : 0.7) + this.rng() * (veteran ? 0.18 : 0.24);
        brain.target = target.id;
        brain.lastSeen = { x: target.x, y: target.y, z: target.z };
        brain.memoryUntil = now + 3;
      } else {
        brain.target = null;
        const heard = [...this.players.values()].find(
          (o) =>
            o.alive &&
            o.team !== p.team &&
            now - o.lastShot < 0.3 &&
            dist(p, o) < 40,
        );
        if (heard) {
          brain.lastSeen = { x: heard.x, y: heard.y, z: heard.z };
          brain.memoryUntil = now + 1.5;
        }
      }
      if (
        target &&
        (p.hp < 45 || slot.ammo < 6 || p.reloadAt) &&
        now >= brain.nextCover
      ) {
        brain.nextCover = now + 2.5;
        brain.coverPoint = cover(p, target, allies);
        brain.coverUntil =
          now +
          (brain.coverPoint ? dist(p, brain.coverPoint) / 3.3 : 0) +
          weapon.reload +
          1.1;
        brain.nextPath = 0;
      }
      if (brain.coverPoint && now < brain.coverUntil) {
        brain.state = "COVER";
        brain.goal = brain.coverPoint;
      } else if (target) {
        brain.coverPoint = null;
        brain.state = "ENGAGE";
        const distance = Math.max(0.1, dist(p, target));
        if (
          distance >
          (weapon.scope ? 48 : weapon.category === "Shotgun" ? 14 : 28)
        )
          brain.goal = { ...brain.lastSeen! };
        else {
          if (now >= brain.nextStrafe) {
            brain.strafe *= -1;
            brain.nextStrafe = now + 1.3 + this.rng();
          }
          const dx = (target.x - p.x) / distance,
            dz = (target.z - p.z) / distance;
          const retreat = distance < 10 ? -3 : 0;
          const peek = {
            x: p.x + dx * retreat - dz * brain.strafe * 2,
            y: p.y,
            z: p.z + dz * retreat + dx * brain.strafe * 2,
          };
          brain.goal = walkClear(p, peek) ? peek : { x: p.x, y: p.y, z: p.z };
        }
      } else if (brain.lastSeen && now < brain.memoryUntil) {
        brain.state = "SEARCH";
        brain.goal = { ...brain.lastSeen };
      } else if (
        dist(p, brain.goal) < 3 ||
        !brain.path.length ||
        brain.state === "ENGAGE" ||
        brain.state === "COVER"
      ) {
        brain.state = "PATROL";
        // Spread patrols across the three harbor lanes without knowing hidden enemy positions.
        const lane = arena.minZ + [46, 94, 136][Math.floor(this.rng() * 3)],
          farSide =
            p.x < (arena.minX + arena.maxX) / 2
              ? arena.maxX - 26
              : arena.minX + 20;
        const candidates = nav.filter(
          (n) => Math.abs(n.z - lane) < 8 && Math.abs(n.x - farSide) < 10,
        );
        const point = candidates[Math.floor(this.rng() * candidates.length)];
        if (point) brain.goal = { x: point.x, y: 0, z: point.z };
        brain.nextPath = 0;
      }
      if (
        Math.hypot(p.x - brain.lastX, p.z - brain.lastZ) < 0.13 &&
        dist(p, brain.goal) > 2
      )
        brain.stuck++;
      else brain.stuck = 0;
      if (brain.stuck >= 4) {
        brain.nextPath = 0;
        brain.strafe *= -1;
        brain.stuck = 0;
        const exit = nav.filter(
          (n) => dist(n, p) > 1 && dist(n, p) < 5 && walkClear(p, n, 0.34),
        );
        if (exit.length)
          brain.goal = exit[Math.floor(this.rng() * exit.length)];
      }
      brain.lastX = p.x;
      brain.lastZ = p.z;
    }
    const target = brain.target ? this.players.get(brain.target) : undefined;
    const visible = !!target && canSee(p, target, this.smoke, now);
    // Briefly breaking line of sight should give Regular players a chance to peek again.
    if (!visible && !veteran) brain.react = Math.max(brain.react, now + 0.35);
    if (now >= brain.nextPath) {
      brain.path = route(p, brain.goal);
      brain.nextPath = now + 0.65 + this.rng() * 0.25;
    }
    while (brain.path.length && dist(p, brain.path[0]) < 0.7)
      brain.path.shift();
    const waypoint = brain.path[0] || p;
    const look = visible ? target! : brain.path[1] || waypoint;
    const aimError =
      visible && !veteran ? Math.sin(now * 1.3 + brain.aimSeed) * 0.012 : 0;
    const desired = Math.atan2(-(look.x - p.x), -(look.z - p.z)) + aimError;
    const angle = Math.atan2(
      Math.sin(desired - p.yaw),
      Math.cos(desired - p.yaw),
    );
    input.yaw =
      p.yaw +
      clamp(angle, -TICK * (veteran ? 4.8 : 2.8), TICK * (veteran ? 4.8 : 2.8));
    Object.assign(input, steering(p, waypoint, input.yaw, allies));
    input.sprint =
      !visible &&
      brain.path.length > 0 &&
      dist(p, brain.goal) > 15 &&
      Math.abs(angle) < 0.6 &&
      !p.reloadAt;
    if (brain.state === "COVER" && dist(p, brain.goal) < 1.4) {
      input.forward = input.strafe = 0;
      input.crouch = true;
      if (slot.ammo < weapon.mag * 0.6)
        this.action(p.id, { type: "action", action: "reload" });
      if (p.hp < 65) this.action(p.id, { type: "action", action: "heal" });
    }
    if (
      slot.ammo + slot.reserve === 0 &&
      p.weapons[p.selected === 0 ? 1 : 0].ammo > 0
    )
      this.action(p.id, { type: "action", action: "swap" });
    if (slot.ammo === 0 || (!visible && slot.ammo < weapon.mag * 0.35))
      this.action(p.id, { type: "action", action: "reload" });
    if (visible) {
      input.ads = true;
      input.sprint = false;
      const pitch = Math.atan2(
        target!.y +
          (target!.crouched ? 0.65 : veteran ? 1.1 : 1.0) -
          (p.y + (p.crouched ? 0.95 : 1.62)),
        Math.max(0.1, dist(p, target!)),
      );
      const error =
        Math.sin(now * 1.7 + brain.aimSeed) * (veteran ? 0.004 : 0.01);
      input.pitch =
        p.pitch + clamp(pitch + error - p.pitch, -TICK * 2.5, TICK * 2.5);
      if (now >= brain.nextBurst && now >= brain.react && !p.reloadAt) {
        brain.burstEnd =
          now +
          (((veteran ? 3 : 2) + Math.floor(this.rng() * 3)) * 60) / weapon.rpm;
        brain.nextBurst =
          brain.burstEnd +
          (veteran ? 0.18 : 0.55) +
          this.rng() * (veteran ? 0.25 : 0.3);
      }
      input.fire =
        now >= brain.react &&
        now < brain.burstEnd &&
        Math.abs(angle) < 0.1 &&
        Math.abs(input.pitch - pitch) < 0.055 &&
        !p.reloadAt &&
        !p.healAt;
      if (weapon.mode === "semi") input.fire &&= !p.fireHeld;
    } else input.pitch *= Math.exp(-TICK * 8);
    return input;
  }
  snapshot(id: string, eventsAfter = 0): Snapshot {
    const you = this.players.get(id)!;
    const entities = [...this.players.values()]
      .filter(
        (p) => p.id !== id && (dist(p, you) < 230 || you.air !== "ground"),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        team: p.team,
        protectedUntil: p.protectedUntil,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        yaw: p.yaw,
        pitch: p.pitch,
        crouched: p.crouched,
        grounded: p.grounded,
        eyeHeight: p.eyeHeight,
        vx: p.vx,
        vz: p.vz,
        air: p.air,
        alive: p.alive,
        selected: p.selected,
        operator: p.operator,
        weapon: p.weapons[p.selected].id,
        attachment: p.weapons[p.selected].attachment,
        firing: this.time - p.lastShot < 0.2,
      }));
    return {
      type: "snapshot",
      mode: "tdm",
      round: this.round,
      rematchReady: [...this.rematchVotes],
      teamPings: [...this.players.values()]
        .filter((p) => p.team === you.team && p.ping && p.pingUntil > this.time)
        .map((p) => ({ ...p.ping!, name: p.name, expires: p.pingUntil })),
      map: this.map,
      scores: { ...this.scores },
      scoreLimit: TDM.scoreLimit,
      winnerTeam: this.winnerTeam,
      scoreboard: [...this.players.values()]
        .map(({ id, name, team, kills, deaths, assists, bot }) => ({
          id,
          name,
          team,
          kills,
          deaths,
          assists,
          bot,
        }))
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
      time: this.time,
      tick: this.tick,
      phase: this.phase,
      phaseEnd: this.phaseEnd,
      elapsed: this.activeAt
        ? Math.min(TDM.duration, this.time - this.activeAt)
        : 0,
      you: structuredClone(you),
      entities,
      removed: [],
      removedLoot: [],
      loot: this.loot.filter((l) => dist(l, you) < 100),
      projectiles: this.projectiles.filter((g) => dist(g, you) < 200),
      events: this.events.filter(
        (e) =>
          e.id > eventsAfter &&
          (!e.to ||
            e.to === id ||
            e.type === "kill" ||
            (e.type === "hit" && e.from === id)) &&
          (e.type === "notice" || e.type === "kill" || dist(e, you) < 230),
      ),
      zone: this.zone,
      alive: this.alive,
      total: this.players.size,
      winner: this.winner,
      humans: this.humans,
      room: this.room,
      tickMs: 0,
      full: true,
    };
  }
  dispose() {
    this.physics.dispose();
  }
}

import { afterEach, expect, it, vi } from "vitest";
import { Engine, type GameUI } from "../game/engine";
import { defaults } from "../game/settings";
import type { Input, Player } from "../packages/game-shared/protocol";

afterEach(() => vi.unstubAllGlobals());

// Exercise the real input listeners without starting a renderer or network connection.
function controls() {
  const listeners = new Map<string, EventListener>();
  const documentListeners = new Map<string, EventListener>();
  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: EventListener) =>
      listeners.set(type, listener),
  });
  vi.stubGlobal("document", {
    addEventListener: (type: string, listener: EventListener) =>
      documentListeners.set(type, listener),
    exitPointerLock: () => {},
  });
  vi.stubGlobal("HTMLInputElement", class {});
  vi.stubGlobal("HTMLSelectElement", class {});
  const engine = Object.assign(Object.create(Engine.prototype), {
    settings: { ...defaults },
    ui: {
      playing: true,
      paused: false,
      map: false,
      inventory: false,
      loadout: false,
      terminal: false,
      snapshot: null,
    },
    local: {
      alive: true,
      air: "ground",
      selected: 0,
      weapons: [{ id: "longbow", attachment: "balanced" }],
      reloadAt: 0,
      plateAt: 0,
      healAt: 0,
    },
    keys: new Set<string>(),
    cleanup: [],
    seq: 0,
    yaw: 0,
    pitch: 0,
    zoomIndex: 1,
    locked: false,
    fallback: true,
    ads: false,
    mouseFire: false,
    clickFire: false,
    airJump: false,
    wasFire: false,
    renderer: { domElement: { addEventListener: () => {} } },
    audio: { resume: () => {} },
    emit: () => {},
  }) as {
    bind(): void;
    input(): Input;
    fallbackResume(): void;
    closeOverlay(): void;
    ui: GameUI;
    local: Player;
    ads: boolean;
    yaw: number;
    pitch: number;
  };
  engine.bind();
  const send = (type: string, fields: Record<string, unknown> = {}) => {
    const event = Object.assign(new Event(type), fields);
    (listeners.get(type) || documentListeners.get(type))?.(event);
  };
  return { engine, send };
}

it("aims only while right mouse is held, including with old toggle preferences", () => {
  const { engine, send } = controls();
  Object.assign(engine, { settings: { ...defaults, adsToggle: true } });
  send("mousedown", { button: 2 });
  expect(engine.input().ads).toBe(true);
  send("mouseup", { button: 2 });
  expect(engine.input().ads).toBe(false);
  send("mousedown", { button: 2 });
  expect(engine.input().ads).toBe(true);
  send("blur");
  expect(engine.input().ads).toBe(false);
});

it("continues dragging aim while both aim and fire buttons are held", () => {
  const { engine, send } = controls();
  send("mousemove", { buttons: 2, movementX: 20, movementY: 0 });
  const first = engine.yaw;
  send("mousemove", { buttons: 3, movementX: 20, movementY: 0 });
  expect(first).not.toBe(0);
  expect(engine.yaw - first).toBeCloseTo(first);
  const afterBoth = engine.yaw;
  send("mousemove", { buttons: 1, movementX: 20, movementY: 0 });
  expect(engine.yaw).toBe(afterBoth);
});

it.each(["reloadAt", "plateAt", "healAt"] as const)(
  "uses normal look sensitivity while %s cancels scoped aiming",
  (timer) => {
    const { engine, send } = controls();
    engine.ads = true;
    send("mousemove", { buttons: 2, movementX: 20, movementY: 0 });
    const scoped = engine.yaw;
    engine.local[timer] = 100;
    send("mousemove", { buttons: 2, movementX: 20, movementY: 0 });
    const busy = engine.yaw - scoped;
    expect(engine.input().ads).toBe(false);
    engine.ads = false;
    send("mousemove", { buttons: 2, movementX: 20, movementY: 0 });
    const normal = engine.yaw - scoped - busy;
    expect(busy).toBeCloseTo(normal);
    expect(Math.abs(busy)).toBeGreaterThan(Math.abs(scoped) * 8);
  },
);

it("discards a pending click and airborne jump after losing focus", () => {
  const { engine, send } = controls();
  engine.local.air = "fall";
  send("mousedown", { button: 0 });
  send("keydown", { code: "Space", repeat: false });
  send("blur");
  const next = engine.input();
  expect(next.fire).toBe(false);
  expect(next.jump).toBe(false);
});

it("resumes without firing or moving from keys held before or during pause", () => {
  const { engine, send } = controls();
  send("mousedown", { button: 0 });
  send("keydown", { code: "KeyW", repeat: false });
  send("keydown", { code: "Escape", repeat: false });
  expect(engine.ui.paused).toBe(true);
  send("keydown", { code: "KeyD", repeat: false });
  engine.fallbackResume();
  const next = engine.input();
  expect(next.fire).toBe(false);
  expect(next.forward).toBe(0);
  expect(next.strafe).toBe(0);
  send("keydown", { code: "KeyW", repeat: false });
  expect(engine.input().forward).toBe(1);
});

it("closes a fallback overlay without restoring stale aim or firing", () => {
  const { engine, send } = controls();
  send("mousedown", { button: 2 });
  send("mousedown", { button: 0 });
  send("keydown", { code: "KeyM", repeat: false });
  expect(engine.ui.map).toBe(true);
  engine.closeOverlay();
  const next = engine.input();
  expect(next.ads).toBe(false);
  expect(next.fire).toBe(false);
});

it("scrolls primary, pistol and knife in both directions and ignores paused/menu wheels", () => {
  const { engine, send } = controls(),
    action = vi.fn();
  Object.assign(engine, { action, wheelAt: -1 });
  send("wheel", { deltaY: 100, ctrlKey: false });
  expect(action).toHaveBeenLastCalledWith("swap", "1");
  engine.local.selected = 1;
  Object.assign(engine, { wheelAt: -1 });
  send("wheel", { deltaY: 100 });
  expect(action).toHaveBeenLastCalledWith("swap", "2");
  engine.local.selected = 2;
  Object.assign(engine, { wheelAt: -1 });
  send("wheel", { deltaY: 100 });
  expect(action).toHaveBeenLastCalledWith("swap", "0");
  engine.local.selected = 0;
  Object.assign(engine, { wheelAt: -1 });
  send("wheel", { deltaY: -100 });
  expect(action).toHaveBeenLastCalledWith("swap", "2");
  engine.ui.paused = true;
  send("wheel", { deltaY: 100 });
  expect(action).toHaveBeenCalledTimes(4);
  engine.ui.paused = false;
  engine.ui.map = true;
  send("wheel", { deltaY: 100 });
  expect(action).toHaveBeenCalledTimes(4);
});

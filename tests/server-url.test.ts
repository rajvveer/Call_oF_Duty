import { afterEach, expect, it, vi } from "vitest";
import { gameServerUrl } from "../game/server-url";

afterEach(() => vi.unstubAllGlobals());

it("uses the public config on Vercel for both lobby and match connections", async () => {
  vi.stubGlobal("location", {
    hostname: "ashvector-test.vercel.app",
    protocol: "https:",
  });
  const fetchConfig = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ server: "wss://temporary.example.com" }),
    });
  vi.stubGlobal("fetch", fetchConfig);
  expect(await gameServerUrl()).toBe("wss://temporary.example.com/");
  expect(fetchConfig).toHaveBeenCalledWith("/game-config.json", {
    cache: "no-store",
    signal: undefined,
  });
  expect(await gameServerUrl("https://manual.example.com")).toBe(
    "wss://manual.example.com/",
  );
  expect(fetchConfig).toHaveBeenCalledTimes(1);
});

it.each(["localhost", "127.0.0.1", "192.168.1.4"])(
  "keeps %s local without relying on the public tunnel",
  async (hostname) => {
    vi.stubGlobal("location", { hostname, protocol: "http:" });
    const fetchConfig = vi.fn();
    vi.stubGlobal("fetch", fetchConfig);
    expect(await gameServerUrl()).toBe(`ws://${hostname}:8787/`);
    expect(fetchConfig).not.toHaveBeenCalled();
  },
);

it("rejects non-WebSocket URLs and respects a cancelled hosted-config lookup", async () => {
  vi.stubGlobal("location", {
    hostname: "ashvector-test.vercel.app",
    protocol: "https:",
  });
  await expect(gameServerUrl("ftp://example.com")).rejects.toThrow(
    /game server address/,
  );
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")),
  );
  await expect(gameServerUrl("", controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});

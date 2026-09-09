// Matchmaking and the room browser must resolve the same backend on hosted frontends.
export async function gameServerUrl(override = "", signal?: AbortSignal) {
  const normalize = (value: string) => {
    const url = new URL(value);
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    if (!["ws:", "wss:"].includes(url.protocol))
      throw Error("Use a ws:// or wss:// game server address.");
    return url.toString();
  };
  if (override.trim()) return normalize(override.trim());
  const host = location.hostname;
  const local =
    ["localhost", "127.0.0.1", "[::1]"].includes(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  const fallback = `${location.protocol === "https:" ? "wss:" : "ws:"}//${host}:8787`;
  if (local) return normalize(fallback);
  const response = await fetch("/game-config.json", {
    cache: "no-store",
    signal,
  }).catch((error) => {
    if (signal?.aborted) throw error;
    return null;
  });
  if (response?.ok) {
    const config = (await response.json()) as { server?: unknown };
    if (typeof config.server === "string" && config.server.trim())
      return normalize(config.server.trim());
  }
  return normalize(fallback);
}

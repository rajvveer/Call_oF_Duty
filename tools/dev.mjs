import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
const lan = process.argv.includes("--lan");
const privateIPv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const interfaces = Object.entries(networkInterfaces()).flatMap(
  ([name, entries]) =>
    (entries || [])
      .filter(
        (n) =>
          n.family === "IPv4" && !n.internal && privateIPv4.test(n.address),
      )
      .map((n) => ({ name, address: n.address })),
);
const requested = process.env.GAME_HOST;
if (lan && requested && !interfaces.some((n) => n.address === requested))
  throw Error("GAME_HOST must match a private IPv4 address on this computer.");
const address =
  requested ||
  interfaces.find(
    (n) =>
      !/vmware|vbox|virtual|vethernet|docker|wsl|loopback|tailscale|zerotier|vpn|tun\d|tap\d/i.test(
        n.name,
      ),
  )?.address;
if (lan && !address)
  throw Error(
    "No physical private IPv4 LAN address found. Connect to Wi-Fi, set GAME_HOST to a private adapter address, or use npm run dev.",
  );
const host = lan ? address : "127.0.0.1";
const options = { stdio: "inherit", env: { ...process.env, GAME_HOST: host } };
if (lan)
  console.log(
    `LAN game: http://${host}:3000 - use this address on computers on the same Wi-Fi.`,
  );
const server = spawn(
  process.execPath,
  ["--watch", "--import", "tsx", "apps/game-server/index.ts"],
  options,
);
const client = spawn(
  process.execPath,
  ["node_modules/vinext/dist/cli.js", "dev", "--host", host],
  options,
);
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  server.kill();
  client.kill();
  setTimeout(() => process.exit(), 500).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", stop);
client.on("exit", stop);

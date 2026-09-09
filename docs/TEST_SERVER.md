# Temporary PC game server

Authorized by the user on 2026-09-08. The Node game server stays bound to `127.0.0.1:8787`; Cloudflare forwards a temporary public URL to that port. No Render service was created.

- WebSocket: `wss://airlines-representation-directory-origins.trycloudflare.com`
- Health: `https://airlines-representation-directory-origins.trycloudflare.com/health`
- Room browser: `https://airlines-representation-directory-origins.trycloudflare.com/rooms`

The game server and tunnel run as hidden processes on the PC. Their current PIDs are recorded in `C:/Users/admin/Desktop/cod/work/test-server.pid` and `C:/Users/admin/Desktop/cod/work/test-tunnel.pid`; diagnostics use the corresponding `test-server-*` and `test-tunnel-*` logs. On 2026-09-08 Windows reported an unexpected shutdown at 16:42:52 IST and a boot at 17:01:04; both earlier processes had stopped. They were restarted and the frontend configuration updated. The previous copper-ever-investments-sudden tunnel is expired. The computer and both processes must remain running. A quick-tunnel restart normally changes its address and requires republishing the frontend config. Windows was subsequently restarted again at 20:41:24 IST; this tunnel was restored around 22:05 IST with a new address. No automatic Windows startup task is installed. Run the stop command below from the local game checkout (`C:/Users/admin/Desktop/cod`).

To stop this test tunnel safely in PowerShell:

```powershell
$tunnelId = [int](Get-Content -LiteralPath work/test-tunnel.pid)
$tunnelProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $tunnelId"
if ($tunnelProcess.Name -eq 'cloudflared.exe' -and $tunnelProcess.CommandLine -match 'http://127\.0\.0\.1:8787(?:\s|$)') {
  Stop-Process -Id $tunnelId
}
```

## Vercel frontend

Deploy this updated project using Vercel's **Next.js** framework preset. `vercel.json` selects `next build --webpack`; `next.config.ts` preserves the game's Three.js WebGPU alias. Leave the output directory at the Next.js default. The usual `npm run build` still produces the existing local Vinext build.

The public backend address is already in `public/game-config.json`. Both matchmaking and the Multiplayer room browser read that file on a hosted frontend. Localhost and private LAN addresses continue using their local port 8787, unless an explicit server override is entered in Settings. Clear an old Settings override if it points to another backend.

Validation: public HTTPS health and room-list requests succeeded; a WebSocket handshake carrying a Vercel Origin received the Verdant match snapshot, all three weapon slots and acknowledgement of input sequence 1. No reconnect tokens were placed in URLs or logs.

[Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) describes the temporary service and its availability limits.


The server and tunnel were restored on 2026-09-09 after the 11:17:05 IST PC boot. The current URL is shown above and the actual process IDs remain in the local work PID files. Regular bots retain the easier reaction and firing behavior.

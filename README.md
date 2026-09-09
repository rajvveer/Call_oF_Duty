# ASHVECTOR: Team Deathmatch

The user authorized a public ChatGPT Sites frontend on 2026-09-08, using the temporary PC backend recorded in `public/game-config.json`. This supersedes the earlier frontend hosting plan; the backend still depends on the PC and Cloudflare tunnel remaining online.

A local 6v6 multiplayer FPS with six selectable maps: the compact Verdant Core botanical atrium, Sable Harbor, The Foundry, Switchyard, Citadel and Slate Quarry. First team to 50 kills wins; an eight-minute deadline resolves by team score, including draws. Empty slots are filled by AI. This is a playable browser game with stylized assets.

## Play locally

The user requested local-only operation on 2026-09-06. Public Sites access has been restricted to the owner and the public Cloudflare Tunnel stopped. Permanent deletion of the remote Sites project is pending access to its owner account in the management UI.

Do not publish, deploy, or expose a public tunnel without a new explicit request. Local game source and assets are retained.

On 2026-09-08 the user authorized a temporary public game-server tunnel from this PC for testing and chose to deploy the frontend to Vercel themselves. This exception does not change the old Sites project's access or authorize pushing to its repository. See [temporary test-server setup](docs/TEST_SERVER.md).

## Local development

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The same command starts the authoritative server on port 8787. For two real players, open another browser and enter the same room code. Active matches accept joins. Up to twelve human players share a match; AI fills the remaining places, with six operators per team. Warmup lasts eight seconds. Both services bind to loopback and stay local to this computer.

For friends on the same Wi-Fi or Ethernet, stop the running development command and use `npm run dev:lan`. Open the private address printed in its output on each computer; choose **Multiplayer**, join a listed room or share its invite link. LAN mode binds to one private network interface; it does not create a public tunnel. Firewall rules are not changed automatically. If multiple private adapters exist, set `GAME_HOST` to the intended private IPv4 address. The default `npm run dev` still binds only to this computer.

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run assets:process
npm run assets:validate
npm run assets:report
npm run loadtest -- --clients=20 --seconds=15
```

The load-test command requires the game service running in another terminal (`npm run start:server`).

Use `npm run dev:client` or `npm run dev:server` to run each service separately. `npm run start:server` starts only the game service. The development server reloads the game when source files change; use a production build for uninterrupted testing.

## Controls

WASD move, mouse aim, left click fire/slash, right click ADS, Shift sprint, C/Ctrl crouch, sprint+C slide, Space jump, R reload, mouse wheel or 1/2/3 for primary/pistol/knife, H armor, V healing syringe, G throw, Q grenade type, M map/ping, Tab scoreboard, B next-respawn loadout, Esc pause, F3 telemetry. If mouse capture is refused, choose **Play with drag aim**, then hold right mouse to look.

**Hold right mouse** to aim; releasing it exits ADS. **Z** cycles scope magnification, **Shift while stationary and scoped** holds breath for up to three seconds, and **I** inspects the weapon. Scoped rifles have 4x/8x zoom; the precision attachment on other eligible rifles and SMGs has 2x/4x zoom. Choose a perk in Arsenal; weapon, attachment and perk changes during a match take effect on respawn.

## Implemented

- Server-authoritative team scores, friendly-fire immunity, three-second respawns, two-second spawn protection (ends when firing or throwing), collision-aware team spawns and active-match joins.
- Eleven weapon choices with imported models, including WA2000 and Scoped Hunting Rifle; mounted optics, magnified reticles, breath control, automatic empty-magazine reload, pistol secondary, restored loadouts every life, physical frag/smoke/flash grenades and health regeneration after five seconds without damage.
- Four balanced perks: Standard, Quick Hands, Lightweight and Tactical. Faster reloads, speed or blast/flash resistance come with reserve-ammunition, armor or speed trade-offs, enforced by the server.
- Six bounded arenas with shared collision geometry, map-specific navigation, team spawns and minimaps. Verdant Core is a new 60 x 70m botanical arena with sheltered spawns, ceramic cover, garden flanks and a central living sculpture. Choose a battleground in Operations; room codes join the host's chosen map. TDM has no insertion, shrinking storm, loot race or last-player-standing rules.
- A permanent knife slot with a visible slash, close-range server-checked damage and no ammunition consumption. Scroll in either direction to cycle all three slots. Healing uses an imported syringe with a 2.8-second injection and plunger animation; taking damage or switching weapons cancels it without consuming the syringe.
- Blue/red operator panels, ally markers, team minimap, live score/timer, kill feed, respawn countdown, team scoreboard and finished-match career records.
- Room browser, private-network invite links, ten-second automatic reconnect reservation, and unanimous human-player rematch voting. Assists, kill streaks, killer/weapon details and temporary team pings provide match feedback.
- Sharper PBR ground and concrete, HDR environment reflections, 2048px shadows focused around the player, contact ambient occlusion, bloom and antialiasing. Painted loading bays, illuminated team sectors and worn asphalt dress the arena.
- PBR firearm finishes, authored textured gloves and sleeves, animated magazine/bolt handling, spring recoil, smooth crouch/steps and camera/weapon landing impact. Jumping requires releasing Space between jumps.
- 60Hz simulation with 20Hz snapshots, WebGPU with WebGL2 fallback, graphics/audio/input settings, prediction and reconciliation, recorded positional audio and performance telemetry. Adaptive resolution, a cached minimap background, distance-based animation updates and corrected frame pacing reduce rendering overhead.

## Validation

`npm test` checks TDM scoring, respawn protection/loadouts, team joins, grenade ownership, spawn collision, movement, weapon handling, scope magnification, breath control, perks, reconnect ownership, rematches, frame pacing, wheel controls, knife range/wall blocking, syringe completion/cancellation and assets. `npx tsx tools/full-match.ts verdant` runs a complete AI match on the new map and checks team-score consistency. `npm run build` produces the local build; it does not publish it.

## Limits

Bots use an A* ground-floor route graph, line-of-sight perception, short-lived memory, cover seeking, paced bursts and ally separation, with engagement ranges suited to their guns. Rooftop navigation remains unsupported. Weapons use hitscan and approximate body regions. The AK-74 uses its original matched weapon/arms animations; other rifles use a horizontal-grip pose, with pistol and SMG grips separate. The textured operator blends locomotion with runtime aiming and foot-grounded crouch IK; death motion remains procedural. The Remington is a simpler model than the PBR rifles. Scopes magnify the camera beneath a circular reticle, without a second render through the physical glass. Scoped Hunting is the existing rifle fitted with an authored scope; no bolt-action animation is claimed. Desktop keyboard/mouse only. Career and settings are stored in this browser. Reconnect reservation lasts ten seconds and is kept in memory for the active page; refreshing or closing the page does not restore the session. Existing island/flight source and assets are retained locally.

See [tactical reference notes](docs/TACTICAL_REFERENCES.md), [asset licenses](docs/ASSET_LICENSES.md), [research](docs/RESEARCH.md), [architecture](docs/ARCHITECTURE.md), [networking](docs/NETWORKING.md) and [performance](docs/PERFORMANCE.md).

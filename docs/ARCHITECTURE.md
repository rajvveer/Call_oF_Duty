# Architecture

The client is TypeScript, React for menus/HUD, Three.js WebGPURenderer and browser Web Audio. The retained scaffold supplies Vite/Vinext; operation is local-only and its hosting configuration is not deployment authorization. The renderer initializes WebGPU and falls back to WebGL2; standard PBR materials work on both. The game engine is dynamically imported after the menu shell.

The server is Node.js with `ws`. Rapier is used for grenade rigid bodies, continuous collision detection and restitution. Movement is a shared deterministic controller against a spatial grid of architectural AABBs and analytic terrain; it provides stair step-up, ceilings, crouch, sliding, jumping and mantling. This avoids serializing an entire physics world for client prediction.

`packages/game-shared/` owns game data, protocol, movement, six arena layouts, scopes and perk rules. `apps/game-server/` owns transport, reconnect sessions, match simulation, navigation and projectile physics. `game/` owns rendering, sound, presentation, input, network reconciliation and React lobby/map/HUD surfaces. `app/` owns menus and local preferences/progression. Legacy island/flight/zone code remains in the checkout but is inactive in TDM.

Each room owns twelve combatants in 6v6 teams, with up to twelve human connections. Bots use the same collision, weapon and damage rules. Perception checks range, field of view, line of sight, smoke, reaction delay and imprecise aim. A cached A* ground-floor graph with path smoothing supplies routes; cover seeking, short-lived memory, ally separation and gun-specific engagement ranges guide combat. Rooftop routing is unsupported. Scores, damage, assists, respawns and perk trade-offs are server-owned; a unanimous human vote starts a new round in the same room.

No database or authentication is claimed. Callsigns and career records are browser-local guest data. In-match progression and outcomes are server-owned. No final damage or position is accepted from a client.

The source asset layer is separate from runtime/public output. glTF Transform deduplicates and prunes assets, resamples animations, generates simplified static LOD files and applies Meshopt compression. Shared materials/geometries and instanced vegetation reduce allocations. Architecture is merged into 64m chunks; chunks outside the chosen render range are hidden, with normal frustum culling. Static decorative assets do not all have exact colliders.

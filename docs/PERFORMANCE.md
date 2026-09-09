# Performance and validation

Measurements are from this Windows development machine and Chrome, not a hardware-wide guarantee. Browser automation can throttle inactive tabs and cannot reproduce ordinary pointer-lock approval in this environment.

- Version 0.1 baseline observed active rendering: approximately 59–60 FPS at the browser's 1920×855 viewport, medium settings, in both WebGPU development rendering and the WebGL2 production fallback. Sample gameplay telemetry showed about 340 draw calls and 199,403 triangles. These are spot observations, not 1080p percentile captures.
- Two browser clients joined the same real room; its HUD reported two humans and fourteen bots. An encrypted public Tunnel connection was also tested; observed RTT was roughly 84–210ms.
- The accelerated full-match run completed in 241.9 simulated seconds with one winner and fourteen combat eliminations. The winning bot scored five kills. See `benchmarks/full-match.json`.
- 30 deterministic tests pass: damage/falloff, armor, probabilities, zone timing, malformed input, ammunition, fire cadence, reload, pickups, cache opening, plate timing, terminal ownership/cost, duplication prevention, match transitions/deadline, movement, roof landing and Rapier grenade contact.
- Production build and typecheck pass. npm audit reported zero vulnerabilities after dependency updates.

## Connection harness

These are local loopback runs across multiple rooms. Each room permits eight humans and sixteen total combatants. The 20/50 samples preceded loot-delta optimization; the 100 sample includes it. No claim of a hundred combatants in one room is made.

| Clients | Connected / errors | Median RTT | P95 RTT | Median simulation tick | P95 simulation tick | Server RSS at end |
| ------: | -----------------: | ---------: | ------: | ---------------------: | ------------------: | ----------------: |
|      20 |             20 / 0 |     0.88ms |  5.44ms |                 2.94ms |              5.83ms |             134MB |
|      50 |             50 / 0 |     6.07ms | 10.78ms |                 5.28ms |             10.22ms |             240MB |
|     100 |            100 / 0 |    13.89ms | 20.00ms |                 8.67ms |             18.41ms |             247MB |

The 12.1-second 100-client sample covered thirteen rooms during warmup, before the 35-second insertion transition. The reported tick duration covers simulation and omits snapshot serialization/broadcast. The 100-client run delivered about sixteen snapshots/second/client, below the 20Hz target, so JSON encoding/broadcast is a known scale bottleneck. Mean received traffic was about 82KB/s/client in that sample. Do not certify 100-client production capacity from a twelve-second localhost harness. Raw measurements are retained in `benchmarks/load-{20,50,100}.json`, including CPU counters and RSS.

## Asset budget

Processing reduced 89 base asset files from 14.45MB to 9.41MB (35%). Including separately generated LODs, all 132 runtime files total 10.31MB. Only requested runtime assets are downloaded. All operator clips remain (24); caches retain three clips each. The complete runtime report is `assets/runtime-report.json`.

PBR images are capped at 1K. They are JPEG/palette textures, not GPU-compressed KTX2. The aggregate texture estimate counts repeated embedded palettes and both LOD copies, so it is not actual observed VRAM. Meshopt, instancing, merged chunks, relevance filtering, constrained effects and resolution scaling are implemented. KTX2, stronger occlusion, a worker renderer and a baked navigation mesh remain future work.

Final regression coverage also checks input acknowledgement during the transport phase and animated operator bounds after skinning. The production drag-aim fallback, tactical map zoom and insertion controls were exercised in the browser. Default pointer capture was refused by the browser-control environment with “The root document of this element is not valid for pointer lock.” The fallback remains playable. A later production gameplay sample showed 60 FPS, 581 draw calls and 416,779 triangles with 15 animated remote entities.

A further regression verifies that a gap in received input packets does not create a false semi-automatic trigger release.

Docker engine was unavailable during verification; the supplied container configuration has not been build-tested here.

## Version 0.2 presentation upgrade

The new HDR/GTAO/bloom/FXAA renderer composites separate world and weapon targets. A clearDepth/direct second-screen pass was replaced after visual QA caught a black world and weapon trails. The corrected composition was checked in a live match. New tests cover frame-rate-independent recoil settling, magazine choreography/timing, actual 25cm magazine travel and raised-arm skinning targets. Original 0.1 FPS measurements above are not a benchmark of these new effects; inactive browser tabs can throttle the observed overlay to 1–2 FPS.

The runtime report now contains 163 files / 14.89MB including LODs, audio and HDR. The upgrade adds roughly 4.58MB of locally hosted models and recordings. Mechanical part/rotor models preserve their original coordinate spaces rather than receiving quantization that would invalidate procedural part anchors.

## September 8 TDM feature validation

The earlier measurements above describe historical builds, including the retired battle-royale rules and public tunnel. Current operation is local-only, 6v6 TDM on five selectable arenas.

The initial feature pass passed 68 tests, typecheck, lint and the production build. These checks cover eleven imported weapon choices, scopes, breath control, four perks, reconnect ownership, assists, rematches, bounded team pings and frame pacing. A full AI match reached 50-38 after 209.12 simulated seconds in 11.81 wall seconds with scores matching all 88 credited kills. This accelerated run is a gameplay regression, not a live rendering benchmark.

The reconnect integration harness used two actual WebSocket peers and the client's connection methods: unexpected-drop recovery retained identity, equipment and scores; takeover was rejected; unanimous rematch voting and normal-leave cleanup passed. LAN mode has not been validated between two physical computers.

Deterministic checks verify 60 rendered frames per second at 90/120/144/165/240 Hz display cadences. The former deadline calculation could drop 144 Hz to 48 FPS. Scope-hidden recoil continues settling, the minimap caches its static map, distant actors animate at 30 Hz, and adaptive resolution changes only in a visible, focused tab. Navigation graphs for all five maps are warmed before accepting connections, removing the measured 323-990 ms first-tick construction stalls.

In browser UI checks, the WA2000's 4x/8x scope, zoom switching, single shot and magazine/reserve reload changes worked with no browser error logs. Automation's inactive-tab frame counter is not used as evidence of active gameplay FPS. The existing WebGPU render path and WebGL2 fallback remain available. Modern assets and effects increase download/GPU cost relative to the historical asset totals above.

Production browser verification also rendered the Scoped Hunting Rifle scope in WebGL2 without error logs. The room-browser UI joined a second human onto the opposing team and correctly reported two humans plus ten AI. The final game runs from the local production build with both services bound to 127.0.0.1, avoiding development-watcher match resets.

The follow-up control and combat pass brings coverage to 77 passing tests. Real engine event listeners are exercised without a renderer: simultaneous aim/fire drag, interrupted ADS during reload/heal/armor, queued clicks/jumps on focus loss, paused movement, and overlay closure. Additional server regressions ensure overlapping flashes cannot shorten an existing flash and grenade deaths identify the grenade. Quick Join clears a previously entered room code; full live rooms and finished rooms have distinct labels, and old invite copy fields clear when changing matches.

The ADS obstruction regression brings coverage to 79 tests. The original horizontal right sleeve intersected the M4 centre ray only 2.96 cm from the eye. A one-time elbow correction bends sleeve vertices beyond the wrist while preserving all hand/grip positions and the shared source geometry. M4 ADS now lines up its rear aperture and front sight. Tests use the shipped rifle/arm geometry and actual viewmodel updates across repeated aim transitions, lateral sway and bob for six rifles. Right mouse is hold-to-aim, including when old saved settings requested toggle aim.

## Verdant, field equipment and selected-map rendering

The compact Verdant Core map adds 21 collision-matched cover objects and ten static instanced render draws. Its six-map integration checks pass safe spawns, bounds and ground-floor routes. An accelerated AI match ended 50-37 after 98.6 simulated seconds (1.61 seconds wall time), with all 87 kills matching team scores. This is a gameplay check, not an FPS measurement.

A real-asset offline scene census averaged eight view headings at each original map centre. Selecting only nearby nature instances and overlapping world chunks reduced submitted world triangles by roughly 42-58%: Harbor 295,717 to 172,775; Foundry 293,735 to 124,500; Switchyard 295,316 to 130,007; Citadel 299,090 to 140,503; Quarry 294,726 to 169,929. Estimated visible mesh draws also decreased (Harbor 170 to 148). These are geometry/frustum estimates with a 112m nature halo and 64m chunk halo, excluding avatars, shadow passes and postprocessing; they are not measured GPU frame times. The implementation uses a 96m halo plus each prop's size.

Original instance matrices remain immutable and are restored on map changes. Tests outside the checkout verified loading late GLBs, switching all six maps twice and restoring matching matrix data. Only the selected arena dressing is visible. Hidden menu-operator animation/IK is skipped. Adaptive resolution now responds below 58.8 FPS for a 60 target, can reduce to 0.5 scale, and waits eight seconds before recovering; focus/loading guards remain. No universal 60 FPS floor is claimed.

All 84 gameplay/control tests pass, including three-slot wheel cycling, melee cooldown/range/friendly immunity/wall blocking, and syringe completion/damage/switch cancellation. The viewmodel geometry test now uses the same finite 0.9m fallback length as production; the earlier missing optional length could allow vacuous NaN ray checks. SMG sight alignment additionally passed 2,754 real-geometry arm-clearance samples. Knife/syringe pose renders passed 301 arm-clearance checks.

# Tactical FPS reference notes

The game remains local 6v6 TDM. These references informed this implementation; no CS2 models, textures or maps were copied.

- [Valve: Second Shot](https://blog.counter-strike.net/second-shot/): short bursts and deliberate tapping should recover accuracy faster than sustained spraying. Implemented deterministic recoil and movement/air/spray spread penalties.
- [CS2 overview](https://www.counter-strike.net/cs2): reference for detailed weapon surfaces and responsive shooting. This implementation uses fixed 60Hz simulation and 20Hz snapshots; it does not implement Valve's proprietary sub-tick system.
- [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/): grounded-only stepping, obstacle clearance and descending ground snap. Implemented a shared swept circular controller with jump buffering and coyote time.
- [Gaffer: Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/): fixed simulation steps and capped catch-up. Client prediction, server steps and partial-tick camera preview use the same movement function.
- [Red Blob: A*](https://www.redblobgames.com/pathfinding/a-star/introduction.html): collision-expanded route graph, heap-based A*, safe path smoothing.
- [Craig Reynolds: Steering Behaviors](https://www.red3d.com/cwr/steer/gdc99/): path following plus ally separation.
- [Three.js animation blending](https://threejs.org/examples/webgl_animation_skinning_blending.html): blended idle/walk/run states, scaled by actual velocity; aiming applied after the animation mixer.

Bots use sight, recent gunfire and short-lived target memory. They navigate the ground floor, seek reachable occluded cover and fire paced bursts. Stair/roof movement works for players; bots do not route over roofs.

Asset sources, licenses and preparation are listed in [the runtime credits](../public/ASSET_LICENSES.md) and [the asset manifest](../assets/tactical-manifest.json).

Verdant Core is an original compact 60 x 70m arena. [Riot: The Birth of Ascent](https://playvalorant.com/en-us/news/dev/the-birth-of-ascent/) informed readable sightlines, landmarks and player-height backgrounds; [WilkinsonEyre: Gardens by the Bay](https://wilkinsoneyre.com/projects/cooled-conservatories-gardens-by-the-bay) informed the open conservatory ribs and planted focal point. No commercial map layout was copied. Its geometry uses ten static instanced draws, with opaque collision-matched cover and no new dynamic lights or foliage transparency.

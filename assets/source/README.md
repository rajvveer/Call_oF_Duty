# Asset handoff

Copy `runtime/` to the game's local public asset directory. It contains 82 licensed files, ~9.12 MB total. `ASSET_LICENSES.md` is ready for the project's docs directory. `asset-report.json` records per-asset size, triangles, animation names, original asset names, licensing, and SHA-256 hashes. `prepare-assets.cjs` reproduces self-contained GLBs from the adjacent source files.

## Operator

`operator/swat.glb` is a complete rigged humanoid with 24 animation clips, 7,752 triangles and no textures. Clone through Three.js `SkeletonUtils.clone`, not ordinary `Object3D.clone`, so each bot/player gets its own bones. Keep one AnimationMixer per character and select `CharacterArmature|Idle_Gun`, `CharacterArmature|Run`, `CharacterArmature|Run_Shoot`, `CharacterArmature|HitRecieve`, and `CharacterArmature|Death` as appropriate. Crossfade actions. All clip names are recorded in the report. Source FBX coordinate transforms already exist inside the GLB; normalize scene height using Box3 rather than applying an extra centimeter conversion. The model faces +Z. The skin and fabric were changed from metallic to nonmetal; materials otherwise keep original colors.

## Weapons

Prefer the cohesive dark Quaternius `firearms/` assets over the colorful Kenney `weapons/blaster-*.glb` alternatives. Runtime firearm names are descriptive labels, not original source names or real-game weapon names. Assign fictional CINDERLINE weapon names in game data.

The original Quaternius Ultimate Guns Pack models have barrels along +X. Rotate the loaded scene +PI/2 about Y for a Three.js camera facing -Z. Normalize longest-axis length with Box3 before placing on camera; a ~0.18 overall scale yields a ~0.93 m assault rifle. Rifle source length ~5.17, sniper ~7.29, pistol ~1.82. Keep the artist's nested root transforms. Add recoil/sway/ADS on a parent group after scale/orientation normalization.

Recommended eight source variants: assault-rifle, battle-rifle, bullpup, submachine-gun, pump-shotgun, marksman-rifle, sniper-rifle, pistol. The firearms are static meshes, so first-person firing/reload presentation uses parent transforms and any additional magazine/hand meshes. No first-person arm mesh or authored reload animation is supplied.

Kenney crates `weapons/crate-medium.glb` and `weapons/crate-wide.glb` each have three animation clips. Check the names in the report and use an open action for loot. Kenney grenades/scopes/silencers are also included.

## Environment

`industrial/` has 20 exterior buildings, shipping containers, chimneys, tanks, water tower, windmill and solar panels. Their small source units require normalization to world dimensions: `building-a` is about 2.084 x 1.47 x 1.242 source units. These meshes mainly supply exterior silhouettes; enterable hero structures/interiors must be built separately.

`nature/` has pines, rocks, cliffs and bridges. A source pine is roughly 1.5 units high; use desired-height normalization. Nature source metallic=1 was corrected to metallic=0, roughness=.9. Adjust leaf/bark material colors if a restrained coastal palette is desired. Instance repeated rigid props and distance-cull. Sources contain one LOD each; no geometry compression decoder is required.

The three `ground-*.jpg` images are official Poly Haven Aerial Grass Rock 1K diffuse, OpenGL normal and roughness maps. Physical repeat width is 15 m. Diffuse uses sRGB color space; normal and roughness remain linear. Use RepeatWrapping for all maps. The images are actual material maps, not the copyrighted Poly Haven preview renders.

## Verification

The packaging script asserts glTF 2 binary headers, one binary buffer, triangle primitive modes, declared file length and no remaining external image URIs. Per-file SHA-256 hashes and triangle counts are generated from the actual output files. Actual renderer integration and visual QA remain with the game implementation.

## Provenance

All downloaded assets use CC0 1.0 and require no attribution. Voluntary credit is encouraged: Kenney; Quaternius; Rob Tuytel / Poly Haven. Original ZIPs, GLBs and included Kenney License.txt files are retained outside runtime. No Three.js Soldier example is used; the verified CC0 Quaternius operator covers that need.

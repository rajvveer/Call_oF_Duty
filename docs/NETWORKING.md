# Local TDM networking

The Node server simulates at 60 Hz and broadcasts snapshots at 20 Hz. Each room has twelve combatants in two teams, with up to twelve humans and AI filling empty places. The match ends at fifty kills or eight minutes. An existing room code always selects that room's map.

Browser commands carry validated sequence numbers and enter a bounded queue. Each consumed command advances the shared movement controller once. Prediction drops acknowledged commands and replays the remainder. Normal packet gaps do not invent acknowledged movement; after 200 ms without commands, neutral gravity and collision resume so a stalled client cannot hover. Horizontal movement and buffered jumps are cleared in this stale-input path. Reload, damage and match timers continue on the server clock.

Remote transforms, velocity and crouch height interpolate about 100 ms behind the estimated server time. Shot timestamps use that rendered clock. The server bounds rewind and checks approximate head, torso and limb regions against static-world occlusion. Ammunition, fire cadence, action timing, team immunity, spawn protection and perk trade-offs are server-authoritative.

Snapshots carry local authoritative state, relevant players, transient events, grenades, team pings, scores, round and rematch votes. Changed entities and removal IDs reduce traffic; full refreshes occur every two seconds. Welcome messages also initialize sequence and event baselines, including after reconnect. The transport uses JSON, not a binary protocol.

Messages have a 4 KB payload limit, a 120/s message limit and a separate action limit. Invalid input and malformed joins are rejected. Queues are bounded; replaceable snapshots are skipped while a socket is congested. Heartbeats detect abandoned connections. A normal leave releases the slot immediately; an unexpected close reserves the player for ten seconds. The reserved body remains vulnerable and does not respawn while disconnected. A successful resume retains team, score and existing equipment without refilling health or ammo.

Reconnect uses an opaque, random 256-bit token kept only in page/server memory. It is never included in room listings, other players' snapshots, invite URLs or logs. A live owner cannot be displaced, and a late close from an old socket cannot invalidate a resumed owner. The client clears prediction backlog, restores the acknowledged sequence and waits for a full snapshot before sending input. Reloading/closing the page loses its token.

The room browser reads `/rooms`; metadata includes map, round, scores, connected/reserved players and join availability. Results require all remaining humans to vote for a rematch. Removing an expired/disconnected voter rechecks the quorum and refills AI places before the next warmup.

`npm run dev` binds both services to loopback. `npm run dev:lan` explicitly opts into a private network interface and honors a matching private `GAME_HOST` override. Common virtual adapters are excluded from automatic selection. No firewall changes, public tunnel, deployment or Internet matchmaking are configured. Optional `ALLOWED_ORIGINS` restricts browser origins; blank allows guest development. This local guest server does not implement accounts or production anti-cheat.

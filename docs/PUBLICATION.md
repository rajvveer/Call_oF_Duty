# Public frontend publication

The user requested public ChatGPT Sites hosting on 2026-09-08.

The old project reference in this checkout could not be found through the connected account. Its deletion has not been verified. A separate publication checkout preserves that reference and the local game:

- Checkout: `C:\Users\admin\Desktop\cod-public-frontend`
- Project: `appgprj_6a9fde1ab5788191bbd7289eda1cad67`
- Public frontend: `https://ashvector-tdm.rajveershekhawat6969.chatgpt.site`
- Backend: `wss://airlines-representation-directory-origins.trycloudflare.com`

Use the publication checkout's own `.openai/hosting.json` for this frontend. Copy future source changes from the local game into that checkout while preserving its hosting metadata and repository. The backend runs separately on the PC; keep its game-server and Cloudflare processes running. A changed tunnel address requires updating and republishing the frontend config.

Version 1 was published successfully on 2026-09-08. Deployment `appgdep_6a9fe0c176588191841030298745ab3f` reported `succeeded`; access mode is `public`. Source commit: `9e3b7798b06787087d1bef169d25d1801b1ee753`. The publication archive was built and validated from that source, and the public backend passed HTTPS and WebSocket checks. Future changes need their own deployment verification.

After the PC reboot, recovery version 2 was published successfully on 2026-09-08 at 20:08 IST. Deployment `appgdep_6aa01dee9614819187089153f8ee100b` used commit `cb32e9714f627ccd3dff9755243e1797804d679f`. The public frontend now resolves `wss://analog-cool-frequently-endif.trycloudflare.com`; public HTTPS, room-list and WebSocket input/snapshot checks passed. The frontend URL and public audience are unchanged.

Following the next PC restart, version 3 was published successfully on 2026-09-08 at 22:09 IST. Deployment `appgdep_6aa03a25344481919a4fb38c9cb7c5eb` used commit `5719f6842e41c7e5ff388508949eeadca2d91fef`. The current backend is `wss://delays-offering-showing-bathrooms.trycloudflare.com`; public page/config and WebSocket input/snapshot checks passed. Server and tunnel run as hidden processes, with current PIDs in the local `work/` PID files.

On 2026-09-09, version 4 restored the backend at `wss://airlines-representation-directory-origins.trycloudflare.com` and retained the easier Regular bots. Deployment `appgdep_6aa1946ac73481918af07fdfb7f97b51` succeeded using commit `a795e0aec358602b5d97be6e18c8a601e51d7ac8`. Public page/config, HTTPS health and WebSocket input/snapshot checks passed; the frontend URL is unchanged.

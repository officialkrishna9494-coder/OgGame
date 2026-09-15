# 🏠 Cozy Hall — a soft multiplayer place for 5–10 friends

One shared 3D room, not a website. Everyone sees the same hall: wander as a
cute rounded avatar, send emoji, poke, high-five, sit on the sofa, toss a ball,
and watch a synced shared TV — all in real time.

## Quickstart

```bash
npm install
npm run dev        # Next.js + Socket.io on http://localhost:3000
```

Open two browser windows (or send your LAN URL to a friend) and you will see
each other move. No login needed in dev — you walk straight in.

| Script         | What it does                                      |
| -------------- | ------------------------------------------------- |
| `npm run dev`  | dev server with live Socket.io sync (`server.js`) |
| `npm run build`| production build                                  |
| `npm run start`| production server with Socket.io                  |
| `npm run lint` | eslint                                             |

## Identity (env-toggled)

| Env                           | Effect                                              |
| ----------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_AUTH_MODE=dev`   | nickname / quickplay (default)                      |
| `NEXT_PUBLIC_DEV_QUICKPLAY`   | `true` → skip login, walk straight in (dev default) |
| `NEXT_PUBLIC_AUTH_MODE=firebase` | Google Sign-in via Firebase Authentication       |

For deploys with real accounts: set `AUTH_MODE=firebase` and fill in the
`NEXT_PUBLIC_FIREBASE_*` vars. Profiles land in Firestore `users/{uid}`.

## Backend: Firestore + Cloudinary

Without Firebase vars the hall is fully local (room in localStorage). Add
them and `/admin` switches to cloud mode automatically:

- **Firestore** `rooms/cozy-hall` — room config, frames, posters, TV
  playlist. Edits sync to every connected friend live via `onSnapshot`.
- **Cloudinary** — frame/poster photos. Create an **Unsigned** upload preset
  (dashboard → Settings → Upload), then set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
  and `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`. Upload buttons appear in admin.
- **Socket.io** stays ephemeral: presence, movement, emotes, ball, TV sync,
  mini-game state.

## Mini-game nº 1 — ⭐ Star Scramble
Open the ⭐ panel (dock on desktop, ⋯ menu on mobile, or walk onto the rug).
Anyone can start: 12 golden stars spawn for 60 seconds, walk over them to
score. Server validates pickups and keeps the leaderboard; winners get a
toast + fanfare. Intentionally tiny — the next games plug into the same
`ContextState` zone pattern.

## Voice channel (LiveKit Cloud, free tier)

Talk while you wander — whoever joins the hall can hop into voice. Hit 🎙️
in the dock (desktop) or the ⋯ menu (mobile): join, mute, live roster with
speaking rings, leave. Tokens are minted server-side (`/api/livekit-token`,
2h TTL) so your API secret never reaches browsers.

**Get your keys (2 minutes, free):**
1. Sign up at **cloud.livekit.io** → create a project (call it `cozy-hall`).
2. Project page → copy the **WebSocket URL** (`wss://…livekit.cloud`) →
   `NEXT_PUBLIC_LIVEKIT_URL`.
3. **Settings → Keys → Create key** → copy **API Key** → `LIVEKIT_API_KEY`
   and **API Secret** → `LIVEKIT_API_SECRET` (server-only, no `NEXT_PUBLIC_`).
4. Add all three to `.env.local` (restart dev) and Vercel env vars (redeploy).

## Architecture

- **Next.js + TypeScript + Three.js** — one environment (`app/page.tsx`).
  All characters, furniture, and textures are procedural (no assets).
- **Socket.io** (`server.js`) — ephemeral state: presence, movement, emotes,
  poke / high-five, ball, TV sync. Falls back to demo bots when unreachable.
- **Firestore** (next) — persistent room config, frames, posters, playlist.
- **Cloudinary** (next) — actual media files; only URLs live in room data.

## Controls

WASD / arrows to wander · space to hop · scroll to zoom · drag on mobile.
Walk close to a friend to poke / high-five · walk over the ball to grab it.

`/admin` (code `cozy123`, see `ADMIN_CODE`) edits the room: name, memory
frames, posters, TV playlist — all data-driven, no hard-coding.

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
`NEXT_PUBLIC_FIREBASE_*` vars. `/admin` (code `cozy123`, see `ADMIN_CODE`)
edits the room: name, memory frames, posters, TV playlist — all data-driven,
no hard-coding.

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

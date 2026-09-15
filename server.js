// ─── Cozy Hall · realtime server (custom Next server + Socket.io) ───────────
// (CommonJS by design — Next custom servers run as plain Node scripts.)
/* eslint-disable @typescript-eslint/no-require-imports */
// Run locally:   npm run dev        (tsx server.js)
// Deploy:        npm run build && npm run start   (Vercel uses `next start`;
//                host this file on a long-lived Node host for true 10-player
//                sync, or point NEXT_PUBLIC_SOCKET_URL at it).
//
// Data split (as designed):
//   Firestore  → room config, frames, posters, TV playlist, accounts (persistent)
//   Cloudinary → actual media files
//   Socket.io  → presence, movement, emotes, poke/high-five, ball, TV sync (ephemeral)

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Single-hall state (multi-room = prefix keys if you grow beyond one hall)
const players = new Map(); // socketId -> PlayerState
const meta = new Map(); // socketId -> { name, color }
let ball = { x: 3.5, z: 1.0, y: 0.28, vx: 0, vy: 0, vz: 0, holderId: null };
let tv = { playlist: [], index: 0, playing: false, updatedAt: Date.now() };

// ─── Star Scramble (mini-game nº 1) — server is the authority ──────────────
let gameSeq = 1;
let game = { status: "idle", endsAt: 0, endedAt: 0, stars: [], scores: {}, lastCollect: null, winner: null };
const GAME_MS = 60_000;
const STAR_COUNT = 12;

// Spawn blockers mirror lib/room-defaults COLLIDERS (plus margin) so stars
// never land inside the sofa. Loaded from source when available.
function getBlockers() {
  try {
    return require("./lib/room-defaults").COLLIDERS;
  } catch {
    return [
      { x: 0, z: 5.5, hx: 3.0, hz: 0.8 },
      { x: 0, z: 3.0, hx: 1.5, hz: 0.8 },
      { x: 0, z: -10.8, hx: 3.4, hz: 0.7 },
    ];
  }
}

function spawnStar() {
  const blocks = getBlockers();
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() - 0.5) * 27;
    const z = -10.5 + Math.random() * 20;
    const blocked = blocks.some(
      (c) => Math.abs(x - c.x) < c.hx + 0.9 && Math.abs(z - c.z) < c.hz + 0.9
    );
    if (!blocked) return { id: `star-${gameSeq++}`, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }
  return { id: `star-${gameSeq++}`, x: 0, z: -4 };
}

function endGame(io) {
  game.status = "ended";
  game.endedAt = Date.now();
  let best = null;
  for (const s of Object.values(game.scores)) {
    if (!best || s.points > best.points) best = s;
  }
  game.winner = best ? best.name : null;
  io.to("hall").emit(
    "hall:toast",
    best ? `⭐ ${best.name} wins the scramble with ${best.points}!` : "⭐ scramble over — no stars caught!"
  );
}

function snapshot() {
  return { players: Object.fromEntries(players), ball, tv, game };
}

function broadcast(io) {
  io.to("hall").emit("hall:state", snapshot());
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsed = parse(req.url, true);
    handle(req, res, parsed);
  });

  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: "*" },
  });

  // gentle 12Hz relay so 5–10 friends stay smooth without spam
  let dirty = false;
  setInterval(() => {
    if (dirty) {
      dirty = false;
      broadcast(io);
    }
  }, 84);

  // game clock: end rounds + retire result screens
  setInterval(() => {
    if (game.status === "playing" && Date.now() > game.endsAt) {
      endGame(io);
      dirty = true;
    } else if (game.status === "ended" && Date.now() - game.endedAt > 9000) {
      game = { status: "idle", endsAt: 0, endedAt: 0, stars: [], scores: {}, lastCollect: null, winner: null };
      dirty = true;
    }
  }, 500);

  io.on("connection", (socket) => {
    socket.on("hall:join", ({ name, color }) => {
      socket.join("hall");
      const clean = String(name || "Friend").slice(0, 14);
      meta.set(socket.id, { name: clean, color: String(color || "#ffb3c7") });
      players.set(socket.id, {
        id: socket.id,
        name: clean,
        color: String(color || "#ffb3c7"),
        x: (Math.random() - 0.5) * 12,
        z: 5 + Math.random() * 3,
        facing: Math.PI,
        moving: false,
        sitting: false,
        jumping: false,
      });
      socket.to("hall").emit("hall:toast", `${clean} stepped in ✨`);
      dirty = true;
      socket.emit("hall:state", snapshot());
    });

    socket.on("hall:move", (p) => {
      const m = meta.get(socket.id);
      if (!m) return;
      players.set(socket.id, {
        id: socket.id,
        name: m.name,
        color: m.color,
        x: Number(p.x) || 0,
        z: Number(p.z) || 0,
        facing: Number(p.facing) || 0,
        moving: !!p.moving,
        sitting: !!p.sitting,
        jumping: !!p.jumping,
        emote: players.get(socket.id)?.emote,
        emoteAt: players.get(socket.id)?.emoteAt,
        action: players.get(socket.id)?.action,
        actionAt: players.get(socket.id)?.actionAt,
        actionTarget: players.get(socket.id)?.actionTarget ?? null,
      });
      dirty = true;
    });

    socket.on("hall:emote", ({ emote }) => {
      const cur = players.get(socket.id);
      if (!cur) return;
      players.set(socket.id, { ...cur, emote: String(emote).slice(0, 8), emoteAt: Date.now() });
      dirty = true;
    });

    const action = (kind) => ({ targetId } = {}) => {
      const cur = players.get(socket.id);
      if (!cur) return;
      players.set(socket.id, { ...cur, action: kind, actionAt: Date.now(), actionTarget: targetId ?? null });
      if (kind === "poke" && targetId && players.has(targetId)) {
        const target = players.get(targetId);
        io.to("hall").emit("hall:toast", `${cur.name} poked ${target.name} 👉`);
        const victim = players.get(targetId);
        players.set(targetId, { ...victim, action: "poke", actionAt: Date.now(), actionTarget: socket.id });
      }
      if (kind === "highfive") {
        const target = targetId && players.has(targetId) ? players.get(targetId) : null;
        io.to("hall").emit(
          "hall:toast",
          target ? `${cur.name} + ${target.name} high-fived! 🙌` : `${cur.name} threw a high-five! 🙌`
        );
        if (target) {
          players.set(target.id, { ...target, action: "highfive", actionAt: Date.now(), actionTarget: socket.id });
        }
      }
      dirty = true;
    };
    socket.on("hall:poke", action("poke"));
    socket.on("hall:highfive", action("highfive"));

    socket.on("hall:sit", ({ sitting }) => {
      const cur = players.get(socket.id);
      if (!cur) return;
      players.set(socket.id, { ...cur, sitting: !!sitting });
      dirty = true;
    });

    socket.on("hall:ball", (b) => {
      ball = {
        x: Number(b.x) || 0,
        z: Number(b.z) || 0,
        y: Number(b.y) || 0.28,
        vx: Number(b.vx) || 0,
        vy: Number(b.vy) || 0,
        vz: Number(b.vz) || 0,
        holderId: b.holderId === null || b.holderId === undefined ? null : String(b.holderId),
      };
      // translate local "me" holder ids to real socket ids
      if (ball.holderId === "me") ball.holderId = socket.id;
      dirty = true;
    });

    socket.on("hall:ball:toss", () => {
      ball = { ...ball, holderId: null };
      dirty = true;
    });

    socket.on("hall:tv", (patch) => {
      tv = { ...tv, ...patch, updatedAt: Date.now() };
      dirty = true;
    });

    socket.on("game:start", () => {
      if (game.status === "playing") return;
      const m = meta.get(socket.id);
      game = {
        status: "playing",
        endsAt: Date.now() + GAME_MS,
        endedAt: 0,
        stars: Array.from({ length: STAR_COUNT }, () => spawnStar()),
        scores: {},
        lastCollect: null,
        winner: null,
      };
      io.to("hall").emit("hall:toast", `⭐ ${m?.name ?? "Someone"} started a star scramble — grab them!`);
      dirty = true;
    });

    socket.on("game:collect", ({ starId } = {}) => {
      if (game.status !== "playing") return;
      if (Date.now() > game.endsAt) {
        endGame(io);
        dirty = true;
        return;
      }
      const idx = game.stars.findIndex((s) => s.id === starId);
      if (idx === -1) return;
      const p = players.get(socket.id);
      const star = game.stars[idx];
      // latency-lenient server validation — the client already stood on it
      if (p && Math.hypot(p.x - star.x, p.z - star.z) > 2.5) return;
      game.stars.splice(idx, 1);
      const m = meta.get(socket.id);
      const name = m?.name ?? "Friend";
      game.scores[socket.id] = { name, points: (game.scores[socket.id]?.points ?? 0) + 1 };
      game.lastCollect = { by: socket.id, name, at: Date.now() };
      game.stars.push(spawnStar());
      dirty = true;
    });

    socket.on("hall:room", (room) => {
      socket.to("hall").emit("hall:room", room);
    });

    socket.on("disconnect", () => {
      const m = meta.get(socket.id);
      players.delete(socket.id);
      meta.delete(socket.id);
      if (ball.holderId === socket.id) ball.holderId = null;
      if (m) socket.to("hall").emit("hall:toast", `${m.name} drifted off 🌙`);
      dirty = true;
    });
  });

  server.listen(port, () => {
    console.log(`✨ cozy hall ready on http://localhost:${port}`);
  });
});

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
const next = require("next");
const { Server } = require("socket.io");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Single-hall state (multi-room = prefix keys if you grow beyond one hall)
const players = new Map(); // socketId -> PlayerState
const meta = new Map(); // socketId -> { name, color }
// resting spot clear of every furniture solid (mirrors BALL_SPAWN in lib/room-defaults)
const BALL_SPAWN = (() => {
  try {
    return require("./lib/room-defaults").BALL_SPAWN;
  } catch {
    return { x: 2.8, z: 0.2 };
  }
})();
let ball = { x: BALL_SPAWN.x, z: BALL_SPAWN.z, y: 0.28, vx: 0, vy: 0, vz: 0, holderId: null };
let tv = { playlist: [], index: 0, playing: false, positionSec: 0, updatedAt: Date.now() };
// watch-party drive cooldown (shared across all sockets — see hall:tv)
let lastTvDriveAt = 0;
let lastTvDriveBy = null;

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
    best
      ? { text: `${best.name} wins the scramble with ${best.points}!`, icon: "trophy" }
      : { text: "scramble over — no stars caught!", icon: "moon" }
  );
}

function snapshot() {
  return { players: Object.fromEntries(players), ball, tv, game, rps, sos };
}

// ─── Emergency signal: one red button, global 10s cooldown, ~3.5s alarm ────
let sos = null;
let lastSosAt = 0;
const SOS_COOLDOWN_MS = 10_000;
const SOS_ALARM_MS = 3_500;

// ─── chat bubble relay (history persists in Firestore, client-side) ─────────
const lastChatAt = new Map(); // socketId -> ts

// ─── Rock-Paper-Scissors arena — server referees best-of-5 (first to 3) ────
const RPS_WIN = 3;
const RPS_ROUND_MS = 20_000;
const RPS_REVEAL_MS = 3_500;
const rpsChoices = ["rock", "paper", "scissors"];
let rps = {
  status: "idle",
  seats: { a: null, b: null },
  names: { a: "", b: "" },
  scores: { a: 0, b: 0 },
  round: 1,
  picks: { a: null, b: null },
  deadline: 0,
  revealUntil: 0,
  lastReveal: null,
  winner: null,
  endedAt: 0,
};

function rpsReset() {
  rps = {
    status: "idle",
    seats: { a: null, b: null },
    names: { a: "", b: "" },
    scores: { a: 0, b: 0 },
    round: 1,
    picks: { a: null, b: null },
    deadline: 0,
    revealUntil: 0,
    lastReveal: null,
    winner: null,
    endedAt: 0,
  };
}

function rpsBeats(a, b) {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "scissors" && b === "paper") ||
    (a === "paper" && b === "rock")
  );
}

function rpsResolve(io, timeout) {
  // timeouts auto-pick at random so a stalled match can never wedge the table
  if (!rps.picks.a) {
    rps.picks.a = rpsChoices[Math.floor(Math.random() * 3)];
    timeout = true;
  }
  if (!rps.picks.b) {
    rps.picks.b = rpsChoices[Math.floor(Math.random() * 3)];
    timeout = true;
  }
  const { a, b } = rps.picks;
  const result = a === b ? "draw" : rpsBeats(a, b) ? "a" : "b";
  if (result === "a") rps.scores.a++;
  else if (result === "b") rps.scores.b++;
  rps.lastReveal = { round: rps.round, a, b, result, at: Date.now(), timeout: !!timeout };
  if (rps.scores.a >= RPS_WIN || rps.scores.b >= RPS_WIN) {
    rps.status = "ended";
    rps.winner = rps.scores.a > rps.scores.b ? rps.names.a : rps.names.b;
    rps.endedAt = Date.now();
    io.to("hall").emit(
      "hall:toast",
      { text: `${rps.winner} takes the table ${rps.scores.a}–${rps.scores.b}!`, icon: "trophy" }
    );
  } else {
    rps.status = "revealing";
    rps.revealUntil = Date.now() + RPS_REVEAL_MS;
  }
  dirty = true;
}

// Single-hall relay flag (module scope so game helpers can raise it)
let dirty = false;

function broadcast(io) {
  io.to("hall").emit("hall:state", snapshot());
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // WHATWG URL (legacy url.parse() is deprecated) shaped for Next's handler.
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    handle(req, res, { pathname: url.pathname, query: Object.fromEntries(url.searchParams) });
  });

  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: "*" },
  });

  // gentle 12Hz relay so 5–10 friends stay smooth without spam
  setInterval(() => {
    if (dirty) {
      dirty = false;
      broadcast(io);
    }
  }, 84);

  // game clock: end rounds + retire result screens (+ RPS referee ticks)
  setInterval(() => {
    if (game.status === "playing" && Date.now() > game.endsAt) {
      endGame(io);
      dirty = true;
    } else if (game.status === "ended" && Date.now() - game.endedAt > 9000) {
      game = { status: "idle", endsAt: 0, endedAt: 0, stars: [], scores: {}, lastCollect: null, winner: null };
      dirty = true;
    }
    // RPS: pick timeouts auto-fill at random, reveals advance, tables reset
    if (rps.status === "picking" && Date.now() > rps.deadline) {
      rpsResolve(io, true);
      dirty = true;
    } else if (rps.status === "revealing" && Date.now() > rps.revealUntil) {
      rps.round++;
      rps.picks = { a: null, b: null };
      rps.deadline = Date.now() + RPS_ROUND_MS;
      rps.status = "picking";
      dirty = true;
    } else if (rps.status === "ended" && Date.now() - rps.endedAt > 8000) {
      rpsReset();
      dirty = true;
    }
    // SOS expiry
    if (sos && Date.now() - sos.at > SOS_ALARM_MS) {
      sos = null;
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
        seat: null,
        seatMode: null,
        jumping: false,
      });
      socket.to("hall").emit("hall:toast", { text: `${clean} stepped in`, icon: "sparkle" });
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
        hitAt: players.get(socket.id)?.hitAt,
        chat: players.get(socket.id)?.chat,
        chatAt: players.get(socket.id)?.chatAt,
        seat: typeof p.seat === "number" ? p.seat : null,
        seatMode: p.seatMode === "sofa" ? "sofa" : null,
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
        io.to("hall").emit("hall:toast", { text: `${cur.name} poked ${target.name}`, icon: "poke" });
        const victim = players.get(targetId);
        players.set(targetId, { ...victim, action: "poke", actionAt: Date.now(), actionTarget: socket.id });
      }
      if (kind === "highfive") {
        const target = targetId && players.has(targetId) ? players.get(targetId) : null;
        io.to("hall").emit(
          "hall:toast",
          { text: target ? `${cur.name} + ${target.name} high-fived!` : `${cur.name} threw a high-five!`, icon: "highFive" }
        );
        if (target) {
          players.set(target.id, { ...target, action: "highfive", actionAt: Date.now(), actionTarget: socket.id });
        }
      }
      dirty = true;
    };
    socket.on("hall:poke", action("poke"));
    socket.on("hall:highfive", action("highfive"));

    socket.on("hall:sit", ({ sitting, seatMode }) => {
      const cur = players.get(socket.id);
      if (!cur) return;
      players.set(socket.id, { ...cur, sitting: !!sitting, seatMode: seatMode === "sofa" ? "sofa" : null });
      dirty = true;
    });

    // dodgeball bonk — victim self-reports, server rate-limits + announces
    socket.on("hall:hit", () => {
      const cur = players.get(socket.id);
      if (!cur) return;
      if (cur.hitAt && Date.now() - cur.hitAt < 2000) return;
      players.set(socket.id, { ...cur, hitAt: Date.now() });
      const thrower = ball.throwerId ? players.get(ball.throwerId) : null;
      const freshThrow = ball.thrownAt && Date.now() - ball.thrownAt < 6000;
      io.to("hall").emit(
        "hall:toast",
        { text: thrower && freshThrow ? `${thrower.name} bonked ${cur.name}!` : `${cur.name} got bonked!`, icon: "bonk" }
      );
      dirty = true;
    });

    // chat bubble — instant overhead text for everyone (history is Firestore's job)
    socket.on("hall:chat", ({ text } = {}) => {
      const cur = players.get(socket.id);
      if (!cur) return;
      const now = Date.now();
      if (now - (lastChatAt.get(socket.id) ?? 0) < 1500) return;
      const clean = String(text ?? "").trim().slice(0, 140);
      if (!clean) return;
      lastChatAt.set(socket.id, now);
      players.set(socket.id, { ...cur, chat: clean, chatAt: now });
      dirty = true;
    });

    // emergency signal — global cooldown, everyone gets the alarm
    socket.on("sos:raise", () => {
      const now = Date.now();
      if (now - lastSosAt < SOS_COOLDOWN_MS) return;
      const m = meta.get(socket.id);
      lastSosAt = now;
      sos = { by: socket.id, name: m?.name ?? "Someone", at: now };
      io.to("hall").emit("hall:toast", { text: `${sos.name} raised an EMERGENCY signal!`, icon: "sos" });
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
        throwerId: b.throwerId === null || b.throwerId === undefined ? null : String(b.throwerId),
        thrownAt: Number(b.thrownAt) || 0,
      };
      // translate local "me" ids to real socket ids
      if (ball.holderId === "me") ball.holderId = socket.id;
      if (ball.throwerId === "me") ball.throwerId = socket.id;
      dirty = true;
    });

    socket.on("hall:ball:toss", () => {
      ball = { ...ball, holderId: null };
      dirty = true;
    });

    // ─── watch-party TV: timestamped state, anyone can drive ─────────────
    // Protocol: {playing, positionSec} on play/pause · {index, playing:true,
    // positionSec:0} on video change · {seekTo} on seek (converted here) ·
    // {positionSec} heartbeats re-anchor long sessions. Competing drives from
    // different friends within 800ms lose to the first — no seek fights.
    socket.on("hall:tv", (patch) => {
      const p = { ...(patch || {}) };
      const competing = p.playing !== undefined || p.index !== undefined || p.seekTo !== undefined;
      const now = Date.now();
      if (competing && socket.id !== lastTvDriveBy && now - lastTvDriveAt < 800) return;
      if (competing) {
        lastTvDriveAt = now;
        lastTvDriveBy = socket.id;
      }
      if (p.seekTo !== undefined) {
        p.positionSec = Number(p.seekTo) || 0;
        delete p.seekTo;
      }
      tv = { ...tv, ...p, updatedAt: now };
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
      io.to("hall").emit("hall:toast", { text: `${m?.name ?? "Someone"} started a star scramble — grab them!`, icon: "starGame" });
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

    // ─── RPS arena ──────────────────────────────────────────────────────────
    socket.on("rps:challenge", () => {
      const m = meta.get(socket.id);
      const name = m?.name ?? "Friend";
      if (rps.status === "idle") {
        rps.seats = { a: socket.id, b: null };
        rps.names = { a: name, b: "" };
        rps.status = "waiting";
        io.to("hall").emit("hall:toast", { text: `${name} wants a duel — stand by the table to accept!`, icon: "duel" });
        dirty = true;
      } else if (
        rps.status === "waiting" &&
        rps.seats.a !== socket.id &&
        !rps.seats.b
      ) {
        rps.seats.b = socket.id;
        rps.names.b = name;
        rps.scores = { a: 0, b: 0 };
        rps.round = 1;
        rps.picks = { a: null, b: null };
        rps.lastReveal = null;
        rps.winner = null;
        rps.deadline = Date.now() + RPS_ROUND_MS;
        rps.status = "picking";
        io.to("hall").emit("hall:toast", { text: `${rps.names.a} vs ${name} — best of 5, throw your signs!`, icon: "duel" });
        dirty = true;
      }
    });

    socket.on("rps:pick", ({ choice } = {}) => {
      if (rps.status !== "picking") return;
      if (choice !== "rock" && choice !== "paper" && choice !== "scissors") return;
      const side = rps.seats.a === socket.id ? "a" : rps.seats.b === socket.id ? "b" : null;
      if (!side) return;
      rps.picks[side] = choice;
      dirty = true;
      if (rps.picks.a && rps.picks.b) rpsResolve(io, false);
    });

    socket.on("rps:leave", () => {
      if (rps.status === "waiting" && rps.seats.a === socket.id) {
        rpsReset();
        dirty = true;
      } else if (
        (rps.status === "picking" || rps.status === "revealing") &&
        (rps.seats.a === socket.id || rps.seats.b === socket.id)
      ) {
        // forfeit: the friend still standing takes the table
        const other = rps.seats.a === socket.id ? "b" : "a";
        const played = rps.scores.a + rps.scores.b > 0;
        const winnerName = other === "a" ? rps.names.a : rps.names.b;
        const leaver = meta.get(socket.id)?.name ?? "Someone";
        if (played && winnerName) {
          rps.status = "ended";
          rps.winner = winnerName;
          rps.endedAt = Date.now();
          io.to("hall").emit("hall:toast", { text: `${winnerName} takes it — ${leaver} walked away!`, icon: "trophy" });
        } else {
          rpsReset();
          io.to("hall").emit("hall:toast", { text: "the duel fizzled — table's open!", icon: "duel" });
        }
        dirty = true;
      }
    });

    socket.on("hall:room", (room) => {
      socket.to("hall").emit("hall:room", room);
    });

    socket.on("disconnect", () => {
      const m = meta.get(socket.id);
      const leaving = players.get(socket.id);
      players.delete(socket.id);
      meta.delete(socket.id);
      if (ball.holderId === socket.id) {
        // drop it from their hands where they stood — not back at the spot
        // it was picked up from (clients push it clear of any furniture)
        const f = leaving ? Number(leaving.facing) || 0 : 0;
        ball = {
          ...ball,
          holderId: null,
          throwerId: null,
          thrownAt: 0,
          x: leaving ? leaving.x + Math.sin(f) * 0.55 : ball.x,
          z: leaving ? leaving.z + Math.cos(f) * 0.55 : ball.z,
          y: leaving ? 0.85 : ball.y,
          vx: 0,
          vy: 0,
          vz: 0,
        };
      }
      // RPS: a vanishing duelist forfeits (or voids an unstarted table)
      if (rps.seats.a === socket.id || rps.seats.b === socket.id) {
        if (rps.status === "waiting") {
          rpsReset();
        } else if (rps.status === "picking" || rps.status === "revealing") {
          const other = rps.seats.a === socket.id ? "b" : "a";
          const played = rps.scores.a + rps.scores.b > 0;
          const winnerName = other === "a" ? rps.names.a : rps.names.b;
          if (played && winnerName) {
            rps.status = "ended";
            rps.winner = winnerName;
            rps.endedAt = Date.now();
            io.to("hall").emit("hall:toast", { text: `${winnerName} takes it — rival disconnected!`, icon: "trophy" });
          } else {
            rpsReset();
          }
        }
      }
      if (m) socket.to("hall").emit("hall:toast", { text: `${m.name} drifted off`, icon: "moon" });
      dirty = true;
    });
  });

  server.listen(port, () => {
    console.log(`✨ cozy hall ready on http://localhost:${port}`);
  });
});

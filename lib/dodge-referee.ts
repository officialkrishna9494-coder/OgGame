// ─── Cozy Hall · dodgeball referee (pure, server-side authority) ────────────
// No sockets, no timers: server.js feeds it events + the clock and relays
// whatever it returns, which keeps every rule unit-testable.
//
// Round flow: idle → countdown (friends step onto the court) → playing
// (roster = everyone on the court when the countdown ends, one ball each)
// → ended (ranked standings) → idle.
//
// Scoring: +1 for every hit you land, −1 for every time you're hit.
// A hit counts only if: the round is live, both players are on the roster,
// it isn't your own ball, the throw is still in flight (the thrower's client
// marks it spent the moment it touches floor/furniture; the server also caps
// it at DODGE_LIVE_MS), each throw scores at most once, and the victim isn't
// still shielded from their previous hit.

import { BALL_BOUNDS } from "./room-defaults";
import { COURT, ZONES, inCourt } from "./hall-layout";
import {
  DODGE_COUNTDOWN_MS,
  DODGE_LIVE_MS,
  DODGE_MIN_PLAYERS,
  DODGE_RESULTS_MS,
  DODGE_ROUND_MS,
  DODGE_SHIELD_MS,
  IDLE_DODGE,
  rankDodge,
  type DodgeBall,
  type DodgeState,
} from "./hall-types";

export interface RefPlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
}

export interface RefResult {
  changed: boolean;
  toast?: { text: string; icon: string };
  /** victim id → mark their avatar as hit (red flash) */
  hitVictim?: string;
}

const NONE: RefResult = { changed: false };
const MAX_BALLS = 12;
const MAX_SPEED = 24;
const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function createDodge(): DodgeState {
  return { ...IDLE_DODGE, roster: {}, balls: [], feed: [], ranking: [] };
}

/** internal: last time each player was hit (shield window) */
const shieldUntil = new WeakMap<DodgeState, Map<string, number>>();
const shields = (s: DodgeState) => {
  let m = shieldUntil.get(s);
  if (!m) {
    m = new Map();
    shieldUntil.set(s, m);
  }
  return m;
};
let feedSeq = 1;

export function requestStart(s: DodgeState, by: RefPlayer, now: number): RefResult {
  if (s.status !== "idle") return NONE;
  // latency-lenient: they pressed E on the pad on their screen
  if (Math.hypot(by.x - ZONES.dodgePad.x, by.z - ZONES.dodgePad.z) > 4) return NONE;
  s.status = "countdown";
  s.startedBy = by.name;
  s.startsAt = now + DODGE_COUNTDOWN_MS;
  s.endsAt = 0;
  s.endedAt = 0;
  s.roster = {};
  s.balls = [];
  s.feed = [];
  s.ranking = [];
  return {
    changed: true,
    toast: { text: `${by.name} is starting dodgeball — step onto the court!`, icon: "dodge" },
  };
}

function spawnBalls(count: number, now: number): DodgeBall[] {
  const n = clamp(count, 0, MAX_BALLS);
  const zMid = (COURT.zMin + COURT.zMax) / 2;
  const x0 = COURT.xMin + 1.6;
  const x1 = COURT.xMax - 1.6;
  return Array.from({ length: n }, (_, i) => ({
    id: `db-${now}-${i}`,
    x: n === 1 ? 0 : x0 + ((x1 - x0) * i) / (n - 1),
    y: 0.28,
    z: zMid,
    vx: 0,
    vy: 0,
    vz: 0,
    holderId: null,
    throwerId: null,
    thrownAt: 0,
    spent: true,
    rev: 1,
  }));
}

function activeCount(s: DodgeState): number {
  return Object.values(s.roster).filter((r) => !r.left).length;
}

function finish(s: DodgeState, now: number, why: "time" | "players"): RefResult {
  s.status = "ended";
  s.endedAt = now;
  s.balls = [];
  s.ranking = rankDodge(s.roster);
  const [first, second] = s.ranking;
  let text: string;
  if (!first) text = "dodgeball over — nobody played";
  else if (second && second.rank === first.rank)
    text = `dodgeball draw! ${s.ranking.filter((r) => r.rank === 1).map((r) => r.name).join(" & ")} tie at ${fmtScore(first.score)}`;
  else text = `${first.name} wins dodgeball with ${fmtScore(first.score)} (${first.hits} hits, hit ${first.taken}×)`;
  if (why === "players") text += " — not enough players left";
  return { changed: true, toast: { text, icon: "trophy" } };
}

export const fmtScore = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Advance the clock. `players` = everyone currently in the hall. */
export function tick(s: DodgeState, players: Iterable<RefPlayer>, now: number): RefResult {
  if (s.status === "countdown" && now >= s.startsAt) {
    const onCourt = [...players].filter((p) => inCourt(p.x, p.z, 0.2));
    if (onCourt.length < DODGE_MIN_PLAYERS) {
      Object.assign(s, createDodge());
      return {
        changed: true,
        toast: { text: `dodgeball needs at least ${DODGE_MIN_PLAYERS} players on the court`, icon: "info" },
      };
    }
    s.roster = {};
    for (const p of onCourt.slice(0, MAX_BALLS)) s.roster[p.id] = { id: p.id, name: p.name, color: p.color, hits: 0, taken: 0 };
    s.balls = spawnBalls(Object.keys(s.roster).length, now);
    s.status = "playing";
    s.endsAt = now + DODGE_ROUND_MS;
    shields(s).clear();
    return {
      changed: true,
      toast: { text: `dodgeball! ${Object.keys(s.roster).length} players, one ball each — go!`, icon: "dodge" },
    };
  }
  if (s.status === "playing") {
    if (now >= s.endsAt) return finish(s, now, "time");
    if (activeCount(s) < DODGE_MIN_PLAYERS) return finish(s, now, "players");
  }
  if (s.status === "ended" && now - s.endedAt >= DODGE_RESULTS_MS) {
    Object.assign(s, createDodge());
    return { changed: true };
  }
  return NONE;
}

const findBall = (s: DodgeState, ballId: unknown) => s.balls.find((b) => b.id === ballId);
const inRound = (s: DodgeState, id: string) => s.status === "playing" && !!s.roster[id] && !s.roster[id].left;

export function pickup(s: DodgeState, id: string, ballId: unknown, now: number): RefResult {
  if (!inRound(s, id)) return NONE;
  const ball = findBall(s, ballId);
  if (!ball || ball.holderId) return NONE;
  if (s.balls.some((b) => b.holderId === id)) return NONE; // one ball at a time
  // nobody snatches a throw out of the air the instant it leaves a hand
  if (ball.throwerId && ball.throwerId !== id && now - ball.thrownAt < 350) return NONE;
  ball.holderId = id;
  ball.spent = true;
  ball.vx = ball.vy = ball.vz = 0;
  ball.rev++;
  return { changed: true };
}

export function throwBall(s: DodgeState, id: string, ballId: unknown, b: Record<string, unknown>, now: number): RefResult {
  if (!inRound(s, id)) return NONE;
  const ball = findBall(s, ballId);
  if (!ball || ball.holderId !== id) return NONE;
  let vx = num(b.vx);
  let vy = num(b.vy);
  let vz = num(b.vz);
  const sp = Math.hypot(vx, vy, vz);
  if (sp > MAX_SPEED) {
    vx *= MAX_SPEED / sp;
    vy *= MAX_SPEED / sp;
    vz *= MAX_SPEED / sp;
  }
  ball.x = clamp(num(b.x, ball.x), BALL_BOUNDS.xMin, BALL_BOUNDS.xMax);
  ball.y = clamp(num(b.y, 1), 0.28, 3);
  ball.z = clamp(num(b.z, ball.z), BALL_BOUNDS.zMin, BALL_BOUNDS.zMax);
  ball.vx = vx;
  ball.vy = vy;
  ball.vz = vz;
  ball.holderId = null;
  ball.throwerId = id;
  ball.thrownAt = now;
  ball.spent = false;
  ball.rev++;
  return { changed: true };
}

/** The thrower's client saw the throw die (floor / furniture) — no more hits. */
export function spend(s: DodgeState, id: string, ballId: unknown, rev: unknown): RefResult {
  const ball = findBall(s, ballId);
  if (!ball || ball.spent || ball.throwerId !== id || ball.rev !== rev) return NONE;
  ball.spent = true;
  return { changed: true };
}

export function hit(
  s: DodgeState,
  victimId: string,
  ballId: unknown,
  b: Record<string, unknown>,
  now: number
): RefResult {
  if (!inRound(s, victimId) || now > s.endsAt) return NONE;
  const ball = findBall(s, ballId);
  if (!ball || ball.holderId || ball.spent || !ball.throwerId) return NONE;
  const thrower = s.roster[ball.throwerId];
  if (!thrower || ball.throwerId === victimId) return NONE;
  if (now - ball.thrownAt > DODGE_LIVE_MS) return NONE;
  const shield = shields(s);
  if ((shield.get(victimId) ?? 0) > now) return NONE;

  const victim = s.roster[victimId];
  thrower.hits++;
  victim.taken++;
  shield.set(victimId, now + DODGE_SHIELD_MS);
  s.feed = [
    ...s.feed.slice(-7),
    { id: feedSeq++, by: thrower.id, byName: thrower.name, victim: victim.id, victimName: victim.name, at: now },
  ];
  // the ball bounces off the victim for everyone, then it's a dead ball
  const vx = num(b.vx, ball.vx);
  const vz = num(b.vz, ball.vz);
  ball.x = clamp(num(b.x, ball.x), BALL_BOUNDS.xMin, BALL_BOUNDS.xMax);
  ball.y = clamp(num(b.y, 1), 0.28, 3);
  ball.z = clamp(num(b.z, ball.z), BALL_BOUNDS.zMin, BALL_BOUNDS.zMax);
  ball.vx = -vx * 0.25;
  ball.vy = 2.4;
  ball.vz = -vz * 0.25;
  ball.thrownAt = now;
  ball.spent = true;
  ball.rev++;
  return { changed: true, hitVictim: victimId };
}

/** A player left the hall (or the round) — keep their line, free their ball. */
export function leave(s: DodgeState, id: string, pos: { x: number; z: number } | null, now: number): RefResult {
  let changed = false;
  for (const ball of s.balls) {
    if (ball.holderId !== id) continue;
    ball.holderId = null;
    ball.spent = true;
    if (pos) {
      ball.x = clamp(pos.x, BALL_BOUNDS.xMin, BALL_BOUNDS.xMax);
      ball.z = clamp(pos.z, BALL_BOUNDS.zMin, BALL_BOUNDS.zMax);
      ball.y = 0.85;
    }
    ball.vx = ball.vy = ball.vz = 0;
    ball.rev++;
    changed = true;
  }
  const row = s.roster[id];
  if (row && !row.left && (s.status === "playing" || s.status === "countdown")) {
    row.left = true;
    changed = true;
    if (s.status === "playing" && activeCount(s) < DODGE_MIN_PLAYERS) return finish(s, now, "players");
  }
  return changed ? { changed } : NONE;
}

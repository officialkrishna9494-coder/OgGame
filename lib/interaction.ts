// ─── Cozy Hall · the one contextual action (ACT button · E key · prompt) ────
// Single source of truth shared by the HUD (what the button says and does)
// and the 3D scene (where the in-world prompt floats), so the two can never
// disagree. While driving: throw first when holding a ball (lobby or
// dodgeball), otherwise hop out — a second press then exits. On foot:
// SOS → throw (lobby ball or dodgeball) → hop in (free cart) → add video
// (TV) → duel (RPS table) → star game (rug, idle) → dodgeball (court pad,
// idle) → sofa sit / stand.

import type { IconName } from "../components/icons";
import { COURT, LOUNGE, RPS_SPOT, SOS_SPOT, TV } from "./hall-layout";
import type { ContextState } from "./hall-types";

export type ActionKey = "sos" | "toss" | "drive" | "park" | "addLink" | "duel" | "starGame" | "dodge" | "sit" | "stand";

export interface ActionFlags {
  sitting: boolean;
  /** I am driving a cart — E / ACT throws a held ball first, else "hop out" */
  driving: boolean;
  gameStatus?: string;
  rpsStatus?: string;
  /** my seat at the RPS table, if I'm a duelist */
  rpsSeat?: "a" | "b" | null;
  dodgeStatus?: string;
}

export interface InteractAction {
  key: ActionKey;
  icon: IconName;
  /** short verb for buttons ("sit") */
  label: string;
  /** full sentence for the in-world prompt ("Sit on the sofa") */
  prompt: string;
  /** accent for glows and hold progress */
  glow: string;
  /** press-and-hold to confirm — for actions that alarm everyone */
  hold: boolean;
}

/** How long a hold action must be held (key or pointer). */
export const HOLD_MS = 650;

/** Allocation-free — the render loop calls this every frame. */
export function actionKey(ctx: ContextState | undefined, f: ActionFlags): ActionKey | null {
  if (!ctx) return null;
  // driving with a ball: ACT/E throws it first (a second press then hops
  // out, since holding clears) — otherwise hop straight out
  if (f.driving) {
    if (ctx.holdingBall || ctx.holdingDodge) return "toss";
    return "park";
  }
  if (ctx.nearEmergency) return "sos";
  if (ctx.holdingBall || ctx.holdingDodge) return "toss";
  if (ctx.nearCart) return "drive";
  if (ctx.nearTv) return "addLink";
  if (ctx.nearRps) return "duel";
  if (ctx.nearGame && f.gameStatus === "idle") return "starGame";
  if (ctx.nearDodgePad && (f.dodgeStatus ?? "idle") === "idle") return "dodge";
  if (ctx.nearSofa) return f.sitting ? "stand" : "sit";
  return null;
}

function duelPrompt(f: ActionFlags): { label: string; prompt: string } {
  const s = f.rpsStatus ?? "idle";
  if (s === "idle") return { label: "duel", prompt: "Challenge a duel" };
  if (s === "waiting") return f.rpsSeat === "a" ? { label: "duel", prompt: "Waiting for a rival" } : { label: "accept", prompt: "Accept the duel" };
  if (s === "ended") return { label: "results", prompt: "See the results" };
  return f.rpsSeat ? { label: "throw", prompt: "Throw your sign" } : { label: "watch", prompt: "Watch the duel" };
}

export function resolveAction(ctx: ContextState | undefined, f: ActionFlags): InteractAction | null {
  const key = actionKey(ctx, f);
  switch (key) {
    case "sos":
      return { key, icon: "sos", label: "sos", prompt: "Hold to raise SOS", glow: "#ff3b3b", hold: true };
    case "toss":
      return ctx?.holdingDodge
        ? { key, icon: "dodge", label: "throw", prompt: "Throw the dodgeball", glow: "#4cc9f0", hold: false }
        : { key, icon: "toss", label: "throw", prompt: "Throw the ball", glow: "#ff6b6b", hold: false };
    case "drive":
      return { key, icon: "drive", label: "hop in", prompt: "Hop in the cart", glow: "#4cc9f0", hold: false };
    case "park":
      return { key, icon: "drive", label: "hop out", prompt: "Hop out", glow: "#4cc9f0", hold: false };
    case "addLink":
      return { key, icon: "addLink", label: "add video", prompt: "Add a video to the TV", glow: "#ff8fab", hold: false };
    case "duel":
      return { key, icon: "duel", ...duelPrompt(f), glow: "#40916c", hold: false };
    case "starGame":
      return { key, icon: "starGame", label: "play", prompt: "Start star scramble", glow: "#ffb703", hold: false };
    case "dodge":
      return { key, icon: "dodge", label: "dodgeball", prompt: "Start dodgeball", glow: "#4cc9f0", hold: false };
    case "sit":
      return { key, icon: "sofa", label: "sit", prompt: "Sit on the sofa", glow: "#a0c4ff", hold: false };
    case "stand":
      return { key, icon: "sofa", label: "stand", prompt: "Stand up", glow: "#a0c4ff", hold: false };
    default:
      return null;
  }
}

/** World point (x, y, z) the in-world prompt points at, per action. */
export function actionAnchor(key: ActionKey, me: { x: number; y: number; z: number }, out: { x: number; y: number; z: number }, at?: { x: number; z: number }) {
  const sofaZ = LOUNGE.sofa.z;
  switch (key) {
    case "sos": // above the "SOS" tag on the pedestal
      out.x = SOS_SPOT.x; out.y = 2.45; out.z = SOS_SPOT.z;
      break;
    case "toss": // over your own head
      out.x = me.x; out.y = me.y + 2.7; out.z = me.z;
      break;
    case "addLink": // on the TV stand, below the screen (never over the picture)
      out.x = TV.x; out.y = 0.62; out.z = TV.standZ + 0.95;
      break;
    case "duel": // over the felt table, above the floating hands
      out.x = RPS_SPOT.table.x; out.y = 2.75; out.z = RPS_SPOT.table.z;
      break;
    case "starGame": // the rug's coffee table
      out.x = LOUNGE.table.x; out.y = 0.9; out.z = LOUNGE.table.z + 0.8;
      break;
    case "dodge": // the glowing start pad by the court
      out.x = COURT.pad.x; out.y = 0.9; out.z = COURT.pad.z;
      break;
    case "sit":
      if (me.z >= sofaZ) {
        // camera side: the top of the backrest, in line with you
        out.x = Math.max(LOUNGE.sofa.x - 2.4, Math.min(LOUNGE.sofa.x + 2.4, me.x)); out.y = 1.8; out.z = sofaZ + 0.6;
      } else {
        // TV side: your head is higher on screen than the backrest — go above it
        out.x = me.x; out.y = me.y + 2.7; out.z = me.z;
      }
      break;
    case "stand": // seated: just above your name tag
      out.x = me.x; out.y = me.y + 3.25; out.z = me.z;
      break;
    case "drive": // over the free cart (falls back to you if it moved on)
      out.x = at?.x ?? me.x; out.y = 1.9; out.z = at?.z ?? me.z;
      break;
    case "park": // just above your name tag while driving
      out.x = me.x; out.y = me.y + 3.25; out.z = me.z;
      break;
  }
}

// ─── scene → HUD handoff ────────────────────────────────────────────────────
// Mutable singleton (like joy-state): the render loop projects the anchor to
// screen pixels every frame; the prompt reads it in its own rAF. No renders.
export const promptAnchor = {
  key: null as ActionKey | null,
  x: 0,
  y: 0,
  visible: false,
};

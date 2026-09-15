// ─── Cozy Hall · the one contextual action (ACT button · E key · prompt) ────
// Single source of truth shared by the HUD (what the button says and does)
// and the 3D scene (where the in-world prompt floats), so the two can never
// disagree. Priority: SOS → throw ball → add video (TV) → duel (RPS table)
// → star game (rug, idle) → sofa sit / stand.

import type { IconName } from "../components/icons";
import type { ContextState } from "./hall-types";

export type ActionKey = "sos" | "toss" | "addLink" | "duel" | "starGame" | "sit" | "stand";

export interface ActionFlags {
  sitting: boolean;
  gameStatus?: string;
  rpsStatus?: string;
  /** my seat at the RPS table, if I'm a duelist */
  rpsSeat?: "a" | "b" | null;
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
  if (ctx.nearEmergency) return "sos";
  if (ctx.holdingBall) return "toss";
  if (ctx.nearTv) return "addLink";
  if (ctx.nearRps) return "duel";
  if (ctx.nearGame && f.gameStatus === "idle") return "starGame";
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
      return { key, icon: "toss", label: "throw", prompt: "Throw the ball", glow: "#ff6b6b", hold: false };
    case "addLink":
      return { key, icon: "addLink", label: "add video", prompt: "Add a video to the TV", glow: "#ff8fab", hold: false };
    case "duel":
      return { key, icon: "duel", ...duelPrompt(f), glow: "#40916c", hold: false };
    case "starGame":
      return { key, icon: "starGame", label: "play", prompt: "Start star scramble", glow: "#ffb703", hold: false };
    case "sit":
      return { key, icon: "sofa", label: "sit", prompt: "Sit on the sofa", glow: "#a0c4ff", hold: false };
    case "stand":
      return { key, icon: "sofa", label: "stand", prompt: "Stand up", glow: "#a0c4ff", hold: false };
    default:
      return null;
  }
}

/** World point (x, y, z) the in-world prompt points at, per action. */
export function actionAnchor(key: ActionKey, me: { x: number; y: number; z: number }, out: { x: number; y: number; z: number }) {
  switch (key) {
    case "sos": // above the "SOS" tag on the pedestal
      out.x = 5.0; out.y = 2.45; out.z = -10.0;
      break;
    case "toss": // over your own head
      out.x = me.x; out.y = me.y + 2.7; out.z = me.z;
      break;
    case "addLink": // on the TV stand, below the screen (never over the picture)
      out.x = 0; out.y = 0.62; out.z = -10.3;
      break;
    case "duel": // over the felt table, above the floating hands
      out.x = -10; out.y = 2.75; out.z = -6.5;
      break;
    case "starGame": // the rug's coffee table
      out.x = 0; out.y = 0.9; out.z = 3.0;
      break;
    case "sit":
      if (me.z >= 7) {
        // camera side: the top of the backrest, in line with you
        out.x = Math.max(-2.4, Math.min(2.4, me.x)); out.y = 1.8; out.z = 7.6;
      } else {
        // TV side: your head is higher on screen than the backrest — go above it
        out.x = me.x; out.y = me.y + 2.7; out.z = me.z;
      }
      break;
    case "stand": // seated: just above your name tag
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

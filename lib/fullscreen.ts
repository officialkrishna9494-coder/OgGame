"use client";

// ─── Cozy Hall · fullscreen, done properly on every phone ──────────────────
// • Android / iPad / desktop: real Fullscreen API (standard or webkit), then
//   lock the screen sideways where the browser allows it (Android Chrome).
// • iPhone Safari can't fullscreen a page at all — there the honest answer
//   is "Add to Home Screen", which launches the manifest's app mode.
// • Already installed (display-mode fullscreen/standalone): nothing to offer.
// State is read through useSyncExternalStore, so every button stays in sync
// with system exits (back gesture, Esc) without effects or stale state.

import { useSyncExternalStore } from "react";

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
// `lock` was dropped from lib.dom, and old Safari has no screen.orientation
type Orientation = { lock?: (o: "landscape") => Promise<void>; unlock?: () => void } | undefined;

export type FullscreenOffer = "fullscreen" | "homescreen" | null;

const fsDoc = () => document as FsDocument;
const orientation = () => (screen as { orientation?: unknown }).orientation as Orientation;

function fullscreenElement(): Element | null {
  const d = fsDoc();
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function canFullscreen(): boolean {
  const d = fsDoc();
  const el = d.documentElement as FsElement;
  const enabled = d.fullscreenEnabled || d.webkitFullscreenEnabled === true;
  return enabled && (typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function");
}

function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac — the touch points give it away
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Must be called straight from a tap/click handler (user activation). */
export async function enterFullscreen(): Promise<boolean> {
  if (fullscreenElement()) return true;
  const el = document.documentElement as FsElement;
  try {
    if (typeof el.requestFullscreen === "function") await el.requestFullscreen({ navigationUI: "hide" });
    else if (typeof el.webkitRequestFullscreen === "function") await el.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  // Android Chrome only allows the lock once fullscreen; elsewhere it rejects
  // (the rotate prompt still covers those). Not awaited: it resolves only
  // after the device has actually turned.
  try {
    orientation()?.lock?.("landscape").catch(() => {});
  } catch {
    /* unsupported */
  }
  return !!fullscreenElement();
}

export async function exitFullscreen(): Promise<void> {
  try {
    orientation()?.unlock?.();
  } catch {
    /* nothing locked */
  }
  if (!fullscreenElement()) return;
  const d = fsDoc();
  try {
    if (typeof d.exitFullscreen === "function") await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    /* already exiting */
  }
}

// ─── live state ─────────────────────────────────────────────────────────────
const ACTIVE = 1;
const SUPPORTED = 2;
const INSTALLED = 4;
const IOS = 8;

function snapshot(): number {
  return (
    (fullscreenElement() ? ACTIVE : 0) |
    (canFullscreen() ? SUPPORTED : 0) |
    (isInstalled() ? INSTALLED : 0) |
    (isIos() ? IOS : 0)
  );
}

function subscribe(onChange: () => void): () => void {
  const modes = ["(display-mode: fullscreen)", "(display-mode: standalone)"].map((q) => window.matchMedia(q));
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  modes.forEach((m) => m.addEventListener("change", onChange));
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
    modes.forEach((m) => m.removeEventListener("change", onChange));
  };
}

export function useFullscreen() {
  const bits = useSyncExternalStore(subscribe, snapshot, () => 0);
  const active = (bits & ACTIVE) !== 0;
  const supported = (bits & SUPPORTED) !== 0;
  const installed = (bits & INSTALLED) !== 0;
  const ios = (bits & IOS) !== 0;
  // what we can offer a player who still sees browser bars
  const offer: FullscreenOffer =
    active || installed ? null : supported ? "fullscreen" : ios ? "homescreen" : null;
  return { active, offer, enter: enterFullscreen, exit: exitFullscreen };
}

// ─── the landscape nudge shows once per visit ───────────────────────────────
const NUDGE_KEY = "cozy-hall:fullscreen-nudge-seen";

export function nudgeSeen(): boolean {
  try {
    return window.sessionStorage.getItem(NUDGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markNudgeSeen(): void {
  try {
    window.sessionStorage.setItem(NUDGE_KEY, "1");
  } catch {
    /* private mode — the nudge simply may show again */
  }
}

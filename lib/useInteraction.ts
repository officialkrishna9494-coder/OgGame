"use client";

// ─── Cozy Hall · activate the contextual action (E key / button / prompt) ──
// • E (physical key, any layout) fires the current action; key-repeat and
//   modifier combos are ignored, and never while typing in an input.
// • Hold actions (SOS) must be held for HOLD_MS — key or pointer — and cancel
//   on release, on window blur, or when you walk out of range.
// • `pulse` bumps on every activation so buttons can play a press flash.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { HOLD_MS, type ActionKey, type InteractAction } from "./interaction";

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export interface Interaction {
  holding: boolean;
  pulse: number;
  /** spread onto any element that should trigger the action */
  bind: {
    onClick: () => void;
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
}

export function useInteraction(action: InteractAction | null, run: (key: ActionKey) => void): Interaction {
  const [holdKey, setHoldKey] = useState<ActionKey | null>(null);
  const [pulse, setPulse] = useState(0);
  const actionRef = useRef(action);
  const runRef = useRef(run);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    actionRef.current = action;
    runRef.current = run;
  });

  const fire = useCallback((key: ActionKey) => {
    runRef.current(key);
    setPulse((n) => n + 1);
  }, []);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHoldKey(null);
  }, []);

  const begin = useCallback(() => {
    const a = actionRef.current;
    if (!a) return;
    if (!a.hold) {
      fire(a.key);
      return;
    }
    if (timer.current !== null) return;
    setHoldKey(a.key);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHoldKey(null);
      // still in range of the same thing? then it counts
      if (actionRef.current?.key === a.key) fire(a.key);
    }, HOLD_MS);
  }, [fire]);

  useEffect(() => {
    const isE = (e: KeyboardEvent) => e.code === "KeyE" || e.key.toLowerCase() === "e";
    const onDown = (e: KeyboardEvent) => {
      if (!isE(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (!actionRef.current) return;
      e.preventDefault();
      begin();
    };
    const onUp = (e: KeyboardEvent) => {
      if (isE(e)) cancel();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", cancel);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [begin, cancel]);

  const holding = holdKey !== null && holdKey === action?.key;

  return {
    holding,
    pulse,
    bind: {
      // taps fire on click (keyboard Enter on a focused button works too);
      // hold actions start on press instead and ignore the click
      onClick: () => {
        if (actionRef.current && !actionRef.current.hold) begin();
      },
      onPointerDown: (e) => {
        if (!actionRef.current?.hold) return;
        e.preventDefault();
        begin();
      },
      onPointerUp: () => {
        if (actionRef.current?.hold) cancel();
      },
      onPointerLeave: () => {
        if (actionRef.current?.hold) cancel();
      },
      onPointerCancel: cancel,
    },
  };
}

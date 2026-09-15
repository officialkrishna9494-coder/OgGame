"use client";

// ─── Cozy Hall · mobile-landscape detection ────────────────────────────────
// True for phones held sideways (and only those — desktop is untouched).
// SSR-safe: lazy initializer reads matchMedia on the client only.

import { useEffect, useState } from "react";

const QUERY =
  "((orientation: landscape) and (max-width: 960px)), ((pointer: coarse) and (orientation: landscape) and (max-width: 1180px))";

export function useMobileLandscape(): boolean {
  const [mobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false
  );
  const [live, setLive] = useState<boolean>(mobile);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setLive(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return live;
}

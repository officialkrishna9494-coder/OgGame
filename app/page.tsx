"use client";

// ─── Cozy Hall · the one environment ────────────────────────────────────────
// Join → see each other move → react / poke / high-five / sit / toss / TV.
// No routes for features: everything happens in this single hall.
// Identity comes from AuthGate (dev quickplay, nickname, or Google).

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import AuthGate from "../components/AuthGate";
import Hud from "../components/Hud";
import TvPanel from "../components/TvPanel";
import { hallToss } from "../components/HallScene";
import { useRoom } from "../lib/room-store";
import { useHallSocket } from "../lib/useHallSocket";
import type { Identity } from "../lib/auth";
import type { BallState, PlayerState } from "../lib/hall-types";

const HallScene = dynamic(() => import("../components/HallScene"), { ssr: false });

function HallClient({ me }: { me: Identity }) {
  const { room } = useRoom();
  const [tvOpen, setTvOpen] = useState(false);
  const [nearId, setNearId] = useState<string | null>(null);
  const [nearName, setNearName] = useState<string | null>(null);

  const socket = useHallSocket(me);
  const { players, ball, tv, toasts, simulated } = socket.snapshot;

  const tvPlaylist = useMemo(
    () => (tv.playlist.length ? tv.playlist : room.tv),
    [tv.playlist, room.tv]
  );
  const tvTitle = tvPlaylist[tv.index % Math.max(1, tvPlaylist.length)]?.title ?? "";

  const handleMove = useCallback((p: PlayerState) => socket.sendMove(p), [socket]);
  const handleBall = useCallback((b: BallState) => socket.setBall(b), [socket]);
  const handleNear = useCallback((id: string | null, name: string | null) => {
    setNearId(id);
    setNearName(name);
  }, []);

  const sitting = players["me"]?.sitting ?? false;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#f6efe6] font-[var(--font-geist-sans),system-ui,sans-serif]">
      <HallScene
        myName={me.name}
        myColor={me.color}
        players={players}
        ball={ball}
        room={room}
        tv={{ ...tv, playlist: tvPlaylist }}
        onMove={handleMove}
        onBall={handleBall}
        onNear={handleNear}
      />

      {/* soft vignette for coziness */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_58%,rgba(120,90,110,0.14)_100%)]" />

      <Hud
        roomName={room.name}
        players={players}
        toasts={toasts}
        sitting={sitting}
        nearName={nearName}
        tvOpen={tvOpen}
        tvTitle={tvTitle}
        simulated={simulated}
        photoUrl={me.photoUrl}
        onSignOut={me.signOut}
        onEmote={socket.sendEmote}
        onPoke={() => socket.sendAction("poke", nearId)}
        onHighfive={() => socket.sendAction("highfive", nearId)}
        onSit={() => socket.sendAction("sit")}
        onToss={() => hallToss.fn?.()}
        onToggleTv={() => setTvOpen((v) => !v)}
      />

      {tvOpen && (
        <TvPanel
          tv={{ ...tv, playlist: tvPlaylist }}
          fallbackPlaylist={room.tv}
          onControl={socket.tvControl}
          onClose={() => setTvOpen(false)}
        />
      )}

      {/* tiny admin hint */}
      <a
        href="/admin"
        className="absolute bottom-2 right-3 z-20 text-[10px] font-semibold text-[#3d3347]/30 hover:text-[#3d3347]/70"
      >
        room setup →
      </a>
    </main>
  );
}

export default function Home() {
  const { room } = useRoom();
  return (
    <AuthGate roomName={room.name} tagline={room.tagline}>
      {(me) => <HallClient me={me} />}
    </AuthGate>
  );
}

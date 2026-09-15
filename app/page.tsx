"use client";

// ─── Cozy Hall · the one environment ────────────────────────────────────────
// Join → see each other move → react / poke / high-five / sit / toss / TV.
// No routes for features: everything happens in this single hall.
// Identity comes from AuthGate (dev quickplay, nickname, or Google).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import AuthGate from "../components/AuthGate";
import AddLinkPanel from "../components/AddLinkPanel";
import GamePanel from "../components/GamePanel";
import Hud from "../components/Hud";
import RotatePrompt from "../components/RotatePrompt";
import TvPanel from "../components/TvPanel";
import VoicePanel from "../components/VoicePanel";
import { hallToss } from "../components/HallScene";
import { useRoom } from "../lib/room-store";
import { useHallSocket } from "../lib/useHallSocket";
import { useMobileLandscape } from "../lib/useMobileLandscape";
import { useVoice } from "../lib/useVoice";
import { dbConfigured } from "../lib/db";
import { popSfx, startSfx, winSfx } from "../lib/sfx";
import type { Identity } from "../lib/auth";
import { IDLE_CONTEXT, type BallState, type ContextState, type PlayerState } from "../lib/hall-types";
import { stampRoom } from "../lib/room-store";

const HallScene = dynamic(() => import("../components/HallScene"), { ssr: false });

function HallClient({ me }: { me: Identity }) {
  const { room, updateRoom } = useRoom();
  const [tvOpen, setTvOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [nearId, setNearId] = useState<string | null>(null);
  const [nearName, setNearName] = useState<string | null>(null);
  const [context, setContext] = useState<ContextState>(IDLE_CONTEXT);
  const mobile = useMobileLandscape();
  const voice = useVoice(me);

  const socket = useHallSocket(me);
  const { players, ball, tv, game, toasts, simulated, mySocketId } = socket.snapshot;

  // persist Google profiles to Firestore `users/{uid}` (no-op without config)
  useEffect(() => {
    if (!me.uid || !dbConfigured()) return;
    import("../lib/db").then((m) =>
      m.saveUserProfile({ uid: me.uid!, name: me.name, color: me.color, photoUrl: me.photoUrl }).catch(() => {})
    );
  }, [me.uid, me.name, me.color, me.photoUrl]);

  // game sounds: pop on every pickup, jingle on start / win
  const lastAt = useRef(0);
  const lastStatus = useRef(game.status);
  useEffect(() => {
    if (game.lastCollect && game.lastCollect.at > lastAt.current) {
      lastAt.current = game.lastCollect.at;
      popSfx();
    }
    if (game.status !== lastStatus.current) {
      if (game.status === "playing") startSfx();
      if (game.status === "ended") winSfx();
      lastStatus.current = game.status;
    }
  }, [game]);

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
  const handleContext = useCallback((c: ContextState) => setContext(c), []);
  const handleCollect = useCallback((starId: string) => socket.collectStar(starId), [socket]);
  const handleHit = useCallback(() => socket.sendHit(), [socket]);
  const handleSofaSit = useCallback(() => socket.sendAction("sit", null, { seatMode: "sofa" }), [socket]);

  // anyone near the TV can put ONE link on the shared shelf (synced via room)
  const handleAddVideo = useCallback(
    (videoId: string, title: string) => {
      setLinkOpen(false);
      if (room.tv.length >= 30) {
        socket.pushToast("the shelf is full (30) — remove one from /admin 📺");
        return;
      }
      if (room.tv.some((v) => v.id === videoId)) {
        socket.pushToast("that's already on the shelf 😉");
        return;
      }
      updateRoom(stampRoom({ ...room, tv: [...room.tv, { id: videoId, title }] }));
      socket.pushToast(`📺 ${me.name} added “${title.slice(0, 30)}”`);
    },
    [room, updateRoom, socket, me.name]
  );

  const sitting = players["me"]?.sitting ?? false;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#f6efe6] font-[var(--font-geist-sans),system-ui,sans-serif]">
      <HallScene
        myName={me.name}
        myColor={me.color}
        mySocketId={mySocketId}
        players={players}
        ball={ball}
        room={room}
        tv={{ ...tv, playlist: tvPlaylist }}
        game={game}
        onMove={handleMove}
        onBall={handleBall}
        onNear={handleNear}
        onContext={handleContext}
        onCollect={handleCollect}
        onHit={handleHit}
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
        mobile={mobile}
        context={context}
        gameStatus={game.status}
        gameOpen={gameOpen}
        voiceStatus={voice.status}
        voiceOpen={voiceOpen}
        voiceCount={voice.peers.length || undefined}
        onSignOut={me.signOut}
        onEmote={socket.sendEmote}
        onPoke={() => socket.sendAction("poke", nearId)}
        onHighfive={() => socket.sendAction("highfive", nearId)}
        onSit={() => socket.sendAction("sit")}
        onSofaSit={handleSofaSit}
        onToss={() => hallToss.fn?.()}
        onToggleTv={() => setTvOpen((v) => !v)}
        onToggleGame={() => setGameOpen((v) => !v)}
        onToggleVoice={() => setVoiceOpen((v) => !v)}
        onOpenAddLink={() => setLinkOpen(true)}
      />

      {gameOpen && (
        <GamePanel game={game} compact={mobile} onStart={socket.startGame} onClose={() => setGameOpen(false)} />
      )}

      {voiceOpen && <VoicePanel voice={voice} compact={mobile} onClose={() => setVoiceOpen(false)} />}

      {linkOpen && <AddLinkPanel onAdd={handleAddVideo} onClose={() => setLinkOpen(false)} />}

      {tvOpen && (
        <TvPanel
          tv={{ ...tv, playlist: tvPlaylist }}
          fallbackPlaylist={room.tv}
          compact={mobile}
          onControl={socket.tvControl}
          onClose={() => setTvOpen(false)}
        />
      )}

      <RotatePrompt />

      {/* tiny admin hint */}
      {!mobile && (
        <a
          href="/admin"
          className="absolute bottom-2 right-3 z-20 text-[10px] font-semibold text-[#3d3347]/30 hover:text-[#3d3347]/70"
        >
          room setup →
        </a>
      )}
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

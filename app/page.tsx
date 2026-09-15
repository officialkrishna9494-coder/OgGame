"use client";

// ─── Cozy Hall · the one environment ────────────────────────────────────────
// Join → see each other move → react / poke / high-five / sit / toss / TV.
// No routes for features: everything happens in this single hall.
// Identity comes from AuthGate (dev quickplay, nickname, or Google).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import AuthGate from "../components/AuthGate";
import AddLinkPanel from "../components/AddLinkPanel";
import ChatPanel from "../components/ChatPanel";
import GamePanel from "../components/GamePanel";
import RpsPanel from "../components/RpsPanel";
import SosAlert from "../components/SosAlert";
import Hud from "../components/Hud";
import RotatePrompt from "../components/RotatePrompt";
import TvPanel from "../components/TvPanel";
import VoicePanel from "../components/VoicePanel";
import { Icon } from "../components/icons";
import { hallToss } from "../components/HallScene";
import { useRoom } from "../lib/room-store";
import { useChat } from "../lib/useChat";
import { useHallSocket } from "../lib/useHallSocket";
import { useMobileLandscape } from "../lib/useMobileLandscape";
import { useVoice } from "../lib/useVoice";
import { dbConfigured } from "../lib/db";
import { popSfx, sosSfx, startSfx, winSfx } from "../lib/sfx";
import type { Identity } from "../lib/auth";
import { IDLE_CONTEXT, type BallState, type ContextState, type PlayerState } from "../lib/hall-types";
import { stampRoom } from "../lib/room-store";

const HallScene = dynamic(() => import("../components/HallScene"), { ssr: false });

function HallClient({ me }: { me: Identity }) {
  const { room, updateRoom } = useRoom();
  const [tvOpen, setTvOpen] = useState(false);
  // endsAt of the star-scramble round this player hid (0 = none hidden)
  const [gameHiddenRound, setGameHiddenRound] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [rpsOpen, setRpsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  const [sosDismissedAt, setSosDismissedAt] = useState(0);
  const [nearId, setNearId] = useState<string | null>(null);
  const [nearName, setNearName] = useState<string | null>(null);
  const [context, setContext] = useState<ContextState>(IDLE_CONTEXT);
  const mobile = useMobileLandscape();
  const voice = useVoice(me);

  const socket = useHallSocket(me);
  const { players, ball, tv, game, rps, sos, toasts, simulated, mySocketId } = socket.snapshot;
  const chat = useChat();
  const unreadCount = chat.messages.filter((m) => m.at > chatSeenAt && m.name !== me.name).length;

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

  // RPS sounds: pop on every reveal, fanfare on match win
  const lastRevealAt = useRef(0);
  const lastRpsStatus = useRef(rps.status);
  useEffect(() => {
    if (rps.lastReveal && rps.lastReveal.at > lastRevealAt.current) {
      lastRevealAt.current = rps.lastReveal.at;
      popSfx();
    }
    if (rps.status !== lastRpsStatus.current) {
      if (rps.status === "picking") startSfx();
      if (rps.status === "ended") winSfx();
      lastRpsStatus.current = rps.status;
    }
  }, [rps]);

  // SOS overlay: pure render gate (SosAlert self-dismisses after 3s).
  // Shows while the alarm is fresh and not manually stood down.
  const showSos = !!sos && sosDismissedAt < sos.at;
  // SOS siren on every fresh alarm
  const lastSosAt = useRef(0);
  useEffect(() => {
    if (sos && sos.at > lastSosAt.current) {
      lastSosAt.current = sos.at;
      sosSfx();
    }
  }, [sos]);

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
  const handleSos = useCallback(() => socket.raiseSos(), [socket]);
  // ACT / E at the rug starts the round itself — the server is the referee,
  // so there's nothing to start while offline
  const handleStartGame = useCallback(() => {
    if (simulated) {
      socket.pushToast("star scramble needs the live hall server", "offline");
      return;
    }
    socket.startGame();
  }, [socket, simulated]);
  const toggleChat = useCallback(() => {
    setChatOpen((v) => !v);
    setChatSeenAt(Date.now());
  }, []);
  // persist first (throws when offline/unsigned), bubble overhead on success
  const handleChatSend = useCallback(
    async (text: string) => {
      await chat.send({ name: me.name, color: me.color, text });
      socket.sendChat(text);
    },
    [chat, socket, me.name, me.color]
  );
  // ACT / E at the RPS table: idle → throw a challenge; someone else is
  // waiting → accept it (what the table and panel promise). Always open the
  // panel so you can pick / spectate from there.
  const handleRpsAct = useCallback(() => {
    const r = socket.snapshot.rps;
    const acceptable = r.status === "waiting" && !!r.seats.a && r.seats.a !== mySocketId && !r.seats.b;
    if (r.status === "idle" || acceptable) socket.challengeRps();
    setRpsOpen(true);
  }, [socket, mySocketId]);

  // anyone near the TV can put ONE link on the shared shelf (synced via room)
  const handleAddVideo = useCallback(
    (videoId: string, title: string) => {
      setLinkOpen(false);
      if (room.tv.length >= 30) {
        socket.pushToast("the shelf is full (30) — remove one from /admin", "warning");
        return;
      }
      if (room.tv.some((v) => v.id === videoId)) {
        socket.pushToast("that's already on the shelf", "info");
        return;
      }
      updateRoom(stampRoom({ ...room, tv: [...room.tv, { id: videoId, title }] }));
      socket.pushToast(`${me.name} added “${title.slice(0, 30)}”`, "tv");
    },
    [room, updateRoom, socket, me.name]
  );

  const sitting = players["me"]?.sitting ?? false;
  // the scramble panel is a live scoreboard: it opens for everyone while a
  // round runs and through its results, unless this player hid that round
  const gameLive = game.status === "playing" || game.status === "ended";
  const showGame = gameLive && gameHiddenRound !== game.endsAt;
  const rpsSeat = !mySocketId ? null : rps.seats.a === mySocketId ? "a" : rps.seats.b === mySocketId ? "b" : null;

  return (
    <main className="relative h-dvh w-full touch-manipulation overflow-hidden bg-[#f6efe6] font-[var(--font-geist-sans),system-ui,sans-serif]">
      <HallScene
        myName={me.name}
        myColor={me.color}
        mySocketId={mySocketId}
        players={players}
        ball={ball}
        room={room}
        tv={{ ...tv, playlist: tvPlaylist }}
        game={game}
        rps={rps}
        sos={sos}
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
        rpsStatus={rps.status}
        rpsSeat={rpsSeat}
        unreadCount={unreadCount || undefined}
        chatOpen={chatOpen}
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
        onStartGame={handleStartGame}
        onToggleVoice={() => setVoiceOpen((v) => !v)}
        onToggleRps={() => setRpsOpen((v) => !v)}
        onRpsAct={handleRpsAct}
        onToggleChat={toggleChat}
        onSos={handleSos}
        onOpenAddLink={() => setLinkOpen(true)}
      />

      {showGame && (
        <GamePanel game={game} compact={mobile} onStart={handleStartGame} onClose={() => setGameHiddenRound(game.endsAt)} />
      )}

      {rpsOpen && (
        <RpsPanel
          rps={rps}
          mySocketId={mySocketId}
          compact={mobile}
          onChallenge={socket.challengeRps}
          onPick={socket.pickRps}
          onLeave={socket.leaveRps}
          onClose={() => setRpsOpen(false)}
        />
      )}

      {voiceOpen && <VoicePanel voice={voice} compact={mobile} onClose={() => setVoiceOpen(false)} />}

      {linkOpen && <AddLinkPanel onAdd={handleAddVideo} onClose={() => setLinkOpen(false)} />}

      {chatOpen && (
        <ChatPanel
          messages={chat.messages}
          cloud={chat.live}
          compact={mobile}
          onSend={handleChatSend}
          onClose={() => setChatOpen(false)}
        />
      )}

      {showSos && sos && (
        <SosAlert key={sos.at} name={sos.name} onClose={() => setSosDismissedAt(Date.now())} />
      )}

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
          className="absolute bottom-2 right-3 z-20 flex items-center gap-1 text-[10px] font-semibold text-[#3d3347]/30 hover:text-[#3d3347]/70"
        >
          room setup <Icon name="arrowRight" size={10} />
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

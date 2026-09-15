"use client";

// ─── Cozy Hall · voice hook (LiveKit) ───────────────────────────────────────
// Join/leave/mute + live participant list with speaking + mic state.
// Remote audio attaches to managed <audio> elements; everything tears down
// on leave/unmount. Token comes from /api/livekit-token — the secret never
// reaches the browser.

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import { VOICE_ROOM } from "./voice-config";

export type VoiceStatus = "idle" | "connecting" | "live" | "error";

export interface VoicePeer {
  identity: string;
  name: string;
  isLocal: boolean;
  speaking: boolean;
  micOn: boolean;
}

interface Who {
  uid?: string;
  name: string;
}

function participantIdentity(who: Who): string {
  if (who.uid) return `u-${who.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}`;
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

export function useVoice(who: Who | null) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const whoRef = useRef(who);
  const joinBusy = useRef(false);

  useEffect(() => {
    whoRef.current = who;
  });

  const snapshotPeers = useCallback(() => {
    const room = roomRef.current;
    if (!room) {
      setPeers([]);
      return;
    }
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    setPeers(
      all.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        isLocal: p === room.localParticipant,
        speaking: p.isSpeaking,
        micOn: p.isMicrophoneEnabled,
      }))
    );
  }, []);

  const detachAll = useCallback(() => {
    for (const el of audioEls.current.values()) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* already gone */
      }
    }
    audioEls.current.clear();
  }, []);

  const leave = useCallback(() => {
    joinBusy.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        room.disconnect();
      } catch {
        /* already closed */
      }
    }
    detachAll();
    setPeers([]);
    setMuted(false);
    setAudioBlocked(false);
    setStatus("idle");
  }, [detachAll]);

  // auto-leave when the hall unmounts
  useEffect(() => {
    return () => {
      joinBusy.current = false;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        try {
          room.disconnect();
        } catch {
          /* ignore */
        }
      }
      detachAll();
    };
  }, [detachAll]);

  const join = useCallback(async () => {
    const me = whoRef.current;
    if (!me || joinBusy.current || roomRef.current) return;
    joinBusy.current = true;
    setError(null);
    setStatus("connecting");
    try {
      const res = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: participantIdentity(me), name: me.name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "voice server said no");
      }
      const { token, url } = (await res.json()) as { token: string; url: string };

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      const onPeers = () => snapshotPeers();
      room
        .on(RoomEvent.ParticipantConnected, onPeers)
        .on(RoomEvent.ParticipantDisconnected, onPeers)
        .on(RoomEvent.TrackMuted, onPeers)
        .on(RoomEvent.TrackUnmuted, onPeers)
        .on(RoomEvent.LocalTrackPublished, onPeers)
        .on(RoomEvent.LocalTrackUnpublished, onPeers)
        .on(RoomEvent.ActiveSpeakersChanged, onPeers)
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setAudioBlocked(!room.canPlaybackAudio);
        })
        .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const key = `${participant.sid}:${track.sid}`;
          const el = document.createElement("audio");
          el.autoplay = true;
          (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
          track.attach(el);
          audioEls.current.set(key, el);
        })
        .on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          const key = `${participant.sid}:${track.sid}`;
          const el = audioEls.current.get(key);
          if (el) {
            track.detach(el);
            el.pause();
            el.remove();
            audioEls.current.delete(key);
          }
        })
        .on(RoomEvent.Reconnecting, () => setStatus("connecting"))
        .on(RoomEvent.Reconnected, () => {
          setStatus("live");
          snapshotPeers();
        })
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) leave();
        });

      await room.connect(url, token);
      // best-effort unblock (the Join tap usually counts as the gesture)
      room.startAudio().catch(() => {});
      await room.localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      setStatus("live");
      snapshotPeers();
    } catch (e) {
      joinBusy.current = false;
      roomRef.current = null;
      detachAll();
      setPeers([]);
      setStatus("error");
      setError(
        e instanceof Error ? e.message : "couldn't join voice — check mic permission"
      );
    }
  }, [detachAll, leave, snapshotPeers]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "live") return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMuted(!next);
      snapshotPeers();
    } catch {
      /* mic busy — stays as-is */
    }
  }, [snapshotPeers, status]);

  const unblockAudio = useCallback(() => {
    roomRef.current?.startAudio().catch(() => {});
  }, []);

  return { status, muted, peers, error, audioBlocked, join, leave, toggleMute, unblockAudio, roomName: VOICE_ROOM };
}

export type Voice = ReturnType<typeof useVoice>;

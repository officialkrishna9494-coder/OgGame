"use client";

// ─── Cozy Hall · voice channel shelf ────────────────────────────────────────
// Same corner-shelf pattern as the TV: join / mute / leave + live roster
// with speaking rings. Never a separate page.

import type { Voice } from "../lib/useVoice";
import { voiceConfigured } from "../lib/voice-config";

interface Props {
  voice: Voice;
  compact?: boolean;
  onClose: () => void;
}

export default function VoicePanel({ voice, compact, onClose }: Props) {
  const { status, muted, peers, error, audioBlocked } = voice;

  return (
    <div
      className={`pointer-events-auto absolute z-20 overflow-hidden rounded-[24px] bg-white/92 shadow-[0_24px_70px_-18px_rgba(60,40,90,0.45)] ring-1 ring-black/[0.07] backdrop-blur ${
        compact
          ? "bottom-[calc(var(--safe-b)+0.5rem)] left-1/2 w-[min(78vw,320px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,380px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between bg-gradient-to-r from-[#8ce8c0] to-[#9bf6ff] px-4 py-2.5 text-[#234034]">
        <p className="text-[13px] font-bold">
          🎙️ voice channel{" "}
          {status === "live" ? `· ${peers.length} in` : status === "connecting" ? "· joining…" : ""}
        </p>
        <button onClick={onClose} className="rounded-full bg-black/10 px-2.5 py-0.5 text-[12px] font-bold hover:bg-black/15">
          hide
        </button>
      </div>

      <div className="px-4 py-3">
        {!voiceConfigured() && (
          <p className="rounded-2xl bg-[#faf6ef] px-3 py-2.5 text-[12px] leading-relaxed text-[#8a7f98]">
            Voice isn&apos;t set up on this server yet — add your LiveKit URL + keys and redeploy. See README → Voice. 🎙️
          </p>
        )}

        {status === "idle" || status === "error" ? (
          <>
            <p className="text-[13px] leading-relaxed text-[#4a3f55]">
              Talk while you wander — whoever joins the hall can hop in. 🎧
            </p>
            {error && <p className="mt-2 text-[12px] font-semibold text-[#b03939]">{error}</p>}
            <button
              onClick={() => void voice.join()}
              disabled={!voiceConfigured()}
              className="mt-3 w-full rounded-2xl bg-[#3d3347] py-3 text-sm font-bold text-white shadow-lg transition-transform hover:bg-[#2e2735] active:scale-[0.98] disabled:opacity-40"
            >
              join voice 🎙️
            </button>
          </>
        ) : (
          <>
            {audioBlocked && (
              <button
                onClick={voice.unblockAudio}
                className="mb-2 w-full rounded-2xl bg-[#fff3d6] px-3 py-2 text-[12px] font-bold text-[#7a5b00]"
              >
                🔊 tap to enable sound
              </button>
            )}
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
              {peers.map((peer) => (
                <div
                  key={peer.identity}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px] font-semibold transition-all ${
                    peer.speaking ? "bg-[#dcfae9] text-[#14532d]" : "bg-black/[0.03] text-[#4a3f55]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white ${
                      peer.speaking ? "animate-pulse bg-green-500" : "bg-[#a08fb5]"
                    }`}
                  >
                    {peer.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate">
                    {peer.name}
                    {peer.isLocal && <span className="ml-1 text-[10px] font-bold text-[#a08fb5]">you</span>}
                  </span>
                  <span className="text-[13px]">{peer.micOn ? (peer.speaking ? "🗣️" : "🎙️") : "🔇"}</span>
                </div>
              ))}
              {peers.length === 0 && (
                <p className="text-[12px] font-medium text-[#a99cbb]">connecting…</p>
              )}
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => void voice.toggleMute()}
                disabled={status !== "live"}
                className={`flex-1 rounded-2xl py-2.5 text-[13px] font-bold shadow transition-transform active:scale-[0.98] disabled:opacity-40 ${
                  muted ? "bg-[#b03939] text-white" : "bg-[#efe8f7] text-[#4a3f55]"
                }`}
              >
                {muted ? "🔇 unmute" : "🎙️ mute"}
              </button>
              <button
                onClick={voice.leave}
                className="flex-1 rounded-2xl bg-[#3d3347] py-2.5 text-[13px] font-bold text-white transition-transform hover:bg-[#2e2735] active:scale-[0.98]"
              >
                leave 👋
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

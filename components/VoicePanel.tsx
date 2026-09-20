"use client";

// ─── Cozy Hall · voice channel shelf ────────────────────────────────────────
// Same corner-shelf pattern as the TV: join / mute / leave + live roster
// with speaking rings. Never a separate page.

import type { Voice } from "../lib/useVoice";
import { voiceConfigured } from "../lib/voice-config";
import { Icon } from "./icons";

interface Props {
  voice: Voice;
  compact?: boolean;
  onClose: () => void;
}

export default function VoicePanel({ voice, compact, onClose }: Props) {
  const { status, muted, peers, error, audioBlocked } = voice;

  return (
    <div
      className={`pointer-events-auto absolute z-20 overflow-hidden rounded-[20px] bg-white shadow-[0_24px_70px_-24px_rgba(30,25,40,0.35)] ring-1 ring-black/10 ${
        compact
          ? "bottom-[calc(var(--safe-b)+0.5rem)] left-1/2 w-[min(78vw,320px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,380px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-2.5">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4a3f55]">
          <Icon name="voice" size={15} className="text-[#a08fb5]" /> voice channel
          {status === "live" && (
            <span className="rounded-full border border-black/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.08em] tabular-nums text-[#8a7f98]">
              {peers.length} in
            </span>
          )}
          {status === "connecting" && (
            <span className="rounded-full border border-black/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a7f98]">
              joining…
            </span>
          )}
        </p>
        <button
          onClick={onClose}
          className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a7f98] transition-colors hover:bg-black/[0.05] hover:text-[#4a3f55]"
        >
          hide
        </button>
      </div>

      <div className="px-4 py-3">
        {!voiceConfigured() && (
          <p className="flex gap-2 rounded-xl border border-black/[0.08] px-3 py-2.5 text-[12px] leading-relaxed text-[#8a7f98]">
            <Icon name="wrench" size={15} className="mt-0.5" />
            <span>Voice isn&apos;t set up on this server yet — add your LiveKit URL + keys and redeploy. See README, “Voice”.</span>
          </p>
        )}

        {status === "idle" || status === "error" ? (
          <>
            <p className="flex gap-2 text-[13px] leading-relaxed text-[#4a3f55]">
              <Icon name="headphones" size={17} className="mt-0.5 text-[#40916c]" />
              <span>Talk while you wander — whoever joins the hall can hop in.</span>
            </p>
            {error && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#b03939]">
                <Icon name="warning" size={14} /> {error}
              </p>
            )}
            <button
              onClick={() => void voice.join()}
              disabled={!voiceConfigured()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3d3347] py-3 text-sm font-bold text-white transition-colors hover:bg-[#2e2735] active:scale-[0.98] disabled:opacity-40"
            >
              <Icon name="voice" size={17} /> join voice
            </button>
          </>
        ) : (
          <>
            {audioBlocked && (
              <button
                onClick={voice.unblockAudio}
                className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e5c26a] bg-[#fffaf0] px-3 py-2 text-[12px] font-bold text-[#7a5b00] transition-colors hover:bg-[#fff3d6]"
              >
                <Icon name="sound" size={15} /> tap to enable sound
              </button>
            )}
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
              {peers.map((peer) => (
                <div
                  key={peer.identity}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    peer.speaking ? "border-[#7cc9a1] bg-[#f2fbf6] text-[#14532d]" : "border-black/[0.08] bg-white text-[#4a3f55]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white transition-colors ${
                      peer.speaking ? "bg-[#2a9e6e]" : "bg-[#a99cbb]"
                    }`}
                  >
                    {peer.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate">
                    {peer.name}
                    {peer.isLocal && <span className="ml-1 text-[10px] font-bold text-[#a08fb5]">you</span>}
                  </span>
                  <Icon
                    name={peer.micOn ? (peer.speaking ? "speaking" : "voice") : "voiceOff"}
                    size={16}
                    label={peer.micOn ? (peer.speaking ? "speaking" : "mic on") : "muted"}
                    className={peer.micOn ? (peer.speaking ? "text-[#2a9e6e]" : "text-[#8a7f98]") : "text-[#b03939]"}
                  />
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
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[13px] font-bold transition-colors active:scale-[0.98] disabled:opacity-40 ${
                  muted
                    ? "border-[#c98a8a] bg-[#b03939] text-white hover:bg-[#9d3232]"
                    : "border-black/10 bg-white text-[#4a3f55] hover:bg-black/[0.04]"
                }`}
              >
                <Icon name={muted ? "voiceOff" : "voice"} size={15} /> {muted ? "unmute" : "mute"}
              </button>
              <button
                onClick={voice.leave}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white py-2.5 text-[13px] font-bold text-[#4a3f55] transition-colors hover:bg-black/[0.04] active:scale-[0.98]"
              >
                <Icon name="signOut" size={15} /> leave
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

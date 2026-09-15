"use client";

// ─── Cozy Hall · chat shelf ─────────────────────────────────────────────────
// Persistent history (Firestore) + instant send. Everyone's words also pop
// overhead in 3D via the socket bubble, so nothing is missed.

import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "../lib/hall-types";
import { CHAT_MAX_LEN } from "../lib/hall-types";
import { dbConfigured } from "../lib/db";
import { Icon } from "./icons";

interface Props {
  messages: ChatMsg[];
  cloud: boolean;
  compact?: boolean;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChatPanel({ messages, cloud, compact, onSend, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = async () => {
    const text = draft.trim().slice(0, CHAT_MAX_LEN);
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(text);
      setDraft("");
    } catch (ex) {
      const code = (ex as { code?: string } | null)?.code ?? "";
      setError(
        code === "permission-denied" || code.includes("PERMISSION_DENIED")
          ? "Firestore said no — sign in with Google first, or check the messages Rules."
          : "couldn't send — check your connection"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`pointer-events-auto absolute z-20 flex max-h-[70dvh] flex-col overflow-hidden rounded-[24px] bg-white/92 shadow-[0_24px_70px_-18px_rgba(60,40,90,0.45)] ring-1 ring-black/[0.07] backdrop-blur ${
        compact
          ? "bottom-[calc(var(--safe-b)+0.5rem)] left-1/2 w-[min(80vw,330px)] -translate-x-1/2"
          : "bottom-24 left-1/2 w-[min(94vw,380px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between bg-[#3d3347] px-4 py-2.5 text-white">
        <p className="flex items-center gap-1.5 text-[13px] font-bold">
          <Icon name="chat" size={16} /> hall chat
          {!cloud && (
            <span className="flex items-center gap-1 font-semibold text-white/70">
              · <Icon name="offline" size={13} /> offline
            </span>
          )}
        </p>
        <button onClick={onClose} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold hover:bg-white/25">
          hide
        </button>
      </div>

      <div ref={listRef} className="flex min-h-[120px] flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2.5">
        {!dbConfigured() && (
          <p className="flex gap-2 rounded-2xl bg-[#faf6ef] px-3 py-2 text-[12px] leading-relaxed text-[#8a7f98]">
            <Icon name="info" size={14} className="mt-0.5" />
            <span>Chat history needs Firebase — until then, messages only pop overhead in 3D.</span>
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <span
              className="mt-0.5 block h-6 w-6 shrink-0 rounded-full text-center text-[11px] font-black leading-6 text-white"
              style={{ background: m.color }}
            >
              {m.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-black/[0.04] px-2.5 py-1.5">
              <p className="text-[11px] font-extrabold text-[#8a7f98]">
                {m.name} <span className="font-medium tabular-nums">{clock(m.at)}</span>
              </p>
              <p className="break-words text-[13px] font-medium leading-snug text-[#3d3347]">{m.text}</p>
            </div>
          </div>
        ))}
        {dbConfigured() && messages.length === 0 && (
          <p className="flex items-center justify-center gap-1.5 py-4 text-center text-[12px] font-medium text-[#a99cbb]">
            <Icon name="wave" size={14} /> no messages yet — say hi!
          </p>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 px-4 pb-1 text-[11px] font-semibold text-[#b03939]">
          <Icon name="warning" size={13} /> {error}
        </p>
      )}
      <div className="flex gap-2 border-t border-black/[0.06] p-2.5">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.slice(0, CHAT_MAX_LEN));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          placeholder="message the hall…"
          maxLength={CHAT_MAX_LEN}
          className="min-w-0 flex-1 rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-[13px] outline-none placeholder:text-[#b9abcb] focus:border-[#ff8fab]"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-xl bg-[#3d3347] px-4 text-[13px] font-bold text-white transition-transform active:scale-95 disabled:opacity-40"
        >
          {busy ? "…" : "send"}
        </button>
      </div>
    </div>
  );
}

"use client";

// ─── Cozy Hall · admin — data-driven room setup, no hard-coding ─────────────
// Protected by a simple passcode for now (ADMIN_CODE env / default below).
// Swap for Firebase Auth custom claims when Google Sign-in lands.
// Everything here writes RoomConfig → localStorage now, Firestore later.

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_ROOM, NEXT_FRAME_SLOT } from "../../lib/room-defaults";
import { loadRoom, saveRoom } from "../../lib/room-store";
import { AUTH_MODE } from "../../lib/auth";
import { dbConfigured } from "../../lib/db";
import { cloudinaryConfigured, uploadImage } from "../../lib/media";
import { voiceConfigured } from "../../lib/voice-config";
import type { RoomConfig } from "../../lib/hall-types";

const PASSCODE = "cozy123";

const input =
  "w-full rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-[13px] font-medium text-[#3d3347] outline-none focus:border-[#ff8fab] focus:ring-4 focus:ring-[#ff8fab]/15";
const label = "mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#a08fb5]";
const card = "rounded-[20px] border border-black/[0.06] bg-white/85 p-4 shadow-sm";

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<RoomConfig | null>(null);

  const unlock = () => {
    if (code.trim() === PASSCODE) {
      setRoom(loadRoom());
      setUnlocked(true);
    } else {
      alert("hmm, that's not the room code 🌙");
    }
  };

  const patch = (p: Partial<RoomConfig>) => {
    if (!room) return;
    const next = { ...room, ...p };
    setRoom(next);
    saveRoom(next);
    if (dbConfigured()) {
      import("../../lib/db").then((m) => m.saveRoomCloud(next).catch(() => {}));
    }
  };

  if (!unlocked) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f6efe6] p-4">
        <div className="w-full max-w-xs rounded-[24px] border border-white/70 bg-white/90 p-6 text-center shadow-xl">
          <p className="text-3xl">🔐</p>
          <h1 className="mt-2 text-xl font-extrabold text-[#3d3347]">room setup</h1>
          <p className="mt-1 text-[12px] text-[#8a7f98]">
            for the host only · default code <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono">cozy123</code>
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            type="password"
            placeholder="enter code…"
            autoFocus
            className="mt-4 w-full rounded-2xl border border-[#e8dcc8] bg-[#fffaf2] px-4 py-2.5 text-center font-semibold outline-none focus:border-[#ff8fab]"
          />
          <button onClick={unlock} className="mt-3 w-full rounded-2xl bg-[#3d3347] py-2.5 text-sm font-bold text-white hover:bg-[#2e2735]">
            unlock
          </button>
          <Link href="/" className="mt-3 inline-block text-[12px] font-semibold text-[#a08fb5] hover:text-[#3d3347]">
            ← back to the hall
          </Link>
        </div>
      </main>
    );
  }

  if (!room) return null;

  return (
    <main className="min-h-dvh bg-[#f6efe6] p-4 pb-16 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#a08fb5]">cozy hall · admin</p>
            <h1 className="text-2xl font-extrabold text-[#3d3347]">room setup</h1>
          </div>
          <Link href="/" className="rounded-full bg-[#3d3347] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#2e2735]">
            ← hall
          </Link>
        </div>

        {/* backend status */}
        <section className="mt-4 flex flex-wrap gap-2">
          <StatusPill ok label={`auth · ${AUTH_MODE}`} hint={AUTH_MODE === "firebase" ? "Google sign-in" : "dev quickplay"} />
          <StatusPill
            ok={dbConfigured()}
            label={dbConfigured() ? "Firestore · live" : "Firestore · local"}
            hint={dbConfigured() ? "rooms/cozy-hall syncs to friends" : "add Firebase vars to sync"}
          />
          <StatusPill
            ok={cloudinaryConfigured()}
            label={cloudinaryConfigured() ? "Cloudinary · ready" : "Cloudinary · off"}
            hint={cloudinaryConfigured() ? "uploads enabled below" : "add cloud name + preset"}
          />
          <StatusPill
            ok={voiceConfigured()}
            label={voiceConfigured() ? "Voice · ready" : "Voice · off"}
            hint={voiceConfigured() ? "LiveKit channel live in the hall" : "add LiveKit URL + keys"}
          />
        </section>

        {/* basics */}
        <section className={`${card} mt-4`}>
          <h2 className="text-sm font-extrabold text-[#3d3347]">basics</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>room name</span>
              <input value={room.name} onChange={(e) => patch({ name: e.target.value })} className={input} />
            </div>
            <div>
              <span className={label}>tagline</span>
              <input value={room.tagline} onChange={(e) => patch({ tagline: e.target.value })} className={input} />
            </div>
            <div>
              <span className={label}>accent</span>
              <input value={room.accent} onChange={(e) => patch({ accent: e.target.value })} className={input} />
            </div>
            <div>
              <span className={label}>max friends</span>
              <input
                type="number"
                min={2}
                max={12}
                value={room.maxPlayers}
                onChange={(e) => patch({ maxPlayers: Number(e.target.value) || 10 })}
                className={input}
              />
            </div>
          </div>
        </section>

        {/* memory frames */}
        <section className={`${card} mt-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-[#3d3347]">memory frames · {room.frames.length}</h2>
            <button
              onClick={() =>
                patch({
                  frames: [
                    ...room.frames,
                    {
                      id: `frame-${Date.now()}`,
                      title: "New memory",
                      caption: "add a caption",
                      hue: Math.floor(Math.random() * 360),
                      position: [
                        NEXT_FRAME_SLOT.x + room.frames.length * NEXT_FRAME_SLOT.dx,
                        NEXT_FRAME_SLOT.y,
                        NEXT_FRAME_SLOT.z,
                      ],
                      size: [2.1, 1.5],
                    },
                  ],
                })
              }
              className="rounded-full bg-[#efe8f7] px-3 py-1 text-[12px] font-bold text-[#4a3f55] hover:bg-[#e2d6f2]"
            >
              + add
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            {room.frames.map((f, i) => (
              <div key={f.id} className="grid gap-2 rounded-2xl bg-[#faf6ef] p-3 sm:grid-cols-[64px_1fr_1fr_auto]">
                <div className="flex items-center">
                  {f.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-black/10" />
                  ) : (
                    <span
                      className="flex h-16 w-16 items-center justify-center rounded-xl text-xl ring-1 ring-black/10"
                      style={{ background: `linear-gradient(135deg, hsl(${f.hue},70%,78%), hsl(${(f.hue + 50) % 360},65%,62%))` }}
                    >
                      🖼️
                    </span>
                  )}
                </div>
                <div>
                  <span className={label}>title</span>
                  <input
                    value={f.title}
                    onChange={(e) => {
                      const frames = [...room.frames];
                      frames[i] = { ...f, title: e.target.value };
                      patch({ frames });
                    }}
                    className={input}
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <UploadButton
                      onUrl={(url) => {
                        const frames = [...room.frames];
                        frames[i] = { ...f, imageUrl: url };
                        patch({ frames });
                      }}
                    />
                    {f.imageUrl && (
                      <button
                        onClick={() => {
                          const frames = [...room.frames];
                          frames[i] = { ...f, imageUrl: undefined };
                          patch({ frames });
                        }}
                        className="rounded-lg bg-black/[0.05] px-2 py-1 text-[11px] font-bold text-[#8a7f98]"
                      >
                        gradient
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <span className={label}>caption / image url (Cloudinary)</span>
                  <input
                    value={f.imageUrl ?? f.caption}
                    placeholder="caption or https://…"
                    onChange={(e) => {
                      const frames = [...room.frames];
                      const v = e.target.value;
                      frames[i] = v.startsWith("http") ? { ...f, imageUrl: v } : { ...f, caption: v, imageUrl: undefined };
                      patch({ frames });
                    }}
                    className={input}
                  />
                </div>
                <button
                  onClick={() => patch({ frames: room.frames.filter((x) => x.id !== f.id) })}
                  className="self-end rounded-xl bg-[#ffe4e4] px-3 py-2 text-[12px] font-bold text-[#b03939] hover:bg-[#ffd2d2]"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#a99cbb]">
            tip: paste a Cloudinary URL into the second field to use a real photo — otherwise the hall paints a soft gradient.
          </p>
        </section>

        {/* posters */}
        <section className={`${card} mt-4`}>
          <h2 className="text-sm font-extrabold text-[#3d3347]">posters · {room.posters.length}</h2>
          <div className="mt-3 grid gap-3">
            {room.posters.map((poster, i) => (
              <div key={poster.id} className="grid gap-2 rounded-2xl bg-[#faf6ef] p-3 sm:grid-cols-[64px_1fr_1fr]">
                <div className="flex items-center">
                  {poster.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-black/10" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-xl ring-1 ring-black/10">
                      📜
                    </span>
                  )}
                </div>
                <div>
                  <span className={label}>title</span>
                  <input
                    value={poster.title}
                    onChange={(e) => {
                      const posters = [...room.posters];
                      posters[i] = { ...poster, title: e.target.value };
                      patch({ posters });
                    }}
                    className={input}
                  />
                  <div className="mt-1.5">
                    <UploadButton
                      onUrl={(url) => {
                        const posters = [...room.posters];
                        posters[i] = { ...poster, imageUrl: url };
                        patch({ posters });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <span className={label}>subtitle</span>
                  <input
                    value={poster.subtitle}
                    onChange={(e) => {
                      const posters = [...room.posters];
                      posters[i] = { ...poster, subtitle: e.target.value };
                      patch({ posters });
                    }}
                    className={input}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* tv playlist */}
        <section className={`${card} mt-4`}>
          <h2 className="text-sm font-extrabold text-[#3d3347]">tv playlist · {room.tv.length}</h2>
          <div className="mt-3 grid gap-2">
            {room.tv.map((v, i) => (
              <div key={`${v.id}-${i}`} className="flex items-center gap-2 rounded-2xl bg-[#faf6ef] p-2 pl-3">
                <span className="text-[12px] font-bold text-[#a08fb5]">{i + 1}</span>
                <input
                  value={v.title}
                  onChange={(e) => {
                    const tv = [...room.tv];
                    tv[i] = { ...v, title: e.target.value };
                    patch({ tv });
                  }}
                  className={input}
                />
                <input
                  value={v.id}
                  onChange={(e) => {
                    const tv = [...room.tv];
                    tv[i] = { ...v, id: e.target.value.trim() };
                    patch({ tv });
                  }}
                  placeholder="yt id"
                  className={`${input} !w-28 shrink-0 font-mono`}
                />
                <button
                  onClick={() => patch({ tv: room.tv.filter((_, j) => j !== i) })}
                  className="shrink-0 rounded-xl bg-[#ffe4e4] px-2.5 py-2 text-[12px] font-bold text-[#b03939]"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <AddVideo onAdd={(id, title) => patch({ tv: [...room.tv, { id, title }] })} />
        </section>

        <button
          onClick={() => {
            patch({ ...DEFAULT_ROOM });
          }}
          className="mt-4 w-full rounded-2xl border border-[#e0cfcf] bg-white/60 py-2.5 text-[12px] font-bold text-[#8a7f98] hover:text-[#b03939]"
        >
          reset room to defaults
        </button>
        <p className="mt-3 text-center text-[11px] text-[#a99cbb]">
          {dbConfigured()
            ? "☁️ saving to Firestore rooms/cozy-hall — every friend sees edits live"
            : "💾 saving locally — add Firebase vars to sync across friends"} · presence stays on sockets
        </p>
      </div>
    </main>
  );
}

function StatusPill({ ok = true, label, hint }: { ok?: boolean; label: string; hint: string }) {
  return (
    <span title={hint} className="flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-[#4a3f55] shadow-sm ring-1 ring-black/[0.06]">
      <span className={`block h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-amber-400"}`} />
      {label}
    </span>
  );
}

function UploadButton({ onUrl }: { onUrl: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!cloudinaryConfigured()) {
    return <span className="text-[11px] font-medium text-[#a99cbb]">add Cloudinary keys for uploads ↑</span>;
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <label className="cursor-pointer rounded-lg bg-[#efe8f7] px-2.5 py-1.5 text-[11px] font-bold text-[#4a3f55] transition-colors hover:bg-[#e2d6f2]">
        {busy ? "uploading…" : "📤 upload photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setErr(null);
            uploadImage(f)
              .then((url) => onUrl(url))
              .catch((ex: unknown) => setErr(ex instanceof Error ? ex.message : "upload failed"))
              .finally(() => setBusy(false));
          }}
        />
      </label>
      {err && <span className="text-[11px] font-semibold text-[#b03939]">{err}</span>}
    </span>
  );
}

function AddVideo({ onAdd }: { onAdd: (id: string, title: string) => void }) {
  const [url, setUrl] = useState("");
  const add = () => {
    // accept full youtube urls or bare ids
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/);
    const id = m ? m[1] : url.trim();
    if (!id) return;
    onAdd(id, "shared video");
    setUrl("");
  };
  return (
    <div className="mt-2 flex gap-2">
      <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="paste a youtube link…" className="w-full rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#ff8fab]" />
      <button onClick={add} className="shrink-0 rounded-xl bg-[#3d3347] px-4 text-[13px] font-bold text-white">
        + add
      </button>
    </div>
  );
}

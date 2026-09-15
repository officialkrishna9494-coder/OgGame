// ─── Cozy Hall · app icon artwork (for next/og ImageResponse) ──────────────
// A white house on the hall's pink → lilac gradient. `rounded` keeps
// transparent corners for Android / browsers; iOS masks its own corners, so
// the apple-touch icon is full-bleed.

export function AppIconArt({ size, rounded }: { size: number; rounded: boolean }) {
  const house = Math.round(size * 0.56);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #ff8fab 0%, #bdb2ff 100%)",
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      }}
    >
      <svg width={house} height={house} viewBox="0 0 64 64">
        <path d="M32 7 L60 31 H52 V57 H12 V31 H4 Z" fill="#ffffff" />
        <path d="M25 57 V41 a7 7 0 0 1 14 0 V57 Z" fill="#ff8fab" />
        <circle cx="32" cy="27" r="4.5" fill="#bdb2ff" />
      </svg>
    </div>
  );
}

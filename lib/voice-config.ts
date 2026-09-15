// ─── Cozy Hall · voice config (LiveKit Cloud) ───────────────────────────────
// Client-safe: only the public WebSocket URL lives here. The API secret
// NEVER leaves the server — browsers get short-lived tokens from
// /api/livekit-token instead.

export const VOICE_ROOM = "cozy-hall";

export function voiceConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_LIVEKIT_URL;
}

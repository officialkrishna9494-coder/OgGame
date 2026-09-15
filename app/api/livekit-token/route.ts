// ─── Cozy Hall · voice token endpoint ───────────────────────────────────────
// Mints short-lived LiveKit access tokens (2h) for the single "cozy-hall"
// room. The API secret stays server-side — this route is the only place
// that ever touches it. Runs fine as a Vercel serverless function: minting
// happens once per join, the actual voice traffic goes peer → LiveKit Cloud.

import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { VOICE_ROOM } from "../../../lib/voice-config";

export async function POST(req: NextRequest) {
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!wsUrl || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "voice not configured on this server 🎙️" }, { status: 503 });
  }

  let body: { identity?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const identity = typeof body.identity === "string" ? body.identity.trim().slice(0, 64) : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 32) : "";
  if (!identity || !/^[a-zA-Z0-9_-]+$/.test(identity)) {
    return NextResponse.json({ error: "invalid identity" }, { status: 400 });
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: name || identity,
    ttl: "2h",
  });
  token.addGrant({ roomJoin: true, room: VOICE_ROOM, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await token.toJwt(), url: wsUrl });
}

// ─── Cozy Hall · YouTube helpers ────────────────────────────────────────────
// One URL per add: extract the FIRST video id, ignore playlists/extra params.
// Title via no-key oEmbed with graceful fallback.

export function extractYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
}

export async function fetchVideoTitle(videoId: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { signal: ctrl.signal }
    );
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: string };
    return json.title?.slice(0, 80) ?? null;
  } catch {
    return null;
  }
}

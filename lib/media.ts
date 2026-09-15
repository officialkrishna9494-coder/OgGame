// ─── Cozy Hall · media layer (Cloudinary unsigned uploads) ─────────────────
// Setup (one minute, in the Cloudinary dashboard):
//   Settings → Upload → Upload presets → Add → Signing mode: Unsigned.
// Then set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME + NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.
// Actual files live in Cloudinary; only URLs are stored in the room data.

export function cloudinaryConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  );
}

const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("that file isn't an image 🖼️");
  if (file.size > MAX_BYTES) throw new Error("keep it under 8 MB, please 🐭");
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", preset);
  form.append("folder", "cozy-hall");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("upload failed — check the preset is Unsigned 🌧️");
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("upload failed — no URL came back 🌧️");
  return json.secure_url;
}

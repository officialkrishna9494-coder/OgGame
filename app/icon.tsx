import { ImageResponse } from "next/og";
import { AppIconArt } from "../lib/app-icon";

// 192 + 512 are what Android needs to install the hall as a fullscreen app
export function generateImageMetadata() {
  return [192, 512].map((px) => ({
    id: String(px),
    contentType: "image/png",
    size: { width: px, height: px },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id) || 512;
  return new ImageResponse(<AppIconArt size={px} rounded />, { width: px, height: px });
}

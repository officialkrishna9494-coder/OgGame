import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cozy Hall — a soft place for friends",
  description:
    "A private multiplayer web hall for 5–10 friends. Wander, react, poke, high-five, sit, toss a ball, and watch the shared TV — all in one cozy room.",
  // "Add to Home Screen" launches without browser bars (manifest.ts for Android)
  appleWebApp: {
    capable: true,
    title: "Cozy Hall",
    statusBarStyle: "black-translucent",
  },
};

// Game viewport: edge-to-edge under notches (HUD offsets use the safe-area
// vars in globals.css) and no accidental page zoom — pinch zooms the camera.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f6efe6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#f6efe6]">{children}</body>
    </html>
  );
}

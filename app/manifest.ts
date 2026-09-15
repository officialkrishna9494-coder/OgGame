import type { MetadataRoute } from "next";

// Installed / "Add to Home Screen": the hall opens sideways with no browser
// bars — the real fix for URL bars on phones that can't use the Fullscreen API.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cozy Hall",
    short_name: "Cozy Hall",
    description: "A soft place for friends — a private multiplayer hall.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "landscape",
    background_color: "#f6efe6",
    theme_color: "#f6efe6",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

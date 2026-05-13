import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameDev Asset Library",
  description:
    "Search, preview, and download game-ready 3D models, pixel art, sound effects, music, licenses, and source metadata.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

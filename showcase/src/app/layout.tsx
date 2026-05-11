import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D Assets Showcase",
  description: "Local preview grid for the 3d-assets library — models, packs, animations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

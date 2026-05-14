import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "3D Asset World Viewer",
  description:
    "Open the full free 3D asset library in a browser world viewer and scan every model collection visually before downloading.",
  pathname: "/all",
});

export default function AllModelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

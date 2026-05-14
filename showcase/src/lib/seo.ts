import type { Metadata } from "next";

export const SITE_NAME = "GameDev Asset Library";
export const SITE_URL = "https://gamedev.trebeljahr.com";
export const SITE_DESCRIPTION =
  "Search, preview, and download game-ready 3D models, pixel art, sound effects, music, licenses, and source metadata.";

const DEFAULT_IMAGE = "/favicon.png";

type PageMetadataInput = {
  title: string;
  description: string;
  pathname: string;
};

export function canonicalPath(pathname: string): string {
  if (pathname === "/") return "/";
  return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
}

export function absoluteUrl(pathname: string): string {
  const path = canonicalPath(pathname);
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

export function routePath(...segments: string[]): string {
  if (segments.length === 0) return "/";
  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export function pageMetadata({
  title,
  description,
  pathname,
}: PageMetadataInput): Metadata {
  const path = canonicalPath(pathname);

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
      images: [
        {
          url: DEFAULT_IMAGE,
          width: 512,
          height: 512,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [DEFAULT_IMAGE],
    },
  };
}

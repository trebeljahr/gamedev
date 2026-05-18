import type { Metadata } from "next";

export const SITE_NAME = "GameDev Asset Library";
export const SITE_URL = "https://gamedev.trebeljahr.com";
export const SITE_DESCRIPTION =
  "Search free, hand-picked, high-quality game assets with permissive licenses — 3D models, pixel art, sound effects, music, and textures — all in one place.";

const DEFAULT_OG_IMAGE = "/opengraph-image";
const DEFAULT_TWITTER_IMAGE = "/twitter-image";

type PageMetadataInput = {
  title: string;
  description: string;
  pathname: string;
  imagePathname?: string;
  imageAlt?: string;
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

function routeImagePath(pathname: string, imageName: "opengraph-image" | "twitter-image"): string {
  const path = canonicalPath(pathname);
  return path === "/" ? `/${imageName}` : `${path}/${imageName}`;
}

export function pageMetadata({
  title,
  description,
  pathname,
  imagePathname,
  imageAlt = SITE_NAME,
}: PageMetadataInput): Metadata {
  const path = canonicalPath(pathname);
  const ogImage = imagePathname ? routeImagePath(imagePathname, "opengraph-image") : DEFAULT_OG_IMAGE;
  const twitterImage = imagePathname
    ? routeImagePath(imagePathname, "opengraph-image")
    : DEFAULT_TWITTER_IMAGE;

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
          url: ogImage,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [twitterImage],
    },
  };
}

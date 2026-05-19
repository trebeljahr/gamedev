import type { Metadata } from "next";
import { exactLicenseUrlFor, licenseForVendor } from "./license";
import {
  assetUrl as manifestAssetUrl,
  downloadsForModel,
  modelDownloadLabel,
  type Model,
  type ModelDownload,
  type Pack,
} from "./manifest";

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

type JsonLdPrimitive = string | number | boolean | null;
export type JsonLdValue = JsonLdPrimitive | JsonLdObject | JsonLdValue[];
export type JsonLdObject = { [key: string]: JsonLdValue };

type AssetJsonLdInput = {
  pack: Pack;
  model: Model;
  pathname: string;
};

type SoundJsonLdInput = {
  name: string;
  creator: string;
  contentUrl: string;
  durationSeconds: number;
  license: string;
  pathname: string;
  source?: string;
  sourceUrl?: string;
  creatorUrl?: string;
  licenseUrl?: string;
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

function structuredDataUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return SITE_URL;
  try {
    return new URL(trimmed, SITE_URL).toString();
  } catch {
    return absoluteUrl(trimmed);
  }
}

function withJsonLdContext(node: JsonLdObject): JsonLdObject {
  return { "@context": "https://schema.org", ...node };
}

function withoutJsonLdContext(node: JsonLdObject): JsonLdObject {
  const jsonLdNode: JsonLdObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key !== "@context") jsonLdNode[key] = value;
  }
  return jsonLdNode;
}

function creatorJsonLd(name: string, url?: string): JsonLdObject {
  const creator: JsonLdObject = {
    "@type": "Organization",
    name: name.trim() || SITE_NAME,
  };
  if (url) creator.url = structuredDataUrl(url);
  return creator;
}

function licenseJsonLdUrl({
  license,
  source,
  fallbackUrl,
  pathname,
}: {
  license: string;
  source?: string;
  fallbackUrl?: string;
  pathname: string;
}): string {
  return structuredDataUrl(
    exactLicenseUrlFor(license, {
      source,
      fallbackUrl,
    }) ??
      fallbackUrl ??
      pathname,
  );
}

function modelDownloadUrl(download: ModelDownload): string {
  return structuredDataUrl(manifestAssetUrl(download.file));
}

function modelEncodingFormat(download: ModelDownload): string {
  const format = download.format.toLowerCase();
  if (format === "glb") return "model/gltf-binary";
  if (format === "gltf") return "model/gltf+json";
  if (format === "obj") return "model/obj";
  if (format === "zip") return "application/zip";
  if (format === "blend") return "application/x-blender";
  return "application/octet-stream";
}

function iso8601Duration(seconds: number): string {
  const totalSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
  const remainingSeconds = totalSeconds - hours * 3600 - minutes * 60;
  const secondText = Number.isInteger(remainingSeconds)
    ? remainingSeconds.toString()
    : remainingSeconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

  let duration = "PT";
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (remainingSeconds > 0 || duration === "PT") duration += `${secondText}S`;
  return duration;
}

export function jsonLdGraph(nodes: JsonLdObject[]): JsonLdObject {
  if (nodes.length === 1) return nodes[0];
  return withJsonLdContext({
    "@graph": nodes.map(withoutJsonLdContext),
  });
}

export function jsonLdScriptContent(jsonLd: JsonLdValue): string {
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c");
}

export function assetJsonLd(asset: AssetJsonLdInput): JsonLdObject {
  const { model, pack, pathname } = asset;
  const creator = licenseForVendor(pack.vendor);
  const downloads = downloadsForModel(model);
  const primaryDownload = downloads[0];

  return withJsonLdContext({
    "@type": "3DModel",
    name: model.title,
    creator: creatorJsonLd(creator.vendorLabel, creator.vendorUrl),
    license: licenseJsonLdUrl({
      license: pack.license,
      source: pack.source,
      fallbackUrl: creator.licenseUrl,
      pathname,
    }),
    contentUrl: primaryDownload ? modelDownloadUrl(primaryDownload) : structuredDataUrl(manifestAssetUrl(model.file)),
    encoding: downloads.map((download) => ({
      "@type": "DataDownload",
      name: modelDownloadLabel(download),
      encodingFormat: modelEncodingFormat(download),
      contentUrl: modelDownloadUrl(download),
    })),
  });
}

export function soundJsonLd(asset: SoundJsonLdInput): JsonLdObject {
  return withJsonLdContext({
    "@type": "AudioObject",
    name: asset.name,
    creator: creatorJsonLd(asset.creator, asset.creatorUrl),
    license: licenseJsonLdUrl({
      license: asset.license,
      source: asset.source,
      fallbackUrl: asset.licenseUrl ?? asset.sourceUrl,
      pathname: asset.pathname,
    }),
    contentUrl: structuredDataUrl(asset.contentUrl),
    duration: iso8601Duration(asset.durationSeconds),
  });
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

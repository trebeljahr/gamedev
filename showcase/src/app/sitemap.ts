import type { MetadataRoute } from "next";
import { manifest } from "@/lib/manifest";
import { absoluteUrl, routePath } from "@/lib/seo";

const staticRoutes = [
  { pathname: "/", priority: 1 },
  { pathname: "/models", priority: 0.9 },
  { pathname: "/media", priority: 0.85 },
  { pathname: "/all", priority: 0.7 },
  { pathname: "/landing-page", priority: 0.75 },
];

function sitemapEntry(pathname: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(pathname),
    priority,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const vendorRoutes = Array.from(new Set(manifest.packs.map((pack) => pack.vendor)))
    .sort((a, b) => a.localeCompare(b))
    .map((vendor) => sitemapEntry(routePath(vendor), 0.8));

  const packRoutes = [...manifest.packs]
    .sort((a, b) => routePath(a.vendor, a.pack).localeCompare(routePath(b.vendor, b.pack)))
    .map((pack) => sitemapEntry(routePath(pack.vendor, pack.pack), 0.65));

  return [
    ...staticRoutes.map((route) => sitemapEntry(route.pathname, route.priority)),
    ...vendorRoutes,
    ...packRoutes,
  ];
}

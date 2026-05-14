import type { MetadataRoute } from "next";
import { manifest } from "@/lib/manifest";
import { absoluteUrl, routePath } from "@/lib/seo";

const staticRoutes = [
  { pathname: "/", priority: 1, changeFrequency: "weekly" },
  { pathname: "/models", priority: 0.92, changeFrequency: "weekly" },
  { pathname: "/media", priority: 0.88, changeFrequency: "weekly" },
  { pathname: "/landing-page", priority: 0.78, changeFrequency: "monthly" },
  { pathname: "/all", priority: 0.68, changeFrequency: "monthly" },
] as const satisfies Array<{
  pathname: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}>;

function sitemapEntry(
  pathname: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  lastModified: Date,
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(pathname),
    lastModified,
    changeFrequency,
    priority,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const vendorRoutes = Array.from(new Set(manifest.packs.map((pack) => pack.vendor)))
    .sort((a, b) => a.localeCompare(b))
    .map((vendor) => sitemapEntry(routePath(vendor), 0.82, "weekly", lastModified));

  const packRoutes = [...manifest.packs]
    .sort((a, b) => routePath(a.vendor, a.pack).localeCompare(routePath(b.vendor, b.pack)))
    .map((pack) => sitemapEntry(routePath(pack.vendor, pack.pack), 0.66, "monthly", lastModified));

  return [
    ...staticRoutes.map((route) =>
      sitemapEntry(route.pathname, route.priority, route.changeFrequency, lastModified),
    ),
    ...vendorRoutes,
    ...packRoutes,
  ];
}

import type { MetadataRoute } from "next";
import { formatPageCount, formatPagePath } from "@/components/FormatCatalogPage";
import { artPackHref } from "@/lib/art-routing";
import { getCreatorSlugs } from "@/lib/creator-pages";
import { manifest } from "@/lib/manifest";
import { artPackSummaries, mediaPackHref, mediaPacks } from "@/lib/media";
import { MODEL_FORMATS } from "@/lib/model-formats";
import { modelHref, modelRouteRefsForPack } from "@/lib/model-routes";
import { absoluteUrl, routePath } from "@/lib/seo";

export const dynamic = "force-static";

const staticRoutes = [
  { pathname: "/", priority: 1, changeFrequency: "weekly" },
  { pathname: "/models", priority: 0.92, changeFrequency: "weekly" },
  { pathname: "/media", priority: 0.88, changeFrequency: "weekly" },
  { pathname: "/creators", priority: 0.7, changeFrequency: "monthly" },
  { pathname: "/curation", priority: 0.7, changeFrequency: "monthly" },
  { pathname: "/all", priority: 0.68, changeFrequency: "monthly" },
  { pathname: "/sounds/editor", priority: 0.7, changeFrequency: "monthly" },
  { pathname: "/support", priority: 0.3, changeFrequency: "monthly" },
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
  const creatorRoutes = getCreatorSlugs()
    .sort((a, b) => a.localeCompare(b))
    .map((slug) => sitemapEntry(`/creators/${slug}`, 0.72, "weekly", lastModified));

  // Use the same license-filtered catalogs and route helpers as the pages'
  // generateStaticParams, including stable slugs for duplicate model names.
  const modelRoutes = manifest.packs.flatMap((pack) =>
    modelRouteRefsForPack(pack).map((ref) =>
      sitemapEntry(modelHref(pack, ref), 0.5, "monthly", lastModified),
    ),
  );
  const artRoutes = artPackSummaries.map((pack) =>
    sitemapEntry(artPackHref(pack.folder), 0.6, "monthly", lastModified),
  );
  const audioRoutes = mediaPacks.map((pack) =>
    sitemapEntry(mediaPackHref(pack.kind, pack.id), 0.6, "monthly", lastModified),
  );

  const formatRoutes = MODEL_FORMATS.flatMap((format) =>
    Array.from({ length: formatPageCount(format) }, (_, index) =>
      sitemapEntry(formatPagePath(format, index + 1), index === 0 ? 0.78 : 0.5, "weekly", lastModified),
    ),
  );

  return [
    ...staticRoutes.map((route) =>
      sitemapEntry(route.pathname, route.priority, route.changeFrequency, lastModified),
    ),
    ...formatRoutes,
    ...vendorRoutes,
    ...creatorRoutes,
    ...packRoutes,
    ...modelRoutes,
    ...artRoutes,
    ...audioRoutes,
  ];
}

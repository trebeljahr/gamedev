/**
 * Routing helpers for the 2D art catalog.
 *
 * A pack folder like `2D/kenney/tappy-plane` maps to the URL slug
 * `2D__kenney__tappy-plane` — the same `/`→`__` substitution used for the
 * per-pack JSON filenames (`packFileSlug` in build-media-catalog.ts). No art
 * folder contains a literal `__`, so the reverse is unambiguous.
 */
export function artPackSlug(folder: string): string {
  return folder.replace(/\//g, "__");
}

export function folderFromArtPackSlug(slug: string): string {
  return slug.replace(/__/g, "/");
}

export function artPackHref(folder: string): string {
  return `/media/2d/${artPackSlug(folder)}`;
}

export function artItemHref(folder: string, itemId: string): string {
  return `/media/2d/${artPackSlug(folder)}/${itemId}`;
}

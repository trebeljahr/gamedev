// ricos.site/donate sends donors back with `?supported=1`. The timestamp is
// kept for a future inline ask's 90-day quiet period; nothing reads it yet.
export const DONATION_SUPPORTED_AT_KEY = "donation-supported-at";

const SUPPORTED_PARAM = "supported=1";

/**
 * Returns the path + query + hash of `href` without `supported=1`, or null
 * when the param is absent. Other params keep their original encoding.
 */
export function stripSupportedParam(href: string): string | null {
  const url = new URL(href);
  const params = url.search.slice(1).split("&").filter(Boolean);
  if (!params.includes(SUPPORTED_PARAM)) return null;
  const kept = params.filter((param) => param !== SUPPORTED_PARAM);
  const search = kept.length > 0 ? `?${kept.join("&")}` : "";
  return `${url.pathname}${search}${url.hash}`;
}

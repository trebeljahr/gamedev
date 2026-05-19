export type AudioExportAnalyticsFormat = "mp3" | "wav";

export type SearchNoResultsType =
  | "3d_packs"
  | "models"
  | "pack_models"
  | "sounds"
  | "2d"
  | "sources";

export type AnalyticsEventProps = {
  asset_download: { format: string };
  bundle_view: undefined;
  bundle_purchase: undefined;
  mcp_doc_view: undefined;
  build_with_ai_view: undefined;
  audio_export: { format: AudioExportAnalyticsFormat };
  search_no_results: { query: string; type: SearchNoResultsType };
};

export type AnalyticsEventName = keyof AnalyticsEventProps;
export type AnalyticsBeaconEventName = {
  [EventName in AnalyticsEventName]: AnalyticsEventProps[EventName] extends undefined ? EventName : never;
}[AnalyticsEventName];

type PlausibleProps = Record<string, string | number | boolean>;
type PlausibleOptions = {
  props?: PlausibleProps;
};
type PlausibleFunction = (eventName: string, options?: PlausibleOptions) => void;

declare global {
  interface Window {
    plausible?: PlausibleFunction & { q?: unknown[] };
  }
}

function cleanFormat(format: string): string {
  const value = format.trim().toLowerCase();
  return value || "unknown";
}

function cleanQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, 160);
}

export function trackAnalyticsEvent<EventName extends AnalyticsEventName>(
  eventName: EventName,
  ...[props]: AnalyticsEventProps[EventName] extends undefined
    ? [props?: undefined]
    : [props: AnalyticsEventProps[EventName]]
): void {
  if (typeof window === "undefined" || typeof window.plausible !== "function") return;
  if (props) {
    window.plausible(eventName, { props: props as PlausibleProps });
    return;
  }
  window.plausible(eventName);
}

export function trackAssetDownload(props: AnalyticsEventProps["asset_download"]): void {
  trackAnalyticsEvent("asset_download", { format: cleanFormat(props.format) });
}

export function trackBundleView(): void {
  trackAnalyticsEvent("bundle_view");
}

export function trackBundlePurchase(): void {
  trackAnalyticsEvent("bundle_purchase");
}

export function trackMcpDocView(): void {
  trackAnalyticsEvent("mcp_doc_view");
}

export function trackBuildWithAiView(): void {
  trackAnalyticsEvent("build_with_ai_view");
}

export function trackAudioExport(props: AnalyticsEventProps["audio_export"]): void {
  trackAnalyticsEvent("audio_export", props);
}

export function trackSearchNoResults(props: AnalyticsEventProps["search_no_results"]): void {
  const query = cleanQuery(props.query);
  if (!query) return;
  trackAnalyticsEvent("search_no_results", { query, type: props.type });
}

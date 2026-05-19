"use client";

import { useEffect } from "react";
import {
  type AnalyticsBeaconEventName,
  trackAnalyticsEvent,
  trackBuildWithAiView,
  trackBundleView,
  trackMcpDocView,
} from "@/lib/analytics";

type AnalyticsBeaconProps = {
  event: AnalyticsBeaconEventName;
};

export function AnalyticsBeacon({ event }: AnalyticsBeaconProps) {
  useEffect(() => {
    if (event === "build_with_ai_view") {
      trackBuildWithAiView();
      return;
    }
    if (event === "mcp_doc_view") {
      trackMcpDocView();
      return;
    }
    if (event === "bundle_view") {
      trackBundleView();
      return;
    }
    trackAnalyticsEvent(event);
  }, [event]);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { Pack } from "@/lib/manifest";
import { downloadPackZip } from "@/lib/download-pack-zip";
import type { PackZipProgress } from "@/lib/pack-zip";
import { trackAssetDownload } from "@/lib/analytics";

type DownloadState =
  | { status: "idle" }
  | ({ status: "working" } & PackZipProgress)
  | { status: "done"; skipped: number }
  | { status: "error"; message: string };

function formatButtonLabel(state: DownloadState): string {
  if (state.status === "working") {
    const total = Math.max(1, state.total);
    return `Zipping ${state.completed}/${total}`;
  }
  if (state.status === "done") return state.skipped > 0 ? `Downloaded, ${state.skipped} skipped` : "Downloaded zip";
  if (state.status === "error") return "Retry download";
  return "Download pack .zip";
}

function statusText(state: DownloadState): string | null {
  if (state.status === "working") {
    const name = state.current?.split("/").pop();
    return name ? `Adding ${name}` : "Preparing zip";
  }
  if (state.status === "error") return state.message;
  return null;
}

export function PackDownloadButton({ pack }: { pack: Pack }) {
  const [state, setState] = useState<DownloadState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const busy = state.status === "working";

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  async function onDownload() {
    if (busy) return;
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({
      status: "working",
      completed: 0,
      total: pack.models.length,
      bytes: 0,
      skipped: 0,
    });

    try {
      const result = await downloadPackZip(pack, {
        signal: controller.signal,
        onProgress: (progress) => setState({ status: "working", ...progress }),
      });
      trackAssetDownload({ format: "zip" });
      setState({ status: "done", skipped: result.skipped.length });
      resetTimerRef.current = window.setTimeout(() => {
        setState({ status: "idle" });
        resetTimerRef.current = null;
      }, 3_500);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Download failed",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <span className="pack-download-control">
      <button type="button" className="pack-download-button" onClick={onDownload} disabled={busy} aria-busy={busy}>
        {formatButtonLabel(state)}
      </button>
      {statusText(state) && (
        <span className="pack-download-status" aria-live="polite">
          {statusText(state)}
        </span>
      )}
    </span>
  );
}

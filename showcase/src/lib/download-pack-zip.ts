"use client";

import type { Pack } from "@/lib/manifest";
import {
  packZipApiHref,
  packZipFilename,
  packZipFiles,
  type PackZipProgress,
  type PackZipWorkerMessage,
} from "@/lib/pack-zip";

export type PackZipDownloadResult = {
  filename: string;
  bytes: number;
  skipped: string[];
  source: "worker" | "server-fallback";
};

type DownloadPackZipOptions = {
  fallbackToServer?: boolean;
  onProgress?: (progress: PackZipProgress) => void;
  signal?: AbortSignal;
};

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function fallbackToServer(pack: Pack): PackZipDownloadResult {
  const filename = packZipFilename(pack);
  triggerDownload(packZipApiHref(pack), filename);
  return { filename, bytes: 0, skipped: [], source: "server-fallback" };
}

function abortError(): Error {
  return new DOMException("Pack download aborted.", "AbortError");
}

function chunkBlobPart(chunk: Uint8Array): BlobPart {
  if (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength) {
    return chunk.buffer as ArrayBuffer;
  }
  return chunk.slice().buffer as ArrayBuffer;
}

export async function downloadPackZip(
  pack: Pack,
  {
    fallbackToServer: allowServerFallback = true,
    onProgress,
    signal,
  }: DownloadPackZipOptions = {},
): Promise<PackZipDownloadResult> {
  if (signal?.aborted) throw abortError();
  if (typeof Worker === "undefined") {
    if (allowServerFallback) return fallbackToServer(pack);
    throw new Error("This browser cannot create zip workers.");
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("../workers/packZipWorker.ts", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    if (allowServerFallback) return fallbackToServer(pack);
    throw error;
  }

  const filename = packZipFilename(pack);
  const files = packZipFiles(pack);
  const chunks: BlobPart[] = [];
  let objectUrl: string | undefined;

  return new Promise<PackZipDownloadResult>((resolve, reject) => {
    let settled = false;

    function cleanup() {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
      if (objectUrl) {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 30_000);
      }
    }

    function settleReject(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }

    function onAbort() {
      settleReject(abortError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onerror = (event) => {
      if (allowServerFallback) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(fallbackToServer(pack));
        return;
      }
      settleReject(new Error(event.message || "Pack zip worker failed."));
    };

    worker.onmessage = (event: MessageEvent<PackZipWorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.({
          completed: message.completed,
          total: message.total,
          current: message.current,
          bytes: message.bytes,
          skipped: message.skipped,
        });
        return;
      }
      if (message.type === "chunk") {
        chunks.push(chunkBlobPart(message.chunk));
        return;
      }
      if (message.type === "error") {
        if (allowServerFallback) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(fallbackToServer(pack));
          return;
        }
        settleReject(new Error(message.message));
        return;
      }
      if (message.type === "done") {
        if (settled) return;
        settled = true;
        const blob = new Blob(chunks, { type: "application/zip" });
        objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, message.filename);
        cleanup();
        resolve({
          filename: message.filename,
          bytes: message.bytes,
          skipped: message.skipped,
          source: "worker",
        });
      }
    };

    worker.postMessage({ type: "start", filename, files });
  });
}

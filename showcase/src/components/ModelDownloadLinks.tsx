"use client";

import type { MouseEvent } from "react";
import {
  downloadsForModel,
  modelDownloadFilename,
  modelDownloadLabel,
  type Model,
  type ModelDownload,
} from "@/lib/manifest";
import { trackAssetDownload } from "@/lib/analytics";
import {
  loadPackDownloadMap,
  modelDownloadHref,
  packKeyForFile,
  usePackDownloadMap,
} from "@/lib/model-downloads";

type ModelDownloadLinksProps = {
  model: Model;
  className?: string;
  compact?: boolean;
};

function primaryDownloadFor(downloads: ModelDownload[]): ModelDownload | undefined {
  return (
    downloads.find((download) => download.optimized && download.format === "glb") ??
    downloads.find((download) => download.optimized) ??
    downloads[0]
  );
}

function primaryDownloadLabel(download: ModelDownload): string {
  if (download.optimized && download.format === "glb") return "Download .glb";
  return `Download ${modelDownloadLabel(download)}`;
}

export function ModelDownloadLinks({ model, className, compact = false }: ModelDownloadLinksProps) {
  const downloads = downloadsForModel(model);
  const map = usePackDownloadMap(model.file);

  function startDownload(event: MouseEvent<HTMLAnchorElement>, download: ModelDownload) {
    trackAssetDownload({ format: download.format });
    const packKey = packKeyForFile(download.file);
    if (map !== undefined || !packKey) return;
    // Clicked before the pack's map arrived: wait for it rather than handing
    // out the mutable source file.
    event.preventDefault();
    void loadPackDownloadMap(packKey).then((loadedMap) => {
      window.location.assign(modelDownloadHref(download.file, loadedMap));
    });
  }

  const primaryDownload = primaryDownloadFor(downloads);
  const sourceDownloads = primaryDownload
    ? downloads.filter((download) => download.file !== primaryDownload.file)
    : [];
  const classes = [
    "model-download-links",
    sourceDownloads.length > 0 ? "has-menu" : "",
    compact ? "compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!primaryDownload) return null;

  const primaryFilename = modelDownloadFilename(model, primaryDownload);

  return (
    <div className={classes} aria-label={`Download ${model.title}`}>
      <a
        className="model-download-primary"
        href={modelDownloadHref(primaryDownload.file, map)}
        download={primaryFilename}
        title={primaryDownload.file}
        onClick={(event) => startDownload(event, primaryDownload)}
      >
        {primaryDownloadLabel(primaryDownload)}
      </a>
      {sourceDownloads.length > 0 && (
        <details className="model-download-menu">
          <summary aria-label={`Show source downloads for ${model.title}`} title="Source formats" />
          <div className="model-download-menu-list">
            <span>Source formats</span>
            {sourceDownloads.map((download) => {
              const filename = modelDownloadFilename(model, download);
              const label = modelDownloadLabel(download);
              return (
                <a
                  key={`${download.format}:${download.file}`}
                  href={modelDownloadHref(download.file, map)}
                  download={filename}
                  title={download.file}
                  onClick={(event) => startDownload(event, download)}
                >
                  {label}
                </a>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

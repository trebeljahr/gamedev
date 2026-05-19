import {
  downloadProxyUrl,
  downloadsForModel,
  modelDownloadFilename,
  modelDownloadLabel,
  type Model,
  type ModelDownload,
} from "@/lib/manifest";
import { trackAssetDownload } from "@/lib/analytics";

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
        href={downloadProxyUrl(primaryDownload.file, primaryFilename)}
        download={primaryFilename}
        title={primaryDownload.file}
        onClick={() => trackAssetDownload({ format: primaryDownload.format })}
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
                  href={downloadProxyUrl(download.file, filename)}
                  download={filename}
                  title={download.file}
                  onClick={() => trackAssetDownload({ format: download.format })}
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

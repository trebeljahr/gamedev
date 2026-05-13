import {
  downloadProxyUrl,
  downloadsForModel,
  modelDownloadFilename,
  modelDownloadLabel,
  type Model,
} from "@/lib/manifest";

type ModelDownloadLinksProps = {
  model: Model;
  className?: string;
  compact?: boolean;
};

export function ModelDownloadLinks({ model, className, compact = false }: ModelDownloadLinksProps) {
  const downloads = downloadsForModel(model);
  const classes = ["model-download-links", compact ? "compact" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-label={`Download ${model.title}`}>
      {downloads.map((download) => {
        const filename = modelDownloadFilename(model, download);
        const label = download.label ?? modelDownloadLabel(download);
        return (
          <a
            key={`${download.format}:${download.file}`}
            href={downloadProxyUrl(download.file, filename)}
            download={filename}
            title={download.file}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

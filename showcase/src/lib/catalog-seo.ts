import type { CreatorPageData } from "./creator-pages";
import { licenseForVendor } from "./license";
import { displayPackTitle, type Model, type Pack } from "./manifest";
import { SITE_NAME } from "./seo";

export function modelPageCopy(pack: Pack, model: Model) {
  const credit = licenseForVendor(pack.vendor);
  const creator = pack.source || credit.vendorLabel;
  const license = pack.license || credit.license;
  const packTitle = displayPackTitle(pack);
  const origin = packTitle.endsWith(` by ${creator}`) ? packTitle : `${packTitle} by ${creator}`;
  const context = `${model.title}, a 3D model from ${origin}.`;
  const brandedTitle = `${model.title} 3D Model by ${creator} | ${SITE_NAME}`;
  const details = [
    `View the 3D preview, downloads, file formats, and ${license} license details.`,
    `View the 3D preview, downloads, and ${license} license details.`,
    `View available downloads and ${license} license details.`,
  ];

  return {
    // Keep every model-name word, including variant labels and dimensions.
    // Drop the site-name suffix when it crowds the asset name and creator.
    title: brandedTitle.length <= 70 ? brandedTitle : `${model.title} 3D Model | ${creator}`,
    description: `${context} ${details.find((detail) => context.length + detail.length + 1 <= 160) ?? details.at(-1)}`,
  };
}

export function creatorPageDescription(data: CreatorPageData): string {
  const { counts } = data;
  const kinds = [
    counts.models > 0 ? "3D models" : "",
    counts.art > 0 ? "2D art" : "",
    counts.audio > 0 ? "audio" : "",
    counts.source > 0 ? "source references" : "",
  ].filter(Boolean);
  const scope = kinds.length > 1
    ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}`
    : kinds[0];
  const total = data.assets.length;
  return `Browse ${total.toLocaleString("en-US")} ${total === 1 ? "asset" : "assets"} credited to ${data.metadata.name}. Find ${scope} with source links and license details. Review the original terms.`;
}

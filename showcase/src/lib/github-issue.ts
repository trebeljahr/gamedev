const GITHUB_ISSUES_NEW_URL = "https://github.com/trebeljahr/gamedev/issues/new";

const ASSET_BROKEN_LABEL = "asset-broken";
const PACK_SUGGESTION_LABEL = "pack-suggestion";

type IssueParams = {
  title: string;
  body: string;
  labels: string;
};

export type BrokenAssetIssueInput = {
  id: string;
  name: string;
  kind: "model" | "sound" | "sprite" | "music";
  license: string;
  sourceUrl?: string | null;
  catalogPath?: string | null;
};

function issueUrl({ title, body, labels }: IssueParams): string {
  return `${GITHUB_ISSUES_NEW_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent(labels)}`;
}

export function brokenAssetIssueUrl(input: BrokenAssetIssueInput): string {
  const title = `Broken asset: ${input.name}`;
  const lines = [
    `**Asset:** ${input.name}`,
    `**Asset ID:** \`${input.id}\``,
    `**Type:** ${input.kind}`,
    `**License:** ${input.license}`,
    `**Source URL:** ${input.sourceUrl || "Not listed"}`,
  ];

  if (input.catalogPath) lines.push(`**Catalog path:** ${input.catalogPath}`);

  lines.push("", "**What is broken?**", "", "<!-- describe the broken preview, download, license link, or source link -->");

  return issueUrl({
    title,
    body: lines.join("\n"),
    labels: ASSET_BROKEN_LABEL,
  });
}

export function suggestPackIssueUrl(): string {
  return issueUrl({
    title: "Suggest a pack: ",
    body: [
      "**Pack name:**",
      "**Source URL:**",
      "**License:**",
      "**Asset type:** 3D models / sprites / UI / textures / sound effects / music",
      "",
      "**Why it belongs in the catalog:**",
      "",
      "<!-- include anything useful about quality, formats, license clarity, or creator attribution -->",
    ].join("\n"),
    labels: PACK_SUGGESTION_LABEL,
  });
}

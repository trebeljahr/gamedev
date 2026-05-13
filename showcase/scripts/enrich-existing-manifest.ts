import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildModelMetadata,
  buildPackMetadata,
  type AssetSize,
} from "../src/lib/catalog-metadata";

type ExistingModel = {
  name: string;
  file: string;
  label?: string;
  size?: AssetSize;
  minY: number;
  cxz: [number, number];
};

type ExistingPack = {
  id: string;
  vendor: string;
  pack: string;
  label?: string;
  count: number;
  models: ExistingModel[];
};

type ExistingManifest = {
  packs: ExistingPack[];
};

const manifestPath = join(__dirname, "..", "src", "lib", "manifest.json");

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ExistingManifest;

  const packs = manifest.packs.map((pack) => {
    const models = pack.models.map((model) => {
      const metadata = buildModelMetadata({
        vendor: pack.vendor,
        pack: pack.pack,
        name: model.name,
        file: model.file,
        size: model.size,
      });
      return {
        ...model,
        label: metadata.title,
        ...metadata,
      };
    });

    const metadata = buildPackMetadata({
      vendor: pack.vendor,
      pack: pack.pack,
      count: models.length,
      models,
    });

    return {
      ...pack,
      label: metadata.title,
      ...metadata,
      count: models.length,
      models,
    };
  });

  await writeFile(manifestPath, `${JSON.stringify({ packs }, null, 2)}\n`);

  console.log(
    `[manifest] enriched ${packs.length} packs · ${packs.reduce((total, pack) => total + pack.count, 0).toLocaleString("en-US")} models`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

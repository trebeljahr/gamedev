import { constants, createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { Zip, ZipPassThrough } from "fflate";
import { downloadsForModel, modelDownloadFilename, type Manifest } from "../src/lib/manifest";
import { canRedistributeRawAssets } from "../src/lib/license-policy";
import { packZipEntryName, packZipFilename } from "../src/lib/pack-zip";
import type { DownloadArtifact, DownloadCatalog } from "../src/lib/durable-download";

type Options = { manifestPath: string; assetsRoot: string; outputRoot: string; catalogPath: string };

async function checksum(path: string) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest("hex"), bytes };
}

function safeFilename(filename: string) {
  if (!/^[a-z0-9._-]+$/i.test(filename)) throw new Error("Unsafe artifact filename.");
  return filename;
}

export async function buildDownloadCatalog(options: Options): Promise<DownloadCatalog> {
  const assets = await realpath(options.assetsRoot);
  const output = resolve(options.outputRoot);
  if (!isAbsolute(options.outputRoot) || output === assets || output.startsWith(assets + sep)) {
    throw new Error("Artifact output must be separate from the original assets.");
  }
  await mkdir(output, { recursive: true });
  const raw = await readFile(options.manifestPath);
  const manifest = JSON.parse(raw.toString()) as Manifest;
  const catalog: DownloadCatalog = {
    schema: 1, manifestSha256: createHash("sha256").update(raw).digest("hex"), models: {}, packs: {},
  };
  const copied = new Map<string, { artifact: DownloadArtifact; disk: string }>();
  async function source(file: string) {
    if (!/^\/(glb|raw)\//.test(file)) throw new Error("Unsupported catalog asset path.");
    const disk = await realpath(join(assets, decodeURIComponent(file).replace(/^\/+/, "")));
    if (!disk.startsWith(assets + sep) || !(await stat(disk)).isFile()) throw new Error("Asset escaped its root.");
    return disk;
  }
  async function publish(temp: string, filename: string) {
    safeFilename(filename);
    const { sha256, bytes } = await checksum(temp);
    if (!bytes) throw new Error("Empty download artifact.");
    const disk = join(output, sha256, filename);
    await mkdir(dirname(disk), { recursive: true });
    try {
      const existing = await checksum(disk);
      if (existing.sha256 !== sha256 || existing.bytes !== bytes) throw new Error("Immutable artifact conflict.");
      await rm(temp);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await rename(temp, disk);
    }
    return { artifact: { path: `/downloads/v1/${sha256}/${encodeURIComponent(filename)}`, sha256, bytes, filename }, disk };
  }
  async function modelArtifact(file: string, filename: string) {
    const key = `${file}\0${filename}`;
    const known = copied.get(key);
    if (known) return known.artifact;
    const temp = join(output, `.staging-${randomUUID()}`);
    try {
      // A private snapshot avoids source edits changing an object after hashing.
      await copyFile(await source(file), temp, constants.COPYFILE_FICLONE);
      const result = await publish(temp, filename);
      copied.set(key, result);
      return result.artifact;
    } finally { await rm(temp, { force: true }); }
  }
  for (const pack of manifest.packs) {
    if (!canRedistributeRawAssets(pack.license)) continue;
    for (const model of pack.models) {
      const downloads = downloadsForModel(model);
      if (!downloads.some((d) => d.file === model.file)) {
        downloads.push({ file: model.file, format: model.file.split(".").pop() ?? "glb", optimized: true });
      }
      for (const download of downloads) {
        const filename = modelDownloadFilename(model, download);
        const list = catalog.models[download.file] ??= [];
        if (!list.some((entry) => entry.filename === filename)) list.push(await modelArtifact(download.file, filename));
      }
    }
    const temp = join(output, `.staging-${randomUUID()}`);
    const writer = createWriteStream(temp, { flags: "wx", mode: 0o600 });
    const complete = finished(writer);
    // Observe errors immediately even if an input read fails before awaiting completion.
    complete.catch(() => {});
    let writable = true;
    let zipError: Error | undefined;
    const zip = new Zip((error, data, final) => {
      if (error) { zipError = error; writer.destroy(error); return; }
      if (data.length) writable = writer.write(data) && writable;
      if (final) writer.end();
    });
    const entries = new Set<string>();
    try {
      for (const model of pack.models) {
        const name = packZipEntryName(model.file, pack.vendor, pack.pack);
        if (name.includes("\\") || name.split("/").some((part) => ["", ".", ".."].includes(part)) || entries.has(name)) {
          throw new Error("Unsafe or duplicate ZIP entry.");
        }
        entries.add(name);
        const artifact = catalog.models[model.file]?.[0];
        if (!artifact) throw new Error("Missing model snapshot for ZIP.");
        const entry = new ZipPassThrough(name);
        // DOS timestamp is fixed in local time, making archives reproducible across hosts.
        entry.mtime = new Date(1980, 0, 1, 0, 0, 0);
        zip.add(entry);
        for await (const bytes of createReadStream(join(output, artifact.sha256, artifact.filename))) {
          entry.push(bytes, false);
          if (zipError) throw zipError;
          if (!writable) { await once(writer, "drain"); writable = true; }
        }
        entry.push(new Uint8Array(), true);
      }
      zip.end();
      await complete;
      if (zipError) throw zipError;
      catalog.packs[`${pack.vendor}/${pack.pack}`] = (await publish(temp, packZipFilename(pack))).artifact;
    } catch (error) {
      writer.destroy();
      await complete.catch(() => {});
      throw error;
    } finally { await rm(temp, { force: true }); }
  }
  await writeFile(options.catalogPath, JSON.stringify(catalog) + "\n");
  return catalog;
}

async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
  const assetsRoot = args.get("--assets-root");
  const outputRoot = args.get("--output-root");
  if (!assetsRoot || !outputRoot) throw new Error("Required: --assets-root <path> --output-root <path>.");
  const catalog = await buildDownloadCatalog({ assetsRoot, outputRoot,
    manifestPath: args.get("--manifest") ?? resolve("public/manifest.json"),
    catalogPath: args.get("--catalog") ?? resolve("public/downloads.json"),
  });
  console.log(JSON.stringify({ packs: Object.keys(catalog.packs).length, models: Object.keys(catalog.models).length, manifestSha256: catalog.manifestSha256 }));
}

if (basename(process.argv[1] ?? "") === "build-download-artifacts.ts") {
  main().catch(() => { console.error("Download artifact build failed; check source files and output paths."); process.exitCode = 1; });
}

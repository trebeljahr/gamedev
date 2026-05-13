import { Zip, ZipPassThrough } from "fflate";
import type { PackZipFile, PackZipWorkerMessage, PackZipWorkerRequest } from "@/lib/pack-zip";

type PackZipWorkerScope = {
  onmessage: ((event: MessageEvent<PackZipWorkerRequest>) => void) | null;
  postMessage(message: PackZipWorkerMessage, transfer?: Transferable[]): void;
};

const workerScope = self as unknown as PackZipWorkerScope;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function post(message: PackZipWorkerMessage, transfer?: Transferable[]) {
  workerScope.postMessage(message, transfer ?? []);
}

function transferableChunk(data: Uint8Array): Uint8Array {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) return data;
  return data.slice();
}

async function addFileToZip(file: PackZipFile, zip: Zip): Promise<number> {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());

  const entry = new ZipPassThrough(file.entryName);
  zip.add(entry);

  if (!response.body) {
    const data = new Uint8Array(await response.arrayBuffer());
    entry.push(data, true);
    return data.byteLength;
  }

  let bytes = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    entry.push(value, false);
  }
  entry.push(new Uint8Array(0), true);
  return bytes;
}

async function zipPack(request: PackZipWorkerRequest) {
  const skipped: string[] = [];
  let completed = 0;
  let bytes = 0;
  let added = 0;

  const zip = new Zip();
  const zipDone = new Promise<void>((resolve, reject) => {
    zip.ondata = (error, data, final) => {
      if (error) {
        reject(error);
        return;
      }
      if (data?.byteLength) {
        const chunk = transferableChunk(data);
        post({ type: "chunk", chunk }, [chunk.buffer]);
      }
      if (final) resolve();
    };
  });

  try {
    for (const file of request.files) {
      post({
        type: "progress",
        completed,
        total: request.files.length,
        current: file.entryName,
        bytes,
        skipped: skipped.length,
      });

      try {
        bytes += await addFileToZip(file, zip);
        added += 1;
      } catch (error) {
        skipped.push(`${file.entryName}: ${errorMessage(error)}`);
      }

      completed += 1;
      post({
        type: "progress",
        completed,
        total: request.files.length,
        current: file.entryName,
        bytes,
        skipped: skipped.length,
      });
    }

    if (added === 0) throw new Error("No pack files could be fetched.");
    zip.end();
    await zipDone;
    post({ type: "done", filename: request.filename, bytes, skipped });
  } catch (error) {
    post({ type: "error", message: errorMessage(error) });
  }
}

workerScope.onmessage = (event: MessageEvent<PackZipWorkerRequest>) => {
  if (event.data.type === "start") void zipPack(event.data);
};

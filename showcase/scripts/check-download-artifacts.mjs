import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function checkDownloadArtifacts({ remote = false, full = false, base = 'https://assets.gamedev.trebeljahr.com', manifestPath = resolve(root, 'public/manifest.json'), catalogPath = resolve(root, 'public/downloads.json'), fetchImpl = fetch } = {}) {
  const raw = await readFile(manifestPath);
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (catalog.schema !== 1 || catalog.manifestSha256 !== createHash('sha256').update(raw).digest('hex')) throw new Error('Download catalog is stale; regenerate and publish its immutable objects.');
  const objects = new Map();
  for (const item of [...Object.values(catalog.models).flat(), ...Object.values(catalog.packs)]) {
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || !/^[a-z0-9._-]+$/i.test(item.filename) || [".", ".."].includes(item.filename) || item.path !== `/downloads/v1/${item.sha256}/${encodeURIComponent(item.filename)}` || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) throw new Error('Invalid download artifact metadata.');
    const known = objects.get(item.path);
    if (known && JSON.stringify(known) !== JSON.stringify(item)) throw new Error('Conflicting download artifact metadata.');
    objects.set(item.path, item);
  }
  if (!objects.size || !Object.keys(catalog.packs).length) throw new Error('Download catalog is empty.');
  let verified = 0;
  if (remote || full) {
    const origin = new URL(base);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Invalid storage origin.');
    const pending = [...objects.values()];
    await Promise.all(Array.from({ length: Math.min(8, pending.length) }, async () => {
      for (;;) {
        const item = pending.shift();
        if (!item) return;
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            const response = await fetchImpl(new URL(item.path, origin), { method: full ? 'GET' : 'HEAD', redirect: 'error', signal: AbortSignal.timeout(full ? 600_000 : 30_000) });
            if (response.status !== 200 || Number(response.headers.get('content-length')) !== item.bytes || !/^attachment(?:;|$)/i.test(response.headers.get('content-disposition') ?? '') || !/immutable/i.test(response.headers.get('cache-control') ?? '') || response.headers.get('accept-ranges') !== 'bytes') { await response.body?.cancel(); throw new Error('object metadata'); }
            if (full) {
              const digest = createHash('sha256');
              let bytes = 0;
              for await (const chunk of response.body) { bytes += chunk.length; if (bytes > item.bytes) throw new Error('object overflow'); digest.update(chunk); }
              if (bytes !== item.bytes || digest.digest('hex') !== item.sha256) throw new Error('object digest');
            }
            ok = true;
          } catch { if (attempt === 2) throw new Error('Published download object failed verification.'); }
        }
        verified++;
      }
    }));
  }
  return { objects: objects.size, bytes: [...objects.values()].reduce((n, item) => n + item.bytes, 0), verified, mode: full ? 'full-sha256' : remote ? 'remote-headers' : 'catalog', manifestSha256: catalog.manifestSha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkDownloadArtifacts({ remote: process.argv.includes('--remote'), full: process.argv.includes('--full') }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error instanceof Error && /^(Download catalog|Invalid download|Conflicting download|Published download|Invalid storage)/.test(error.message) ? error.message : 'Download verification failed.'); process.exitCode = 1; });
}

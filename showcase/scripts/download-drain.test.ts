import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { unzipSync } from 'fflate';
import { downloadCatalog } from '../src/lib/download-catalog';
import { findPack } from '../src/lib/manifest';
import { packZipEntryName } from '../src/lib/pack-zip';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
test('accepted model and ZIP downloads finish intact after the app completes its 20-second drain and exits', { timeout: 55_000 }, async () => {
  const directory = process.env.DOWNLOAD_ARTIFACTS_DIR;
  assert.ok(directory, 'Set DOWNLOAD_ARTIFACTS_DIR to built immutable objects.');
  const packKey = Object.keys(downloadCatalog.packs).find(key => downloadCatalog.packs[key].bytes < 1_000_000)!;
  const [vendor, packName] = packKey.split('/');
  const pack = findPack(vendor, packName)!;
  const modelFile = pack.models[0].file;
  const model = downloadCatalog.models[modelFile][0];
  const zip = downloadCatalog.packs[packKey];
  const objects = new Map();
  for (const item of [model, zip]) objects.set(item.path, await readFile(join(directory, item.sha256, item.filename)));
  let accepted = 0;
  const storage = http.createServer(async (req, res) => {
    const bytes = objects.get(req.url);
    if (!bytes) { res.writeHead(404); res.end(); return; }
    accepted++;
    res.writeHead(200, { 'content-length': String(bytes.length), 'content-disposition': 'attachment' });
    // More than the host's entire 30s stop window; byte lifetime belongs to this independent origin.
    for (let i = 0; i < 40; i++) {
      res.write(bytes.subarray(Math.floor(i * bytes.length / 40), Math.floor((i + 1) * bytes.length / 40)));
      await delay(825);
    }
    res.end();
  });
  storage.listen(0, '127.0.0.1'); await once(storage, 'listening');
  const assetOrigin = `http://127.0.0.1:${(storage.address() as import('node:net').AddressInfo).port}`;
  const temp = await mkdtemp(join(tmpdir(), 'gamedev-drain-proof-'));
  const child = spawn('sh', ['../drain-entrypoint.sh', process.execPath, '--require', resolve('../drain.cjs'), '--import', 'tsx', 'scripts/download-route-fixture.ts'], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_ASSETS_BASE_URL: assetOrigin, SHUTDOWN_DRAIN_SECONDS: '20', HEALTH_CHECK_PATH: '/', HATCHKIT_DRAIN_PIDFILE: join(temp, 'drain.pid') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit');
  let didExit = false; exit.then(() => { didExit = true; });
  try {
    const port = await new Promise<number>((resolvePort, reject) => {
      let text = '';
      const timeout = setTimeout(() => reject(new Error('fixture did not start')), 8000);
      child.stdout.on('data', chunk => {
        text += chunk;
        const line = text.split('\n').find(value => value.startsWith('{'));
        if (line) { clearTimeout(timeout); resolvePort(JSON.parse(line).port); }
      });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('fixture exited before readiness')); });
    });
    const app = `http://127.0.0.1:${port}`;
    const responses = await Promise.all([
      fetch(`${app}/api/models/download?${new URLSearchParams({ file: modelFile, name: model.filename })}`),
      fetch(`${app}/api/packs/${encodeURIComponent(vendor)}/${encodeURIComponent(packName)}/zip`),
    ]);
    assert.equal(accepted, 2);
    assert.ok(responses.every(response => response.redirected && response.url.startsWith(assetOrigin) && response.status === 200));
    let completed = 0;
    const bodies = Promise.all(responses.map(async response => { const bytes = Buffer.from(await response.arrayBuffer()); completed++; return bytes; }));
    const signalledAt = Date.now();
    child.kill('SIGTERM');
    await delay(150);
    assert.equal((await fetch(`${app}/`)).status, 503);
    const [code, signal] = await exit;
    const appExitAfterMs = Date.now() - signalledAt;
    assert.equal(code, 0); assert.equal(signal, null);
    assert.ok(appExitAfterMs >= 20_000 && appExitAfterMs < 30_000, `app exit after ${appExitAfterMs}ms`);
    assert.equal(completed, 0, 'both objects must still be downloading when the app exits');
    const [modelBytes, zipBytes] = await bodies;
    assert.equal(sha(modelBytes), model.sha256); assert.equal(modelBytes.length, model.bytes);
    assert.equal(sha(zipBytes), zip.sha256); assert.equal(zipBytes.length, zip.bytes);
    const entries = unzipSync(zipBytes);
    assert.equal(Object.keys(entries).length, pack.models.length);
    for (const item of pack.models) {
      const artifact = downloadCatalog.models[item.file][0];
      assert.equal(sha(entries[packZipEntryName(item.file, vendor, packName)]), artifact.sha256);
    }
    console.log(JSON.stringify({ proof: 'independent-download-drain', appExitAfterMs, lastByteAfterMs: Date.now() - signalledAt, downloads: 2, zipEntries: pack.models.length, integrity: 'sha256-all-entries' }));
  } finally {
    if (!didExit) child.kill('SIGKILL');
    await exit;
    storage.closeAllConnections();
    await new Promise<void>(done => storage.close(() => done()));
    await rm(temp, { recursive: true, force: true });
  }
});

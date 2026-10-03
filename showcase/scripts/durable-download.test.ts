import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { buildDownloadCatalog } from './build-download-artifacts';
import { redirectDownload, type DownloadArtifact } from '../src/lib/durable-download';
import type { Manifest } from '../src/lib/manifest';

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gamedev-download-test-'));
  const assets = join(root, 'assets');
  await mkdir(join(assets, 'glb/vendor/pack'), { recursive: true });
  await writeFile(join(assets, 'glb/vendor/pack/item.glb'), Buffer.from('complete fixture model bytes'));
  const manifest = { packs: [{ vendor: 'vendor', pack: 'pack', license: 'CC0', models: [{
    name: 'item', title: 'Item Title', file: '/glb/vendor/pack/item.glb',
  }] }] } as Manifest;
  const manifestPath = join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const options = { manifestPath, assetsRoot: assets, outputRoot: join(root, 'objects'), catalogPath: join(root, 'downloads.json') };
  return { root, manifest, options };
}

test('deterministic, complete model and ZIP objects preserve existing filenames', async () => {
  const f = await fixture();
  try {
    const first = await buildDownloadCatalog(f.options);
    const again = await buildDownloadCatalog({ ...f.options, outputRoot: join(f.root, 'repeat') });
    assert.deepEqual(again, first);
    const model = first.models['/glb/vendor/pack/item.glb'][0];
    assert.equal(model.filename, 'Item-Title-optimized.glb');
    const bytes = await readFile(join(f.options.outputRoot, model.sha256, model.filename));
    assert.equal(hash(bytes), model.sha256);
    const pack = first.packs['vendor/pack'];
    const zipBytes = await readFile(join(f.options.outputRoot, pack.sha256, pack.filename));
    assert.equal(hash(zipBytes), pack.sha256);
    assert.equal(zipBytes.length, pack.bytes);
    const entries = unzipSync(zipBytes);
    assert.deepEqual(Object.keys(entries), ['pack/item.glb']);
    assert.deepEqual(Buffer.from(entries['pack/item.glb']), bytes);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('missing or escaped sources fail instead of publishing incomplete ZIPs', async () => {
  const f = await fixture();
  try {
    const source = join(f.options.assetsRoot, 'glb/vendor/pack/item.glb');
    await rm(source);
    await assert.rejects(buildDownloadCatalog(f.options));
    await writeFile(join(f.root, 'outside.glb'), 'outside');
    await symlink(join(f.root, 'outside.glb'), source);
    await assert.rejects(buildDownloadCatalog(f.options), /escaped/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('redirect hands off only validated immutable objects to independent storage', async () => {
  const artifact: DownloadArtifact = { sha256: 'a'.repeat(64), filename: 'example.glb', bytes: 10, path: `/downloads/v1/${'a'.repeat(64)}/example.glb` };
  const req = new Request('https://gamedev.example/api/models/download');
  const response = redirectDownload(req, artifact, 'https://assets.example');
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), `https://assets.example${artifact.path}`);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const base of ['https://gamedev.example', 'http://assets.example', 'https://user:pass@assets.example', 'https://assets.example/path', 'https://assets.example?secret=x']) {
    assert.equal(redirectDownload(req, artifact, base).status, 503);
  }
  assert.equal(redirectDownload(req, undefined, 'https://assets.example').status, 503);
  assert.equal(redirectDownload(req, { ...artifact, path: '/other' }, 'https://assets.example').status, 503);
});


test('publication checks fail closed on stale catalogs, wrong object metadata and corrupt bytes', async () => {
  const { checkDownloadArtifacts } = await import('./check-download-artifacts.mjs');
  const f = await fixture();
  try {
    const catalog = await buildDownloadCatalog(f.options);
    const objects = new Map([...Object.values(catalog.models).flat(), ...Object.values(catalog.packs)].map(item => [item.path, item]));
    const options = { manifestPath: f.options.manifestPath, catalogPath: f.options.catalogPath, full: true };
    const transport = (corrupt = false, disposition = 'attachment') => async (input: string | URL | Request) => {
      const item = objects.get(new URL(String(input)).pathname)!;
      const bytes = await readFile(join(f.options.outputRoot, item.sha256, item.filename));
      if (corrupt) bytes[0] ^= 1;
      return new Response(bytes, { headers: { 'content-length': String(item.bytes), 'content-disposition': disposition, 'cache-control': 'public, max-age=31536000, immutable', 'accept-ranges': 'bytes' } });
    };
    assert.equal((await checkDownloadArtifacts({ ...options, fetchImpl: transport() })).verified, 2);
    await assert.rejects(checkDownloadArtifacts({ ...options, fetchImpl: transport(true) }), /verification/);
    await assert.rejects(checkDownloadArtifacts({ ...options, fetchImpl: transport(false, 'inline') }), /verification/);
    await writeFile(f.options.manifestPath, JSON.stringify({ packs: [] }));
    await assert.rejects(checkDownloadArtifacts(options), /stale/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

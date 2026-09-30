import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("development asset endpoint confines images and stays closed in production", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "frame-inspector-"));
  const root = join(temporary, "assets");
  const previousRoot = process.env.ASSETS_DIR;
  const previousMode = process.env.NODE_ENV;
  try {
    await mkdir(root);
    await writeFile(join(root, "sample.png"), "image fixture");
    await writeFile(join(root, "private.txt"), "not an image");
    await writeFile(join(temporary, "outside.png"), "outside");
    await symlink(join(temporary, "outside.png"), join(root, "escape.png"));
    process.env.ASSETS_DIR = root;
    Object.assign(process.env, { NODE_ENV: "development" });
    const { GET } = await import("../src/app/api/dev/asset/route");
    const request = (path: string) => GET(new Request(`http://localhost/api/dev/asset?path=${encodeURIComponent(path)}`));
    const response = await request("sample.png");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "image fixture");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await request("../outside.png")).status, 403);
    assert.equal((await request("escape.png")).status, 403);
    assert.equal((await request("private.txt")).status, 415);
    assert.equal((await request("missing.png")).status, 404);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal((await request("sample.png")).status, 404);
  } finally {
    if (previousRoot === undefined) delete process.env.ASSETS_DIR;
    else process.env.ASSETS_DIR = previousRoot;
    if (previousMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousMode });
    await rm(temporary, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_URL,
  getAsset,
  getDownloadUrl,
  handleRequest,
  normalizeCatalog,
  searchAssets,
} from "../dist/index.js";

const canonicalCatalog = {
  items: [
    {
      id: "model:oak-tree",
      type: "model",
      title: "Oak Tree",
      creator: "Kenney",
      license: "CC0 1.0",
      tags: ["tree", "forest", "low-poly"],
      description: "Low-poly tree model.",
      downloads: [
        { format: "glb", url: "/models/oak-tree.glb" },
        { format: "gltf", url: "https://assets.example/oak-tree.gltf" },
      ],
    },
    {
      id: "music:menu-loop",
      type: "music",
      title: "Menu Loop",
      creator: "Pixabay",
      license: "Pixabay License",
      tags: ["ambient"],
      downloads: [{ format: "mp3", url: "/audio/menu-loop.mp3" }],
    },
  ],
};

test("normalizes canonical catalog items", () => {
  const assets = normalizeCatalog(canonicalCatalog);

  assert.equal(assets.length, 2);
  assert.equal(assets[0].id, "model:oak-tree");
  assert.equal(assets[0].downloads[0].url, new URL("/models/oak-tree.glb", CATALOG_URL).toString());
});

test("searches by query, type, license, and limit", () => {
  const results = searchAssets(canonicalCatalog, {
    query: "tree",
    type: "3d",
    license: "cc0",
    limit: 5,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "model:oak-tree");
});

test("finds assets and download URLs", () => {
  const asset = getAsset(canonicalCatalog, "model:oak-tree");
  const download = getDownloadUrl(canonicalCatalog, "model:oak-tree", "glb");

  assert.equal(asset?.title, "Oak Tree");
  assert.equal(download?.url, new URL("/models/oak-tree.glb", CATALOG_URL).toString());
});

test("normalizes manifest packs", () => {
  const manifestCatalog = {
    packs: [
      {
        vendor: "kaykit",
        pack: "adventurers",
        title: "Adventurers",
        license: "CC0 1.0",
        source: "https://example.com/source",
        models: [
          {
            name: "arrow-bow",
            title: "Arrow Bow",
            file: "/raw/kaykit/adventurers/arrow-bow.gltf",
            downloads: [{ format: "gltf", file: "/raw/kaykit/adventurers/arrow-bow.gltf" }],
            tags: ["projectile"],
          },
        ],
      },
    ],
  };

  const assets = normalizeCatalog(manifestCatalog);

  assert.equal(assets.length, 1);
  assert.equal(assets[0].id, "model:kaykit/adventurers/arrow-bow");
  assert.equal(assets[0].downloads[0].format, "gltf");
});

test("normalizes media catalog samples", () => {
  const mediaCatalog = {
    artPacks: [
      {
        folder: "2D/kenney/tiny-ski",
        title: "Tiny Ski",
        author: "Kenney",
        license_class: "CC0 1.0",
        samples: [{ path: "2D/kenney/tiny-ski/tile.png", src: "/2D/kenney/tiny-ski/tile.png", label: "Tile" }],
      },
    ],
    musicTracks: [
      {
        title: "Theme",
        source: "Pixabay",
        path: "music/theme.mp3",
        src: "/music/theme.mp3",
        license: "Pixabay License",
      },
    ],
  };

  const assets = normalizeCatalog(mediaCatalog);

  assert.equal(assets.length, 2);
  assert.equal(assets[0].id, "sprite:2D/kenney/tiny-ski/tile.png");
  assert.equal(assets[1].id, "music:music/theme.mp3");
});

test("handles MCP initialize and tool list requests", async () => {
  const init = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const tools = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  assert.equal(init?.jsonrpc, "2.0");
  assert.equal(tools?.jsonrpc, "2.0");
  assert.equal(tools && "result" in tools ? tools.result.tools.length : 0, 3);
});

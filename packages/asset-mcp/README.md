# GameDev Asset MCP

MCP stdio server for the public GameDev Asset Library catalog at:

```text
https://gamedev.trebeljahr.com/api/catalog.json
```

The catalog URL is hardcoded so AI-coding clients can install the package with one config line and start searching assets immediately.

## Claude Code

Add this entry to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "gamedev-assets": {
      "command": "npx",
      "args": ["-y", "@trebeljahr/gamedev-asset-mcp"]
    }
  }
}
```

The package is npx-installable after it is published to npm:

```sh
npx -y @trebeljahr/gamedev-asset-mcp
```

Publishing is intentionally left to Rico. Until the npm package exists, run this package from the repo workspace.

## Tools

- `search_assets(query, type?, license?, limit?)` searches the production catalog.
- `get_asset(id)` returns one catalog asset by id.
- `download_url(id, format)` returns a direct download URL for one asset and format.

`type` accepts catalog types such as `model`, `sprite`, `sound`, or `music`, plus broad filters like `3d`, `2d`, and `audio`. `limit` defaults to 10 and is capped at 50.

## Development

```sh
pnpm --filter @trebeljahr/gamedev-asset-mcp build
pnpm --filter @trebeljahr/gamedev-asset-mcp test
```

The server speaks JSON-RPC over stdio and writes protocol messages only to stdout.

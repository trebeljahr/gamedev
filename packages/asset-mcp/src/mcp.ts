import {
  availableFormats,
  CATALOG_URL,
  fetchCatalog,
  getAsset,
  getDownloadUrl,
  searchAssets,
  type JsonRecord,
} from "./catalog.js";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

const SERVER_INFO = {
  name: "@trebeljahr/gamedev-asset-mcp",
  version: "0.1.0",
};

const TOOLS = [
  {
    name: "search_assets",
    description: "Search the public GameDev Asset Library catalog.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, such as 'low poly tree' or 'jump sound'." },
        type: { type: "string", description: "Optional type filter, such as model, sprite, sound, music, 2d, 3d, or audio." },
        license: { type: "string", description: "Optional case-insensitive license substring, such as CC0." },
        limit: { type: "number", description: "Maximum results to return. Defaults to 10, capped at 50." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_asset",
    description: "Get one catalog asset by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Asset id returned by search_assets." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "download_url",
    description: "Return a direct download URL for one asset id and format.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Asset id returned by search_assets." },
        format: { type: "string", description: "Requested format, such as glb, gltf, png, mp3, or ogg." },
      },
      required: ["id", "format"],
      additionalProperties: false,
    },
  },
];

export async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
  if (request.id === undefined && request.method?.startsWith("notifications/")) return undefined;

  const id = request.id ?? null;
  try {
    switch (request.method) {
      case "initialize":
        return result(id, {
          protocolVersion: initializeProtocolVersion(request.params),
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: `Use search_assets, get_asset, and download_url. Catalog: ${CATALOG_URL}`,
        });
      case "ping":
        return result(id, {});
      case "tools/list":
        return result(id, { tools: TOOLS });
      case "tools/call":
        return result(id, await callTool(request.params));
      default:
        return error(id, -32601, `Unknown method: ${request.method ?? "(missing)"}`);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return error(id, -32000, message);
  }
}

export async function callTool(params: unknown): Promise<ToolResult> {
  if (!isRecord(params)) throw new Error("tools/call params must be an object.");

  const name = stringParam(params, "name");
  const args = isRecord(params.arguments) ? params.arguments : {};
  const catalog = await fetchCatalog();

  switch (name) {
    case "search_assets": {
      const query = stringParam(args, "query");
      const output = {
        catalogUrl: CATALOG_URL,
        results: searchAssets(catalog, {
          query,
          type: optionalStringParam(args, "type"),
          license: optionalStringParam(args, "license"),
          limit: optionalNumberParam(args, "limit"),
        }),
      };
      return toolJson(output);
    }
    case "get_asset": {
      const id = stringParam(args, "id");
      const asset = getAsset(catalog, id);
      if (!asset) throw new Error(`Asset not found: ${id}`);
      return toolJson({ catalogUrl: CATALOG_URL, asset });
    }
    case "download_url": {
      const id = stringParam(args, "id");
      const format = stringParam(args, "format");
      const download = getDownloadUrl(catalog, id, format);
      if (!download) {
        const asset = getAsset(catalog, id);
        if (!asset) throw new Error(`Asset not found: ${id}`);
        throw new Error(`Format not found for ${id}: ${format}. Available formats: ${availableFormats(asset).join(", ") || "none"}`);
      }
      return toolJson({ id, format: download.format, url: download.url, download });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function parseJsonRpcLine(line: string): JsonRpcRequest {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) throw new Error("JSON-RPC message must be an object.");
  return parsed;
}

export function serializeResponse(response: JsonRpcResponse): string {
  return `${JSON.stringify(response)}\n`;
}

function result(id: JsonRpcId, response: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: response };
}

function initializeProtocolVersion(params: unknown): string {
  if (isRecord(params) && typeof params.protocolVersion === "string") return params.protocolVersion;
  return "2024-11-05";
}

function error(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function toolJson(value: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function stringParam(params: JsonRecord, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value.trim();
}

function optionalStringParam(params: JsonRecord, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNumberParam(params: JsonRecord, key: string): number | undefined {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

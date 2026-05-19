#!/usr/bin/env node
import { createInterface } from "node:readline";
import { handleRequest, parseJsonRpcLine, serializeResponse } from "./mcp.js";

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

input.on("line", (line) => {
  void handleLine(line);
});

input.on("close", () => {
  process.exit(0);
});

async function handleLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = parseJsonRpcLine(trimmed);
    const response = await handleRequest(request);
    if (response) process.stdout.write(serializeResponse(response));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    process.stdout.write(
      serializeResponse({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message },
      }),
    );
  }
}

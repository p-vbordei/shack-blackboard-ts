/**
 * JSON-RPC 2.0 stdio loop for the shack-blackboard MCP server.
 * STDOUT carries only protocol messages; all diagnostics go to STDERR.
 */

import * as readline from "readline";
import { SharedState } from "./state.js";
import { TOOLS_SCHEMA, dispatchTool } from "./tools.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "shack-blackboard", version: "0.1.0" };

function writeResponse(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function errorResponse(id: unknown, code: number, message: string): unknown {
  return { jsonrpc: "2.0", error: { code, message }, id };
}

type JsonRpcRequest = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

function handleRequest(req: JsonRpcRequest, state: SharedState): unknown | null {
  const id = req.id ?? null;
  const method = req.method;

  if (typeof method !== "string") {
    return errorResponse(id, -32600, "Invalid Request: missing method");
  }

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
        id,
      };

    case "notifications/initialized":
      // Notification — no response
      return null;

    case "tools/list":
      return {
        jsonrpc: "2.0",
        result: { tools: TOOLS_SCHEMA },
        id,
      };

    case "tools/call": {
      const params = req.params as Record<string, unknown> | null | undefined;
      const toolName = params?.["name"];
      if (typeof toolName !== "string") {
        return errorResponse(id, -32602, "Invalid params: missing tool name");
      }
      const args = (params?.["arguments"] ?? null) as Record<string, unknown> | null;
      try {
        const result = dispatchTool(toolName, args, state);
        return { jsonrpc: "2.0", result, id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(id, -32603, msg);
      }
    }

    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

export function run(): void {
  process.stderr.write("shack-blackboard starting\n");
  const state = new SharedState();

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch (e) {
      writeResponse(errorResponse(null, -32700, `Parse error: ${String(e)}`));
      return;
    }

    const resp = handleRequest(req, state);
    if (resp !== null) writeResponse(resp);
  });
}

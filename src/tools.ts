/**
 * MCP tool schema definitions and dispatch logic.
 *
 * {@link TOOLS_SCHEMA} contains every tool this server exposes, in the format
 * the `tools/list` method returns.  {@link dispatchTool} is the single entry
 * point that executes a named tool against the shared state.
 */

import { SharedState, validateKey } from "./state.js";

export const TOOLS_SCHEMA = [
  {
    name: "write_blackboard",
    description: "Write a value under a key in the shared blackboard. Overwrites any existing value.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Unique key for the entry" },
        value: { description: "Arbitrary JSON value to store" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "read_blackboard",
    description: "Read the value stored under a key. Returns null if the key does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
      },
      required: ["key"],
    },
  },
  {
    name: "list_keys",
    description: "List all keys currently stored in the blackboard.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "publish",
    description: "Append a message to a topic's log. Creates the topic if it does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        message: { description: "Arbitrary JSON message to publish" },
      },
      required: ["topic", "message"],
    },
  },
  {
    name: "poll_topic",
    description:
      "Retrieve messages from a topic starting at a given cursor offset. Returns new messages and the updated cursor.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        cursor: {
          type: "integer",
          description:
            "Index of the first message to return. Pass 0 for all messages. Use the returned next_cursor on subsequent calls.",
          minimum: 0,
        },
      },
      required: ["topic", "cursor"],
    },
  },
  {
    name: "list_topics",
    description: "List all topic names that have received at least one published message.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "acquire_lock",
    description: "Acquire an exclusive lock on a named resource. Returns acquired=true on success.",
    inputSchema: {
      type: "object",
      properties: {
        resource: { type: "string" },
        owner: { type: "string", description: "Caller-chosen identifier for the lock holder" },
        ttl_ms: {
          type: "integer",
          description: "Optional lock lifetime in milliseconds. Omit for an indefinite lock.",
          minimum: 1,
        },
      },
      required: ["resource", "owner"],
    },
  },
  {
    name: "release_lock",
    description: "Release an exclusive lock. Only the original owner may release it.",
    inputSchema: {
      type: "object",
      properties: {
        resource: { type: "string" },
        owner: { type: "string" },
      },
      required: ["resource", "owner"],
    },
  },
];

type Args = Record<string, unknown> | null | undefined;

/**
 * Extract a required string field from `args`.
 *
 * @throws {Error} If `args` is falsy, the field is absent, or its value is not a string.
 */
function requiredStr(args: Args, field: string): string {
  if (!args || typeof args[field] !== "string") {
    throw new Error(`Missing or invalid parameter: ${field} (must be a string)`);
  }
  return args[field] as string;
}

/** Shape of a successful tool result. */
type ToolResult = Record<string, unknown>;

/**
 * Execute a named MCP tool against `state` and return the result object.
 *
 * @param name - The tool name, e.g. `"write_blackboard"`.
 * @param args - The `arguments` dict from the `tools/call` params.
 * @param state - The shared in-memory state.
 * @returns A `{ content: [...] }` object suitable for a `tools/call` response.
 * @throws {Error} For invalid/missing arguments or an unknown tool name.
 */
export function dispatchTool(name: string, args: Args, state: SharedState): ToolResult {
  switch (name) {
    case "write_blackboard": {
      const key = requiredStr(args, "key");
      if (!args || !("value" in args)) throw new Error("Missing required parameter: value");
      const value = args["value"];
      validateKey(key);
      state.write(key, value);
      return { content: [{ type: "text", text: `Written key: ${key}` }] };
    }

    case "read_blackboard": {
      const key = requiredStr(args, "key");
      const value = state.read(key);
      return { content: [{ type: "text", text: JSON.stringify(value) }] };
    }

    case "list_keys": {
      const keys = state.listKeys();
      return { content: [{ type: "text", text: JSON.stringify(keys) }] };
    }

    case "publish": {
      const topic = requiredStr(args, "topic");
      if (!args || !("message" in args)) throw new Error("Missing required parameter: message");
      const message = args["message"];
      validateKey(topic);
      state.publish(topic, message);
      return { content: [{ type: "text", text: `Published to topic: ${topic}` }] };
    }

    case "poll_topic": {
      const topic = requiredStr(args, "topic");
      const cursorRaw = args?.["cursor"];
      if (typeof cursorRaw !== "number" || !Number.isInteger(cursorRaw) || cursorRaw < 0) {
        throw new Error("Missing or invalid parameter: cursor (must be non-negative integer)");
      }
      const [messages, nextCursor] = state.pollTopic(topic, cursorRaw);
      const result = { topic, messages, next_cursor: nextCursor };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    case "list_topics": {
      const topics = state.listTopics();
      return { content: [{ type: "text", text: JSON.stringify(topics) }] };
    }

    case "acquire_lock": {
      const resource = requiredStr(args, "resource");
      const owner = requiredStr(args, "owner");
      validateKey(resource);
      validateKey(owner);
      const ttlRaw = args?.["ttl_ms"];
      const ttlMs = ttlRaw !== undefined ? (ttlRaw as number) : null;
      const acquired = state.acquireLock(resource, owner, ttlMs);
      const msg = acquired
        ? `Lock acquired on ${resource} by ${owner}`
        : `Lock on ${resource} is held by another owner`;
      return { content: [{ type: "text", text: msg }], acquired };
    }

    case "release_lock": {
      const resource = requiredStr(args, "resource");
      const owner = requiredStr(args, "owner");
      const released = state.releaseLock(resource, owner);
      const msg = released
        ? `Lock on ${resource} released by ${owner}`
        : `No lock on ${resource} held by ${owner}`;
      return { content: [{ type: "text", text: msg }], released };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

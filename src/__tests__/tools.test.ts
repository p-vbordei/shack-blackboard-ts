import { SharedState } from "../state.js";
import { dispatchTool } from "../tools.js";

function make(): SharedState {
  return new SharedState();
}

// --- write_blackboard / read_blackboard ---

test("write and read", () => {
  const s = make();
  dispatchTool("write_blackboard", { key: "k", value: 42 }, s);
  const result = dispatchTool("read_blackboard", { key: "k" }, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toBe(42);
});

test("read missing returns null", () => {
  const s = make();
  const result = dispatchTool("read_blackboard", { key: "absent" }, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toBeNull();
});

test("list keys sorted", () => {
  const s = make();
  dispatchTool("write_blackboard", { key: "z", value: 1 }, s);
  dispatchTool("write_blackboard", { key: "a", value: 2 }, s);
  const result = dispatchTool("list_keys", {}, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toEqual(["a", "z"]);
});

// --- publish / poll_topic ---

test("publish and poll", () => {
  const s = make();
  dispatchTool("publish", { topic: "t", message: "hello" }, s);
  const result = dispatchTool("poll_topic", { topic: "t", cursor: 0 }, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  const data = JSON.parse(text);
  expect(data.messages).toEqual(["hello"]);
  expect(data.next_cursor).toBe(1);
});

test("poll with cursor", () => {
  const s = make();
  dispatchTool("publish", { topic: "t", message: "a" }, s);
  dispatchTool("publish", { topic: "t", message: "b" }, s);
  const r1 = dispatchTool("poll_topic", { topic: "t", cursor: 0 }, s);
  const d1 = JSON.parse((r1.content as { type: string; text: string }[])[0].text);
  const cursor = d1.next_cursor;
  dispatchTool("publish", { topic: "t", message: "c" }, s);
  const r2 = dispatchTool("poll_topic", { topic: "t", cursor }, s);
  const d2 = JSON.parse((r2.content as { type: string; text: string }[])[0].text);
  expect(d2.messages).toEqual(["c"]);
});

test("list topics", () => {
  const s = make();
  dispatchTool("publish", { topic: "beta", message: 1 }, s);
  dispatchTool("publish", { topic: "alpha", message: 2 }, s);
  const result = dispatchTool("list_topics", {}, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toEqual(["alpha", "beta"]);
});

// --- acquire_lock / release_lock ---

test("acquire and release", () => {
  const s = make();
  const r1 = dispatchTool("acquire_lock", { resource: "r", owner: "a" }, s);
  expect(r1.acquired).toBe(true);
  const r2 = dispatchTool("acquire_lock", { resource: "r", owner: "b" }, s);
  expect(r2.acquired).toBe(false);
  const rel = dispatchTool("release_lock", { resource: "r", owner: "a" }, s);
  expect(rel.released).toBe(true);
  const r3 = dispatchTool("acquire_lock", { resource: "r", owner: "b" }, s);
  expect(r3.acquired).toBe(true);
});

test("release wrong owner", () => {
  const s = make();
  dispatchTool("acquire_lock", { resource: "r", owner: "a" }, s);
  const rel = dispatchTool("release_lock", { resource: "r", owner: "b" }, s);
  expect(rel.released).toBe(false);
});

// --- Error handling ---

test("unknown tool throws", () => {
  const s = make();
  expect(() => dispatchTool("no_such_tool", {}, s)).toThrow("Unknown tool");
});

test("missing key param throws", () => {
  const s = make();
  expect(() => dispatchTool("write_blackboard", { value: 1 }, s)).toThrow();
});

test("empty key throws", () => {
  const s = make();
  expect(() => dispatchTool("write_blackboard", { key: "", value: 1 }, s)).toThrow();
});

// --- Additional write/read error paths ---

test("write missing value param throws", () => {
  const s = make();
  expect(() => dispatchTool("write_blackboard", { key: "k" }, s)).toThrow(/value/);
});

test("write key too long throws", () => {
  const s = make();
  expect(() => dispatchTool("write_blackboard", { key: "x".repeat(513), value: 1 }, s)).toThrow();
});

test("read non-string key throws", () => {
  const s = make();
  expect(() => dispatchTool("read_blackboard", { key: 42 }, s)).toThrow();
});

test("write falsy value false is stored", () => {
  const s = make();
  dispatchTool("write_blackboard", { key: "flag", value: false }, s);
  const result = dispatchTool("read_blackboard", { key: "flag" }, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toBe(false);
});

test("write null value is stored", () => {
  const s = make();
  dispatchTool("write_blackboard", { key: "n", value: null }, s);
  const result = dispatchTool("read_blackboard", { key: "n" }, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toBeNull();
});

test("list keys empty", () => {
  const s = make();
  const result = dispatchTool("list_keys", {}, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toEqual([]);
});

// --- Additional publish/poll error paths ---

test("publish missing message param throws", () => {
  const s = make();
  expect(() => dispatchTool("publish", { topic: "t" }, s)).toThrow(/message/);
});

test("publish empty topic throws", () => {
  const s = make();
  expect(() => dispatchTool("publish", { topic: "", message: "x" }, s)).toThrow();
});

test("poll topic missing cursor throws", () => {
  const s = make();
  expect(() => dispatchTool("poll_topic", { topic: "t" }, s)).toThrow(/cursor/);
});

test("poll topic negative cursor throws", () => {
  const s = make();
  expect(() => dispatchTool("poll_topic", { topic: "t", cursor: -1 }, s)).toThrow(/cursor/);
});

test("poll topic float cursor throws", () => {
  const s = make();
  expect(() => dispatchTool("poll_topic", { topic: "t", cursor: 1.5 }, s)).toThrow(/cursor/);
});

test("poll unknown topic returns empty messages", () => {
  const s = make();
  const result = dispatchTool("poll_topic", { topic: "no-such-topic", cursor: 0 }, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  const data = JSON.parse(text);
  expect(data.messages).toEqual([]);
  expect(data.next_cursor).toBe(0);
});

test("list topics empty", () => {
  const s = make();
  const result = dispatchTool("list_topics", {}, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(JSON.parse(text)).toEqual([]);
});

// --- Additional lock error paths ---

test("acquire lock missing owner throws", () => {
  const s = make();
  expect(() => dispatchTool("acquire_lock", { resource: "r" }, s)).toThrow();
});

test("acquire lock empty resource throws", () => {
  const s = make();
  expect(() => dispatchTool("acquire_lock", { resource: "", owner: "o" }, s)).toThrow();
});

test("release lock missing resource throws", () => {
  const s = make();
  expect(() => dispatchTool("release_lock", { owner: "o" }, s)).toThrow();
});

test("release nonexistent lock returns false", () => {
  const s = make();
  const result = dispatchTool("release_lock", { resource: "ghost", owner: "anyone" }, s);
  expect(result.released).toBe(false);
});

// --- Result structure ---

test("write result has text content with key name", () => {
  const s = make();
  const result = dispatchTool("write_blackboard", { key: "mykey", value: 1 }, s);
  const text = (result.content as { type: string; text: string }[])[0].text;
  expect(text).toContain("mykey");
});

test("acquire result has acquired field", () => {
  const s = make();
  const result = dispatchTool("acquire_lock", { resource: "r", owner: "a" }, s);
  expect(result).toHaveProperty("acquired");
});

test("release result has released field", () => {
  const s = make();
  dispatchTool("acquire_lock", { resource: "r", owner: "a" }, s);
  const result = dispatchTool("release_lock", { resource: "r", owner: "a" }, s);
  expect(result).toHaveProperty("released");
});

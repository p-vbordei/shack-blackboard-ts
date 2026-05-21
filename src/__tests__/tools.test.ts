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

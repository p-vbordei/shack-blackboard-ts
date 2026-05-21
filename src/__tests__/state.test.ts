import { SharedState, validateKey } from "../state.js";

function make(): SharedState {
  return new SharedState();
}

// --- Blackboard ---

test("write then read", () => {
  const s = make();
  s.write("agent.status", "ready");
  expect(s.read("agent.status")).toBe("ready");
});

test("read missing key returns null", () => {
  const s = make();
  expect(s.read("no_such_key")).toBeNull();
});

test("list keys sorted", () => {
  const s = make();
  expect(s.listKeys()).toEqual([]);
  s.write("b", 1);
  s.write("a", 2);
  expect(s.listKeys()).toEqual(["a", "b"]);
});

test("write overwrites", () => {
  const s = make();
  s.write("x", 1);
  s.write("x", 2);
  expect(s.read("x")).toBe(2);
});

// --- Pub/sub ---

test("publish then poll all", () => {
  const s = make();
  s.publish("events", { type: "start" });
  s.publish("events", { type: "stop" });
  const [msgs, next] = s.pollTopic("events", 0);
  expect(msgs).toHaveLength(2);
  expect(next).toBe(2);
  expect(msgs[0]).toEqual({ type: "start" });
  expect(msgs[1]).toEqual({ type: "stop" });
});

test("poll with cursor returns only new messages", () => {
  const s = make();
  s.publish("t", "a");
  s.publish("t", "b");
  s.publish("t", "c");

  const [, next] = s.pollTopic("t", 0);
  expect(next).toBe(3);

  s.publish("t", "d");
  const [newMsgs, newNext] = s.pollTopic("t", next);
  expect(newMsgs).toEqual(["d"]);
  expect(newNext).toBe(4);
});

test("poll cursor at end returns empty", () => {
  const s = make();
  s.publish("t", 1);
  const [, cursor] = s.pollTopic("t", 0);
  const [msgs, next] = s.pollTopic("t", cursor);
  expect(msgs).toEqual([]);
  expect(next).toBe(cursor);
});

test("poll unknown topic", () => {
  const s = make();
  const [msgs, next] = s.pollTopic("nonexistent", 0);
  expect(msgs).toEqual([]);
  expect(next).toBe(0);
});

test("list topics sorted", () => {
  const s = make();
  expect(s.listTopics()).toEqual([]);
  s.publish("beta", 1);
  s.publish("alpha", 2);
  expect(s.listTopics()).toEqual(["alpha", "beta"]);
});

// --- Locks ---

test("acquire lock exclusive", () => {
  const s = make();
  expect(s.acquireLock("res", "agent-1", null)).toBe(true);
  expect(s.acquireLock("res", "agent-2", null)).toBe(false);
  // Same owner can re-acquire (idempotent renewal)
  expect(s.acquireLock("res", "agent-1", null)).toBe(true);
});

test("release lock", () => {
  const s = make();
  s.acquireLock("r", "owner", null);
  expect(s.releaseLock("r", "owner")).toBe(true);
  expect(s.releaseLock("r", "owner")).toBe(false); // double release
  expect(s.acquireLock("r", "other", null)).toBe(true);
});

test("release lock wrong owner fails", () => {
  const s = make();
  s.acquireLock("r", "agent-1", null);
  expect(s.releaseLock("r", "agent-2")).toBe(false);
});

test("expired lock can be acquired", async () => {
  const s = make();
  s.acquireLock("r", "agent-1", 1); // 1 ms TTL
  await new Promise((r) => setTimeout(r, 20));
  expect(s.acquireLock("r", "agent-2", null)).toBe(true);
});

// --- Key validation ---

test("validate key empty", () => {
  expect(() => validateKey("")).toThrow();
});

test("validate key too long", () => {
  expect(() => validateKey("x".repeat(513))).toThrow();
});

test("validate key valid", () => {
  expect(() => validateKey("my.key/123")).not.toThrow();
});

import { SharedState, validateKey, MAX_KEY_LEN } from "../state.js";

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

test("validate key exactly MAX_KEY_LEN is valid", () => {
  expect(() => validateKey("k".repeat(MAX_KEY_LEN))).not.toThrow();
});

test("validate key MAX_KEY_LEN + 1 is invalid", () => {
  expect(() => validateKey("k".repeat(MAX_KEY_LEN + 1))).toThrow();
});

// --- Additional blackboard tests ---

test("write complex nested value", () => {
  const s = make();
  const val = { nested: [1, 2, { deep: true }] };
  s.write("complex", val);
  expect(s.read("complex")).toEqual(val);
});

test("write null value is stored and readable", () => {
  const s = make();
  s.write("k", null);
  // read must return null (as stored), not fall through to the absent-key null
  expect(s.read("k")).toBeNull();
  // The key must appear in listKeys because it was explicitly written
  expect(s.listKeys()).toContain("k");
});

test("write false value is not confused with absent key", () => {
  const s = make();
  s.write("flag", false);
  expect(s.read("flag")).toBe(false);
});

test("write zero is not confused with absent key", () => {
  const s = make();
  s.write("n", 0);
  expect(s.read("n")).toBe(0);
});

test("list keys multiple entries sorted", () => {
  const s = make();
  for (const ch of ["c", "a", "e", "b", "d"]) s.write(ch, 1);
  expect(s.listKeys()).toEqual(["a", "b", "c", "d", "e"]);
});

// --- Additional pub/sub tests ---

test("publish different value types", () => {
  const s = make();
  s.publish("t", 42);
  s.publish("t", "hello");
  s.publish("t", true);
  s.publish("t", null);
  const [msgs, next] = s.pollTopic("t", 0);
  expect(next).toBe(4);
  expect(msgs).toEqual([42, "hello", true, null]);
});

test("poll cursor beyond end returns empty without throwing", () => {
  const s = make();
  s.publish("t", 1);
  // cursor 999 is well past the end; must return empty, not crash
  const [msgs, next] = s.pollTopic("t", 999);
  expect(msgs).toEqual([]);
  expect(next).toBe(1); // log length, not requested cursor
});

test("multiple independent topics do not interfere", () => {
  const s = make();
  s.publish("a", 1);
  s.publish("b", 2);
  s.publish("a", 3);
  const [aMsgs] = s.pollTopic("a", 0);
  const [bMsgs] = s.pollTopic("b", 0);
  expect(aMsgs).toEqual([1, 3]);
  expect(bMsgs).toEqual([2]);
});

test("incremental poll reads all messages exactly once", () => {
  const s = make();
  for (let i = 0; i < 5; i++) s.publish("t", i);
  let cursor = 0;
  const collected: unknown[] = [];
  for (let pass = 0; pass < 5; pass++) {
    const [batch, next] = s.pollTopic("t", cursor);
    cursor = next;
    collected.push(...batch);
    if (cursor >= 5) break;
  }
  const [remaining] = s.pollTopic("t", cursor);
  expect(remaining).toEqual([]);
  expect(collected).toEqual([0, 1, 2, 3, 4]);
});

// --- Additional lock tests ---

test("locks on separate resources are independent", () => {
  const s = make();
  expect(s.acquireLock("r1", "owner-a", null)).toBe(true);
  expect(s.acquireLock("r2", "owner-b", null)).toBe(true);
  expect(s.acquireLock("r1", "owner-b", null)).toBe(false);
  expect(s.acquireLock("r2", "owner-a", null)).toBe(false);
});

test("release nonexistent lock returns false", () => {
  const s = make();
  expect(s.releaseLock("ghost", "anyone")).toBe(false);
});

test("ttl renewal extends expiry", async () => {
  const s = make();
  s.acquireLock("r", "owner", 5); // 5 ms TTL
  s.acquireLock("r", "owner", 1000); // renew with 1 s TTL
  await new Promise((r) => setTimeout(r, 20)); // original TTL would have expired
  // Different owner must still be blocked because renewal is alive
  expect(s.acquireLock("r", "other", null)).toBe(false);
});

test("original owner can re-acquire after release", () => {
  const s = make();
  s.acquireLock("r", "alice", null);
  s.releaseLock("r", "alice");
  expect(s.acquireLock("r", "alice", null)).toBe(true);
});

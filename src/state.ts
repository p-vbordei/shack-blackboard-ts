/**
 * Shared in-memory state: blackboard, pub/sub topics, and named locks.
 *
 * All methods are synchronous; callers must serialise concurrent access.
 * The server is single-threaded (Node.js event loop), so a single
 * {@link SharedState} instance is safe to share across all tool calls
 * without additional locking.
 */

/** Maximum allowed length for a key or topic name. */
export const MAX_KEY_LEN = 512;

/**
 * Validate a key or topic name.
 *
 * Rejects empty strings and names longer than {@link MAX_KEY_LEN} to prevent
 * degenerate inputs from consuming unbounded memory.
 *
 * @throws {Error} If the key is empty or too long.
 */
export function validateKey(key: string): void {
  if (key.length === 0) throw new Error("Key/topic must not be empty");
  if (key.length > MAX_KEY_LEN) throw new Error("Key/topic must not exceed 512 characters");
}

/**
 * Append-only message log for a single pub/sub topic.
 *
 * Consumers track their read position with a cursor (a plain array index).
 * Polling with a cursor equal to the log length returns an empty array,
 * letting callers distinguish "nothing new" from "topic does not exist".
 */
class TopicLog {
  private messages: unknown[] = [];

  /** Append {@link message} to the end of the log. */
  push(message: unknown): void {
    this.messages.push(message);
  }

  /**
   * Return messages from {@link fromCursor} onward and the new cursor value.
   *
   * The returned cursor always equals the current log length so callers can
   * store it verbatim and use it on the next {@link poll} call.
   */
  poll(fromCursor: number): [unknown[], number] {
    return [this.messages.slice(fromCursor), this.messages.length];
  }
}

/** Internal lock record. */
interface LockInfo {
  owner: string;
  /** Absolute {@link performance.now()} deadline, or `null` for indefinite. */
  expiresAt: number | null;
}

/**
 * Central in-memory store shared across all tool calls.
 *
 * Holds three independent namespaces:
 * - **blackboard** – arbitrary JSON values keyed by name.
 * - **topics** – append-only {@link TopicLog} instances, one per topic name.
 * - **locks** – exclusive lock entries, one per resource name.
 */
export class SharedState {
  private blackboard = new Map<string, unknown>();
  private topics = new Map<string, TopicLog>();
  private locks = new Map<string, LockInfo>();

  // --- Blackboard ---

  /** Insert or overwrite {@link key} with {@link value} in the blackboard. */
  write(key: string, value: unknown): void {
    this.blackboard.set(key, value);
  }

  /**
   * Return the value stored under {@link key}, or `null` if the key is absent.
   *
   * Returning `null` (rather than `undefined`) mirrors the JSON `null` that
   * the other language implementations return, keeping cross-language behaviour
   * consistent.
   */
  read(key: string): unknown {
    return this.blackboard.has(key) ? this.blackboard.get(key) : null;
  }

  /** Return all blackboard keys in sorted order. */
  listKeys(): string[] {
    return [...this.blackboard.keys()].sort();
  }

  // --- Pub/sub ---

  /** Append {@link message} to {@link topic}, creating the log if needed. */
  publish(topic: string, message: unknown): void {
    if (!this.topics.has(topic)) this.topics.set(topic, new TopicLog());
    this.topics.get(topic)!.push(message);
  }

  /**
   * Poll {@link topic} for messages starting at {@link fromCursor}.
   *
   * Returns `[[], 0]` for topics that have never been published to, so the
   * caller can use the same cursor-update logic regardless of whether the
   * topic exists yet.
   */
  pollTopic(topic: string, fromCursor: number): [unknown[], number] {
    const log = this.topics.get(topic);
    if (!log) return [[], 0];
    return log.poll(fromCursor);
  }

  /** Return all topic names in sorted order. */
  listTopics(): string[] {
    return [...this.topics.keys()].sort();
  }

  // --- Locks ---

  /**
   * Attempt to acquire an exclusive lock on {@link resource} for {@link owner}.
   *
   * The same owner may always re-acquire (idempotent renewal, optionally
   * extending the TTL). A different owner is blocked while a non-expired lock
   * is held.
   *
   * @param ttlMs - Lock lifetime in milliseconds, or `null` for indefinite.
   * @returns `true` if the lock was acquired.
   */
  acquireLock(resource: string, owner: string, ttlMs: number | null): boolean {
    const now = performance.now();
    const existing = this.locks.get(resource);
    if (existing !== undefined) {
      const expired = existing.expiresAt !== null && now >= existing.expiresAt;
      if (!expired && existing.owner !== owner) return false;
    }
    const expiresAt = ttlMs !== null ? now + ttlMs : null;
    this.locks.set(resource, { owner, expiresAt });
    return true;
  }

  /**
   * Release the lock on {@link resource} if it is currently held by {@link owner}.
   *
   * @returns `true` if released, `false` if not locked or wrong owner.
   */
  releaseLock(resource: string, owner: string): boolean {
    const existing = this.locks.get(resource);
    if (existing !== undefined && existing.owner === owner) {
      this.locks.delete(resource);
      return true;
    }
    return false;
  }
}

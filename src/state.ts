/**
 * Shared in-memory state: blackboard, pub/sub topics, and named locks.
 * All methods are synchronous; callers must serialise concurrent access.
 */

export const MAX_KEY_LEN = 512;

export function validateKey(key: string): void {
  // Reject empty or oversized names to prevent degenerate inputs.
  if (key.length === 0) throw new Error("Key/topic must not be empty");
  if (key.length > MAX_KEY_LEN) throw new Error("Key/topic must not exceed 512 characters");
}

class TopicLog {
  private messages: unknown[] = [];

  push(message: unknown): void {
    this.messages.push(message);
  }

  /** Returns messages from fromCursor onward and the new cursor position. */
  poll(fromCursor: number): [unknown[], number] {
    return [this.messages.slice(fromCursor), this.messages.length];
  }
}

interface LockInfo {
  owner: string;
  expiresAt: number | null; // performance.now() timestamp, or null for indefinite
}

export class SharedState {
  private blackboard = new Map<string, unknown>();
  private topics = new Map<string, TopicLog>();
  private locks = new Map<string, LockInfo>();

  // --- Blackboard ---

  write(key: string, value: unknown): void {
    this.blackboard.set(key, value);
  }

  read(key: string): unknown {
    return this.blackboard.has(key) ? this.blackboard.get(key) : null;
  }

  listKeys(): string[] {
    return [...this.blackboard.keys()].sort();
  }

  // --- Pub/sub ---

  publish(topic: string, message: unknown): void {
    if (!this.topics.has(topic)) this.topics.set(topic, new TopicLog());
    this.topics.get(topic)!.push(message);
  }

  pollTopic(topic: string, fromCursor: number): [unknown[], number] {
    const log = this.topics.get(topic);
    if (!log) return [[], 0];
    return log.poll(fromCursor);
  }

  listTopics(): string[] {
    return [...this.topics.keys()].sort();
  }

  // --- Locks ---

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

  releaseLock(resource: string, owner: string): boolean {
    const existing = this.locks.get(resource);
    if (existing !== undefined && existing.owner === owner) {
      this.locks.delete(resource);
      return true;
    }
    return false;
  }
}

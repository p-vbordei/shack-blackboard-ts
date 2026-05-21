# shack-blackboard

A shared-state MCP server providing a blackboard (key-value store), topic-based publish/subscribe messaging, and named exclusive locks for multi-agent coordination.

Speaks JSON-RPC 2.0 over stdio — STDOUT carries only protocol messages; all diagnostic logs go to STDERR.

## What it does

- **Blackboard**: agents read and write arbitrary JSON values under named keys, enabling shared working memory across a session.
- **Pub/sub topics**: any agent can publish messages to a named topic; others poll with a cursor index to consume only new messages without re-reading old ones.
- **Named locks**: agents acquire and release exclusive locks on named resources, with optional TTL-based expiry, to coordinate critical sections.

## MCP tools

| Tool | Description |
|------|-------------|
| `write_blackboard` | Write a JSON value under a key (overwrites existing value) |
| `read_blackboard` | Read the value stored under a key; returns `null` if not found |
| `list_keys` | List all keys currently stored in the blackboard |
| `publish` | Append a JSON message to a named topic's log |
| `poll_topic` | Retrieve messages from a topic at a given cursor; returns messages and updated cursor |
| `list_topics` | List all topic names that have received at least one message |
| `acquire_lock` | Acquire an exclusive lock on a named resource (optional TTL in ms) |
| `release_lock` | Release a lock; only the original owner may release it |

## Install

```sh
npm install
npm run build
```

## Run

```sh
node dist/main.js
```

Or via the bin entry:

```sh
npx shack-blackboard
```

The server reads newline-delimited JSON-RPC 2.0 requests from stdin and writes responses to stdout.

## Test

```sh
npm test
```

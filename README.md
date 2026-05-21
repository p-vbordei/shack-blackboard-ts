# shack-blackboard

A shared-state MCP server providing a blackboard (key-value store), topic-based publish/subscribe messaging, and named exclusive locks for multi-agent coordination.

Speaks JSON-RPC 2.0 over stdio — STDOUT carries only protocol messages; all diagnostic logs go to STDERR.

## What it does

- **Blackboard**: agents read and write arbitrary JSON values under named keys, enabling shared working memory across a session.
- **Pub/sub topics**: any agent can publish messages to a named topic; others poll with a cursor index to consume only new messages without re-reading old ones.
- **Named locks**: agents acquire and release exclusive locks on named resources, with optional TTL-based expiry, to coordinate critical sections.

## MCP tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `write_blackboard` | `key` (string, required), `value` (any JSON, required) | Write a JSON value under a key; overwrites any existing value |
| `read_blackboard` | `key` (string, required) | Read the value stored under a key; returns `null` if the key does not exist |
| `list_keys` | _(none)_ | List all keys currently stored in the blackboard, sorted alphabetically |
| `publish` | `topic` (string, required), `message` (any JSON, required) | Append a JSON message to a named topic's log; creates the topic if needed |
| `poll_topic` | `topic` (string, required), `cursor` (integer >= 0, required) | Retrieve messages from a topic starting at cursor; returns `messages` array and `next_cursor` |
| `list_topics` | _(none)_ | List all topic names that have received at least one message, sorted alphabetically |
| `acquire_lock` | `resource` (string, required), `owner` (string, required), `ttl_ms` (integer, optional) | Acquire an exclusive lock; returns `acquired` boolean. Same owner can re-acquire (TTL renewal) |
| `release_lock` | `resource` (string, required), `owner` (string, required) | Release a lock held by the given owner; returns `released` boolean |

Key and topic names must be non-empty strings of at most 512 characters.

## Usage example

The following shows a complete JSON-RPC session: acquire a lock, do work, then release.

**Request — acquire lock:**
```json
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"acquire_lock","arguments":{"resource":"shared-db","owner":"agent-1","ttl_ms":5000}},"id":1}
```
**Response:**
```json
{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Lock acquired on shared-db by agent-1"}],"acquired":true},"id":1}
```

**Request — release lock:**
```json
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"release_lock","arguments":{"resource":"shared-db","owner":"agent-1"}},"id":2}
```
**Response:**
```json
{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Lock on shared-db released by agent-1"}],"released":true},"id":2}
```

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

The server reads newline-delimited JSON-RPC 2.0 requests from stdin and writes responses to stdout. No flags are required.

## Test

```sh
npm test
```

Covers unit tests for all `SharedState` methods and `validateKey`, plus dispatch-level tests for every tool including error paths, boundary values, and missing/invalid arguments.

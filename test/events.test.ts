// The server's lines, read and handed to a program's events with all they
// carry.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ANY_SUB, dispatch, readMessage, type ServerEvents } from "../src/index.ts";

/** The sub-page the first connection selects. */
const SUB = 2;

/** An event no test here should hear. */
function ignored(): void {
  assert.fail("no other event");
}

test("the server's lines reach the events with their path and query", () => {
  const heard: unknown[] = [];
  const events: ServerEvents = {
    start: ignored,
    input: ignored,
    left: ignored,
    closed: ignored,
    stats: ignored,
    refused: ignored,
    measured: ignored,
    describe: ignored,
    connected: (_connection, _session, request, selection, _cookies, path, query) => {
      heard.push(["connected", request, selection, path, query]);
    },
    selected: (_connection, request, selection, path, query) => {
      heard.push(["selected", request, selection, path, query]);
    },
  };
  for (const line of [
    '{"type":"connected","connection":1,"session":1,"request":1,"cookies":[],"selection":{"page":"302","sub":"0002"},"path":"302/0002","query":"a=1"}',
    '{"type":"connected","connection":2,"session":1,"request":1,"cookies":[]}',
    '{"type":"selected","connection":1,"request":2,"path":"303","page":"303","sub":"3F7F","query":"b=2"}',
    '{"type":"selected","connection":1,"request":3,"path":"304","page":"304","sub":"3F7F"}',
  ]) {
    const message = readMessage(line);
    assert.ok(typeof message !== "string", line);
    dispatch(message, events);
  }
  assert.deepEqual(heard, [
    ["connected", 1, { page: 0x302, sub: SUB }, "302/0002", "a=1"],
    ["connected", 1, null, null, null],
    ["selected", 2, { page: 0x303, sub: ANY_SUB }, "303", "b=2"],
    ["selected", 3, { page: 0x304, sub: ANY_SUB }, "304", null],
  ]);
});

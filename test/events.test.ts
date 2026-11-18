// The server's lines, read and handed to a program's events with all they
// carry (protocol 13; viewer-state.md VS-351; server.md SRV-47, SRV-48).

import assert from "node:assert/strict";
import { test } from "node:test";

import { ANY_SUB, dispatch, readMessage, type ServerEvents } from "../src/index.ts";

/** The sub-page the first connection selects. */
const SUB = 2;
/** A handle as the server writes one: 32 lower-case hexadecimal digits (VS-305). */
const HANDLE = "0123456789abcdef0123456789abcdef";

/** Events that each record what they heard. */
function recording(heard: unknown[]): ServerEvents {
  return {
    start: (epochMs) => {
      heard.push(["start", epochMs]);
    },
    input: (connection, page, sub, input) => {
      heard.push(["input", connection, page, sub, input.kind]);
    },
    left: (connection, page) => {
      heard.push(["left", connection, page]);
    },
    gone: (connection) => {
      heard.push(["gone", connection]);
    },
    viewerBegan: (connection, viewer, remembered) => {
      heard.push(["viewer_began", connection, viewer, remembered]);
    },
    viewerLeft: (connection) => {
      heard.push(["viewer_left", connection]);
    },
    stateRefused: (connection, reason) => {
      heard.push(["state_refused", connection, reason]);
    },
    viewersReset: () => {
      heard.push(["viewers_reset"]);
    },
    stats: () => {
      heard.push(["stats"]);
    },
    refused: (refusal) => {
      heard.push(["refused", refusal]);
    },
    measured: (request) => {
      heard.push(["measured", request]);
    },
    describe: (page) => {
      heard.push(["describe", page]);
    },
    soundBuilt: (report) => {
      heard.push(["sound_built", report]);
    },
    connected: (connection, request, selection, path, query, viewer, remembered) => {
      heard.push(["connected", connection, request, selection, path, query, viewer, remembered]);
    },
    selected: (_connection, request, selection, path, query) => {
      heard.push(["selected", request, selection, path, query]);
    },
  };
}

function heardOf(lines: readonly string[]): unknown[] {
  const heard: unknown[] = [];
  const events = recording(heard);
  for (const line of lines) {
    const message = readMessage(line);
    assert.ok(typeof message !== "string", `${line}: ${JSON.stringify(message)}`);
    dispatch(message, events);
  }
  return heard;
}

test("the server's lines reach the events with their path, query and viewer", () => {
  assert.deepEqual(
    heardOf([
      `{"type":"connected","connection":1,"request":1,"remembered":true,"viewer":"${HANDLE}","selection":{"page":"302","sub":"0002"},"path":"302/0002","query":"a=1"}`,
      '{"type":"connected","connection":2,"request":1,"remembered":false}',
      '{"type":"selected","connection":1,"request":2,"path":"303","page":"303","sub":"3F7F","query":"b=2"}',
      '{"type":"selected","connection":1,"request":3,"path":"304","page":"304","sub":"3F7F"}',
    ]),
    [
      ["connected", 1, 1, { page: 0x302, sub: SUB }, "302/0002", "a=1", HANDLE, true],
      ["connected", 2, 1, null, null, null, null, false],
      ["selected", 2, { page: 0x303, sub: ANY_SUB }, "303", "b=2"],
      ["selected", 3, { page: 0x304, sub: ANY_SUB }, "304", null],
    ],
  );
});

test("VS-351: gone and the viewer's messages reach their events", () => {
  assert.deepEqual(
    heardOf([
      `{"type":"viewer_began","connection":3,"viewer":"${HANDLE}","remembered":false}`,
      '{"type":"viewer_left","connection":3}',
      '{"type":"state_refused","connection":3,"reason":"no_gesture"}',
      '{"type":"viewers_reset"}',
      '{"type":"gone","connection":3}',
    ]),
    [["viewer_began", 3, HANDLE, false], ["viewer_left", 3], ["state_refused", 3, "no_gesture"], ["viewers_reset"], ["gone", 3]],
  );
});

test("TS-18, TS-22, TS-23: a refusal of a sound and a report of a sound reach their events unchanged, and malformed ones are refused", () => {
  const refused = {
    type: "refused",
    message: "sound",
    path: "music.events[0]",
    rule: "no_opening_update",
    detail: "d",
    sound: { kind: "synth6581", handle: 4, generation: 0 },
  };
  const built = {
    type: "sound_built",
    kind: "synth7",
    handle: 41,
    generation: 0,
    blocks: 100,
    bytes: 2000,
    longest_block: 40,
    banks_lifted: [{ handle: 40, generation: 0 }],
    dropped: { escapes: 0, meta_events: 0, not_taken: 0, system_messages: 0, unmapped_channel: 2 },
  };
  assert.deepEqual(heardOf([JSON.stringify(refused), JSON.stringify(built)]), [
    ["refused", refused],
    ["sound_built", built],
  ]);
  assert.equal(typeof readMessage(JSON.stringify({ ...refused, sound: { kind: "nothing" } })), "string", "a refusal naming no kind");
  assert.equal(typeof readMessage(JSON.stringify({ ...built, blocks: 0 })), "string", "a report of no blocks");
  assert.equal(typeof readMessage('{"type":"closed","session":1}'), "string", "protocol 12's closed is no message of 13");
});

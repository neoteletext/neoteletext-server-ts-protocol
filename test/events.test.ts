// The server's lines, read and handed to a program's events with all they
// carry (protocol 15; viewer-state.md VS-351; server.md SRV-47, SRV-48;
// page-rules.md RULE-37, RULE-38, RULE-48).

import assert from "node:assert/strict";
import { test } from "node:test";

import { ANY_SUB, dispatch, readMessage, type ServerEvents } from "../src/index.ts";

/** The sub-page the first connection selects. */
const SUB = 2;
/** A handle as the server writes one: 32 lower-case hexadecimal digits (VS-305). */
const HANDLE = "0123456789abcdef0123456789abcdef";

/** The events of a page's rules, each recording what it heard. */
function recordingRules(heard: unknown[]): Pick<ServerEvents, "input" | "ruleEvent" | "pageState" | "rulesFault"> {
  return {
    input: (connection, page, sub, input) => {
      heard.push(["input", connection, page, sub, input]);
    },
    ruleEvent: (event) => {
      heard.push(["rule_event", event]);
    },
    pageState: (state) => {
      heard.push(["page_state", state]);
    },
    rulesFault: (fault) => {
      heard.push(["rules_fault", fault]);
    },
  };
}

/** The events of a page asked for with no connection: a description and a snapshot. */
function recordingPages(heard: unknown[]): Pick<ServerEvents, "describe" | "snapshot"> {
  return {
    describe: (page) => {
      heard.push(["describe", page]);
    },
    snapshot: (snapshot, selection, path) => {
      heard.push(["snapshot", snapshot, selection, path]);
    },
  };
}

/** Events that each record what they heard. */
function recording(heard: unknown[]): ServerEvents {
  return {
    ...recordingRules(heard),
    ...recordingPages(heard),
    start: (epochMs) => {
      heard.push(["start", epochMs]);
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
    measuredPictureText: (measured) => {
      heard.push(["measured_picture_text", measured]);
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

test("PAR-22: measured_picture_text reaches its event unchanged", () => {
  const measured = { type: "measured_picture_text", request: 17, cells: 12, regis_bytes: 96, naplps_bytes: 40, sets: ["G0-Arabic-Plain"], stand_ins: 0 };
  assert.deepEqual(heardOf([JSON.stringify(measured)]), [["measured_picture_text", measured]]);
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

test("RULE-37, RULE-38, RULE-48: an input with its rule and row, a rule's event, a page's state and a table's fault reach their events with all they carry", () => {
  const input =
    '{"type":"input","connection":7,"page":"101","sub":"0001","lost":false,"rule":"typed","row":null,"tick":412,"target":null,"event":{"kind":"key","action":"press","key":"a","base":null,"mods":0,"text":"a"}}';
  const pointed =
    '{"type":"input","connection":7,"page":"101","sub":"0001","lost":false,"rule":"down","row":4,"tick":413,"target":{"control":3},"event":{"kind":"hover","action":"enter","column":2,"row":3}}';
  const fired = { type: "rule_event", connection: 7, page: "101", sub: "0001", rule: "hot", row: null, tick: 9031, event: { kind: "fired" } };
  // A report of a run no rule made names no rule (RULE-37).
  const value = { ...fired, rule: null, event: { kind: "value", read: { of: "variable", variable: "v0" }, value: 5 } };
  const state = {
    type: "page_state",
    connection: 7,
    page: "101",
    sub: "0001",
    request: 42,
    tick: 9120,
    table: true,
    variables: [4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    timers: { t0: { running: true, elapsed: 18 } },
    sequences: { pulse: { running: true, waiting: false, passes: 3, position: 12 } },
    targets: [{ target: { object: 301 }, exists: true, shown: true, look: "normal", frame: 0, x: 700, y: 380, layer: 2, order: 0, cycling: false }],
    values: [{ read: { of: "sound", channel: 0, property: "level" }, value: 41 }],
  };
  const fault = { type: "rules_fault", connection: 7, page: "101", sub: "0001", generation: 3, fault: "evaluation_late", count: 12 };
  assert.deepEqual(heardOf([input, pointed, ...[fired, value, state, fault].map((message) => JSON.stringify(message))]), [
    ["input", 7, 0x101, 1, { kind: "key", action: "press", key: "a", text: "a", rule: "typed", ruleRow: null, tick: 412, target: null }],
    ["input", 7, 0x101, 1, { kind: "hover", action: "enter", column: 2, row: 3, rule: "down", ruleRow: 4, tick: 413, target: { control: 3 } }],
    ["rule_event", fired],
    ["rule_event", value],
    ["page_state", state],
    ["rules_fault", fault],
  ]);
  assert.equal(typeof readMessage(input.replace('"rule":"typed",', "")), "string", "an input names its rule (RULE-37)");
  assert.equal(typeof readMessage(JSON.stringify({ ...fault, fault: "tick_overrun" })), "string", "a fault outside RULE-48's list");
  assert.equal(typeof readMessage(JSON.stringify({ ...state, armed: 0 })), "string", "a page's state has no armed runs (DEC-6635 item 6)");
  assert.equal(typeof readMessage(JSON.stringify({ ...state, variables: [0] })), "string", "a page's state has its sixteen variables (RULE-38)");
});

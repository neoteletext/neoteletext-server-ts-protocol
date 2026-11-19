// The server's bytes split into bounded lines, and the line loop that
// hands each valid one on.

import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import { LineSplitter, LONGEST_LINE, PROTOCOL, ProtocolVersionError, readMessage, serveLines, type ServerEvents } from "../src/index.ts";
import { serverStats } from "../src/testing/index.ts";
import { START_LINE } from "./fixtures/start-line.ts";

/** The keyboard's focus coming to page 100, as the server writes it. */
const SELECTED_LINE = '{"type":"selected","connection":3,"request":2,"path":"100","page":"100","sub":"3F7F"}';
const CONNECTED_LINE = '{"type":"connected","connection":3,"request":1,"remembered":false,"selection":null}';
/** The server's start, 5 ms after the epoch. */
const START_AT_5 = START_LINE.replace('"epoch_ms":0', '"epoch_ms":5');
const FOCUS_LINE = '{"type":"input","connection":3,"page":"100","sub":"3F7F","lost":false,"rule":"focus","tick":0,"event":{"kind":"focus"}}';

test("lines are split across chunks, a return before the newline dropped", () => {
  const lines: string[] = [];
  const faults: string[] = [];
  const splitter = new LineSplitter(
    (line) => {
      lines.push(line);
    },
    (why) => {
      faults.push(why);
    },
  );
  // Each chunk arrives on its own, a line and a character split across them.
  for (const chunk of [Buffer.from('{"a":1}\n{"b"'), Buffer.from(":2}\r\n\n"), Buffer.from([0xe2, 0x82]), Buffer.from([0xac, 0x0a]), Buffer.from("last")]) {
    splitter.push(chunk);
  }
  splitter.end();
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}', "€", "last"]);
  assert.deepEqual(faults, []);
});

test("a line too long, or not UTF-8, is dropped whole and reported", () => {
  const lines: string[] = [];
  const faults: string[] = [];
  const splitter = new LineSplitter(
    (line) => {
      lines.push(line);
    },
    (why) => {
      faults.push(why);
    },
  );
  const half = Buffer.alloc(LONGEST_LINE / 2 + 1, 0x61);
  for (const chunk of [half, half, Buffer.from("tail\nnext\n"), Buffer.from([0xff, 0x0a])]) {
    splitter.push(chunk);
  }
  assert.deepEqual(lines, ["next"]);
  assert.equal(faults.length, 2);
  assert.match(faults[0] ?? "", /over/u);
  assert.match(faults[1] ?? "", /UTF-8/u);
});

/** An event this test does not listen for. */
const ignored = (): void => undefined;
/** The events of viewers and sounds, which this test does not listen for. */
const QUIET = {
  viewerBegan: ignored,
  viewerLeft: ignored,
  stateRefused: ignored,
  viewersReset: ignored,
  soundBuilt: ignored,
  ruleEvent: ignored,
  pageState: ignored,
  rulesFault: ignored,
  measured: ignored,
  measuredPictureText: ignored,
  describe: ignored,
  snapshot: ignored,
};

test("the line loop hands on each valid line, reports each bad one, and ends with its input", async () => {
  const input = new PassThrough();
  const errors: string[] = [];
  const heard: string[] = [];
  const events: ServerEvents = {
    start: (epochMs) => {
      heard.push(`start ${epochMs}`);
    },
    connected: (connection, _request, selection) => {
      heard.push(`connected ${connection} ${selection === null ? "none" : selection.page.toString(16)}`);
    },
    selected: (connection, _request, selection) => {
      heard.push(`selected ${connection} ${selection.page.toString(16)} ${selection.sub.toString(16)}`);
    },
    left: (connection, page) => {
      heard.push(`left ${connection} ${page.toString(16)}`);
    },
    input: (connection, page, _sub, event) => {
      heard.push(`input ${connection} ${page.toString(16)} ${event.kind}`);
    },
    gone: (connection) => {
      heard.push(`gone ${connection}`);
    },
    ...QUIET,
    stats: (stats) => {
      heard.push(`stats ${stats.server.uptime_s} ${stats.channel.most_opened.map(({ page, opens }) => `${page}:${opens}`).join(",")}`);
    },
    refused: (refusal) => {
      heard.push(`refused ${refusal.rule}`);
    },
  };
  const served = serveLines(events, {
    input,
    output: () => assert.fail("nothing is written"),
    errors: (text) => {
      errors.push(text);
    },
  });
  input.write(`${START_AT_5}\n${CONNECTED_LINE}\nnonsense\n`);
  input.write(`${SELECTED_LINE}\n${FOCUS_LINE}\n`);
  const stats = serverStats({ server: { uptime_s: 10 }, channel: { viewers: 1, most_opened: [{ page: "100", opens: 3 }] } });
  input.write(`${JSON.stringify({ type: "stats", ...stats })}\n${SELECTED_LINE.replace("}", ',"view":0}')}\n`);
  input.end('{"type":"left","connection":3,"page":"100"}\n{"type":"gone","connection":3}');
  await served;
  assert.deepEqual(heard, ["start 5", "connected 3 none", "selected 3 100 3f7f", "input 3 100 focus", "stats 10 100:3", "left 3 100", "gone 3"]);
  assert.equal(errors.length, 2);
  assert.match(errors[0] ?? "", /not JSON/u);
  assert.match(errors[1] ?? "", /unknown_field/u, "a view number is no field of protocol 3 (DEC-1527)");
});

function never(): void {
  assert.fail("nothing is handed on");
}

/** Events that fail the test when any is heard. */
function unheard(): ServerEvents {
  return {
    start: never,
    connected: never,
    selected: never,
    input: never,
    left: never,
    gone: never,
    viewerBegan: never,
    viewerLeft: never,
    stateRefused: never,
    viewersReset: never,
    soundBuilt: never,
    ruleEvent: never,
    pageState: never,
    rulesFault: never,
    stats: never,
    refused: never,
    measured: never,
    measuredPictureText: never,
    describe: never,
    snapshot: never,
  };
}

test("REQ-2215 item 3: a start of another protocol stops the program, both versions named, before anything is handed on or sent", async () => {
  const input = new PassThrough();
  const errors: string[] = [];
  const served = serveLines(unheard(), {
    input,
    output: () => assert.fail("nothing is written"),
    errors: (text) => {
      errors.push(text);
    },
  });
  // RAS-10: the kit speaks 16 and stops on a server of 15, whose NAPLPS coordinates were the 640 by 480 picture's.
  assert.equal(PROTOCOL, 16);
  const other = PROTOCOL - 1;
  input.write(`${START_LINE.replace(`"protocol":${PROTOCOL}`, `"protocol":${other}`)}\n{"type":"gone","connection":1}\n`);
  await assert.rejects(served, (error: unknown) => error instanceof ProtocolVersionError && error.server === other);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", new RegExp(`protocol ${other}.*protocol ${PROTOCOL}`, "u"), "both versions are named");
});

test("REQ-2215 and REQ-2216: start's languages, measured and a refusal's request are read", () => {
  const start = readMessage(START_LINE);
  assert.ok(typeof start !== "string" && start.type === "start");
  assert.deepEqual(
    start.languages.find(({ tag }) => tag === "he"),
    { tag: "he", name: "Hebrew", direction: "rtl" },
  );
  assert.equal(start.languages.find(({ tag }) => tag === "ar")?.direction, "rtl");
  const measured = readMessage(
    '{"type":"measured","request":7,"triplets":5,"limit":208,"designation":{"default":0,"second":null},"runs":[{"cells":6,"triplets":3}]}',
  );
  assert.deepEqual(measured, {
    type: "measured",
    request: 7,
    triplets: 5,
    limit: 208,
    designation: { default: 0, second: null },
    runs: [{ cells: 6, triplets: 3 }],
  });
  const refused = readMessage('{"type":"refused","message":"measure","request":9,"path":"page.text[0]","rule":"text_unshown","detail":"U+4E2D"}');
  assert.deepEqual(refused, { type: "refused", message: "measure", request: 9, path: "page.text[0]", rule: "text_unshown", detail: "U+4E2D" });
});

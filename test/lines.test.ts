// The server's bytes split into bounded lines, and the line loop that
// hands each valid one on.

import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import { figure, LineSplitter, LONGEST_LINE, serveLines, type ServerEvents } from "../src/index.ts";

/** The keyboard's focus coming to page 100, as the server writes it. */
const SELECTED_LINE = '{"type":"selected","connection":3,"request":2,"path":"100","page":"100","sub":"3F7F"}';
const FOCUS_LINE = '{"type":"input","connection":3,"page":"100","sub":"3F7F","lost":false,"event":{"kind":"focus"}}';

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

test("the line loop hands on each valid line, reports each bad one, and ends with its input", async () => {
  const input = new PassThrough();
  const errors: string[] = [];
  const heard: string[] = [];
  const events: ServerEvents = {
    start: (epochMs) => {
      heard.push(`start ${epochMs}`);
    },
    connected: (connection, session, _request, selection) => {
      heard.push(`connected ${connection} ${session} ${selection === null ? "none" : selection.page.toString(16)}`);
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
    closed: (session) => {
      heard.push(`closed ${session}`);
    },
    stats: (stats) => {
      heard.push(`stats ${figure(stats.server, "uptime_s")}`);
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
  input.write(
    '{"type":"start","protocol":6,"epoch_ms":5,"standard":{"magazines":8,"pages":2022,"pages_per_magazine":253,"pages_in_magazine_1":251,"keyable_pages":800,"subpages":8190,"decimal_subpages":3199},"budgets":{"line_bytes":16777216,"title_characters":120,"author_log_bytes":200,"log_characters":1000,"named_connections":4096,"reply_limit_ms":5000}}\n{"type":"connected","connection":3,"session":1,"request":1,"cookies":[],"selection":null}\nnonsense\n',
  );
  input.write(`${SELECTED_LINE}\n${FOCUS_LINE}\n`);
  input.write(`{"type":"stats","server":{"uptime_s":10},"channel":{"viewers":1}}\n${SELECTED_LINE.replace("}", ',"view":0}')}\n`);
  input.end('{"type":"left","connection":3,"page":"100"}\n{"type":"closed","session":1}');
  await served;
  assert.deepEqual(heard, ["start 5", "connected 3 1 none", "selected 3 100 3f7f", "input 3 100 focus", "stats 10", "left 3 100", "closed 1"]);
  assert.equal(errors.length, 2);
  assert.match(errors[0] ?? "", /not JSON/u);
  assert.match(errors[1] ?? "", /unknown_field/u, "a view number is no field of protocol 3 (DEC-1527)");
});

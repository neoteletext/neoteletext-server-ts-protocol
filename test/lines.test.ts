// The server's bytes split into bounded lines, and the line loop that
// hands each valid one on.

import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import { figure, LineSplitter, LONGEST_LINE, serveLines, type ServerEvents } from "../src/index.ts";

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
    join: (session) => {
      heard.push(`join ${session}`);
    },
    open: (session, page) => {
      heard.push(`open ${session} ${page.toString(16)}`);
    },
    leave: (session, page) => {
      heard.push(`leave ${session} ${page.toString(16)}`);
    },
    input: (session, page, event) => {
      heard.push(`input ${session} ${page.toString(16)} ${event.kind}`);
    },
    close: (session) => {
      heard.push(`close ${session}`);
    },
    stats: (stats) => {
      heard.push(`stats ${figure(stats.server, "uptime_s")}`);
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
    '{"type":"start","protocol":2,"epoch_ms":5,"standard":{"magazines":8,"pages":2022,"keyable_pages":800,"subpages":8190,"numbered_subpages":8069,"decimal_subpages":3199},"budgets":{"line_bytes":16777216,"title_characters":120}}\n{"type":"join","session":1}\nnonsense\n',
  );
  input.write('{"type":"open","session":1,"page":"100"}\n{"type":"input","session":1,"page":"100","event":{"kind":"focus"}}\n');
  input.write('{"type":"stats","server":{"uptime_s":10},"channel":{"viewers":1}}\n');
  input.end('{"type":"leave","session":1,"page":"100"}\n{"type":"close","session":1}');
  await served;
  assert.deepEqual(heard, ["start 5", "join 1", "open 1 100", "input 1 100 focus", "stats 10", "leave 1 100", "close 1"]);
  assert.equal(errors.length, 2);
  assert.match(errors[0] ?? "", /protocol 2/u);
  assert.match(errors[1] ?? "", /not JSON/u);
});

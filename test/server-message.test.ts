// The server's messages and figures, each read whole and checked.

import assert from "node:assert/strict";
import { test } from "node:test";

import { figure, figuresIn, readMessage } from "../src/index.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";
import { isFields } from "../src/wire/fields.ts";

test("each of the server's messages is read whole", () => {
  const start =
    '{"type":"start","protocol":1,"epoch_ms":1792886400000,"standard":{"magazines":8,"pages":2022,"keyable_pages":800,"subpages":8190,"numbered_subpages":8069,"decimal_subpages":3199},"budgets":{"line_bytes":16777216,"title_characters":120}}';
  assert.deepEqual(readMessage(start), { type: "start", protocol: 1, epochMs: 1_792_886_400_000, limits: SERVER_LIMITS });
  assert.deepEqual(readMessage('{"type":"join","session":7}'), { type: "join", session: 7 });
  assert.deepEqual(readMessage('{"type":"open","session":7,"page":"1A0"}'), { type: "open", session: 7, page: 0x1a0 });
  assert.deepEqual(readMessage('{"type":"leave","session":7,"page":"100"}'), { type: "leave", session: 7, page: 0x100 });
  assert.deepEqual(readMessage('{"type":"input","session":7,"page":"8FF","event":{"kind":"text","text":"hi"}}'), {
    type: "input",
    session: 7,
    page: 0x8ff,
    input: { kind: "text", text: "hi" },
  });
  assert.deepEqual(readMessage('{"type":"close","session":0}'), { type: "close", session: 0 });
  assert.deepEqual(readMessage('{"type":"stats","server":{"uptime_s":10},"channel":{"most_opened":{"110":3}}}'), {
    type: "stats",
    stats: { server: { uptime_s: 10 }, channel: { most_opened: { "110": 3 } } },
  });
});

test("the server's figures are read as whole numbers, and what is not one is none", () => {
  const figures: unknown = JSON.parse('{"viewers":3,"memory_kb":-1,"half":1.5,"text":"7","most_opened":{"1A0":4,"110":4,"100":2,"200":5,"bad":"x"}}');
  assert.ok(isFields(figures));
  assert.equal(figure(figures, "viewers"), 3);
  assert.equal(figure(figures, "memory_kb"), -1, "the server's none, kept");
  assert.equal(figure(figures, "half"), 0);
  assert.equal(figure(figures, "text"), 0);
  assert.equal(figure(figures, "missing"), 0);
  assert.deepEqual(
    figuresIn(figures, "most_opened"),
    [
      ["200", 5],
      ["110", 4],
      ["1A0", 4],
      ["100", 2],
    ],
    "the most first, as the server ranks them, though the parsed object put 100, 110 and 200 first",
  );
  assert.deepEqual(figuresIn(figures, "viewers"), [], "not an object");
});

test("a line that is not a whole, valid message is refused with the reason", () => {
  for (const bad of [
    "",
    "not json",
    "[]",
    '"start"',
    '{"type":"start","protocol":1}',
    '{"type":"start","protocol":1,"epoch_ms":0}',
    '{"type":"start","protocol":1,"epoch_ms":0,"standard":{"magazines":8},"budgets":{"line_bytes":1,"title_characters":1}}',
    '{"type":"join"}',
    '{"type":"join","session":-1}',
    '{"type":"join","session":1.5}',
    '{"type":"join","session":"7"}',
    '{"type":"join","session":9007199254740993}',
    '{"type":"open","session":1,"page":"900"}',
    '{"type":"open","session":1,"page":"0FF"}',
    '{"type":"open","session":1,"page":"1a0"}',
    '{"type":"open","session":1,"page":256}',
    '{"type":"input","session":1,"page":"100","event":{"kind":"key"}}',
    '{"type":"tick","session":1}',
    '{"type":"stats","server":{}}',
    '{"type":"stats","server":[],"channel":{}}',
    "{}",
  ]) {
    assert.equal(typeof readMessage(bad), "string", bad);
  }
});

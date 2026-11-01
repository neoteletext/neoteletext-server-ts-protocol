// Protocol version 5 (DEC-1482): the kit's types against the server's
// schema, through the precompiled validators, and the channel's answers to
// `connected` and `selected`, one sub-page each (REQ-1471, REQ-1472,
// REQ-1501, REQ-1502, REQ-1503).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Application,
  App,
  blankContent,
  checkProgram,
  checkServer,
  type PageEntry,
  type ProgramMessage,
  ProtocolError,
  Screen,
  type WirePage,
} from "../src/index.ts";
import { Harness, SERVER_LIMITS, type Sent } from "../src/testing/index.ts";

const PAGE: WirePage = { page: "100", sub: "0000", ...blankContent() };

test("a valid value of each program message passes the server's schema", () => {
  const messages: ProgramMessage[] = [
    {
      type: "reply",
      connection: 1,
      magazines: [{ magazine: 1, name: "News", pages: [{ page: "100", title: "Index", section: null, subpages: 1 }] }],
      selected: PAGE,
    },
    { type: "page", connections: "all", page: PAGE },
    {
      type: "subpages",
      connections: [1, 2],
      page: "100",
      version: 3,
      subpages: [
        { sub: "0001", title: "One" },
        { sub: "0002", title: null },
      ],
    },
    { type: "index", connections: [1], magazines: [] },
    { type: "redirect", connection: 1, page: "1A0", sub: "3F7F" },
    { type: "sound", connections: [1], kind: "stop", channel: 0, fade_ms: 0 },
    { type: "cookie", connection: 1, name: "seen", value: "1", path: "/", max_age: 60, same_site: "Lax", secure: true, http_only: true },
    { type: "author_log", connections: "all", level: "I", text: "hello", page: null },
    { type: "log", level: "info", event: "application", text: "hello" },
    { type: "packets", connections: [1], packets: "" },
  ];
  for (const message of messages) {
    assert.equal(checkProgram(message), null, JSON.stringify(message));
  }
});

test("what the server refuses is refused by the kit, with the path and the rule", () => {
  const faults: [unknown, string, string][] = [
    [{ type: "page", connections: [1], page: PAGE, view: 0 }, "", "unknown_field"],
    [{ type: "page", connections: [1], page: { ...PAGE, subpages: [] } }, "page", "unknown_field"],
    [{ type: "page", connections: [], page: PAGE }, "connections", "too_short"],
    [{ type: "page", connections: [1], page: { ...PAGE, rows: [] } }, "page.rows", "too_short"],
    [{ type: "subpages", connections: [1], page: "100", version: 0, subpages: [] }, "subpages", "too_short"],
    [{ type: "subpages", connections: [1], page: "100", version: 0, subpages: Array.from({ length: 8191 }, () => ({ sub: "0001" })) }, "subpages", "too_long"],
    [{ type: "subpages", connections: [1], page: "100", version: 0, subpages: [{ sub: "0001", title: "x".repeat(41) }] }, "subpages[0].title", "too_long"],
    [{ type: "redirect", connection: 1, page: "900", sub: "3F7F" }, "page", "wrong_type"],
    [{ type: "publish", page: "100" }, "type", "not_listed"],
  ];
  for (const [message, path, rule] of faults) {
    const fault = checkProgram(message);
    assert.equal(fault?.path, path, JSON.stringify(message).slice(0, 200));
    assert.equal(fault?.rule, rule, JSON.stringify(message).slice(0, 200));
  }
  assert.equal(
    checkProgram({ type: "subpages", connections: [1], page: "100", version: 0, subpages: Array.from({ length: 8190 }, () => ({ sub: "0001" })) }),
    null,
    "8,190 sub-pages are the schema's bound",
  );
  assert.equal(checkServer({ type: "selected", connection: 1, path: "100", page: "100", sub: "3F7F" }), null);
  assert.equal(checkServer({ type: "selected", connection: 1, path: "100", page: "100", sub: "3F7F", view: 0 })?.rule, "unknown_field");
});

test("a message that is not valid is never written", () => {
  const lines: string[] = [];
  const app = new App((line) => {
    lines.push(line);
  });
  app.started(SERVER_LIMITS);
  assert.throws(() => {
    app.send({ type: "redirect", connection: 0, page: "100", sub: "3F7F" });
  }, ProtocolError);
  assert.deepEqual(lines, []);
  app.send({ type: "redirect", connection: 1, page: "100", sub: "3F7F" });
  assert.equal(lines.length, 1);
});

/** A screen with `text` on row 1. */
function drawn(text: string): Screen {
  const screen = new Screen();
  screen.text(1, 0, text);
  return screen;
}

/** The sub-code of the sub-page a `reply` or `page` message carries in `field`. */
function subOf(message: Sent | undefined, field: string): unknown {
  const page: unknown = message?.[field];
  return typeof page === "object" && page !== null && "sub" in page ? page.sub : undefined;
}

/** A page of three sub-pages, put by sub-codes 0003, 0001 and 0002, and a page of one. */
function carousel(): Application {
  return {
    pages: (): PageEntry[] => [
      { page: 0x100, title: "Index" },
      { page: 0x101, title: "Carousel" },
    ],
    start: (context): void => {
      context.publish("channel", 0x100, drawn("index"));
      context.put("channel", 0x101, [
        { screen: drawn("third"), subcode: 3, title: "Third" },
        { screen: drawn("first"), subcode: 1, title: "First" },
        { screen: drawn("second"), subcode: 2 },
      ]);
    },
    input: (_session, _page, _input, context): void => {
      context.put("channel", 0x101, [{ screen: drawn("second, changed"), subcode: 2 }]);
    },
  };
}

test("connected is answered by one reply: the index and the one sub-page selected, then its page's list", () => {
  const harness = new Harness([carousel()]);
  harness.channel.connected(5, 1, { page: 0x101, sub: 0x3f7f }, []);
  const [reply, list, ...rest] = harness.sent;
  assert.equal(reply?.["type"], "reply");
  assert.equal(subOf(reply, "selected"), "0001", "3F7F shows the first sub-page in ascending order (DEC-1526)");
  assert.deepEqual(list, {
    type: "subpages",
    connections: [5],
    page: "101",
    version: 1,
    subpages: [
      { sub: "0001", title: "First" },
      { sub: "0002", title: null },
      { sub: "0003", title: "Third" },
    ],
  });
  assert.deepEqual(rest, []);
});

test("selected is answered by exactly one sub-page: the one asked for, or for 3F7F the first, with the list", () => {
  const harness = new Harness([carousel()]);
  harness.join(1, 0x100);
  const before = harness.sent.length;
  harness.open(1, 0x101, 0x0003);
  const sub = harness.sent.slice(before);
  assert.deepEqual(
    sub.map((message) => message["type"]),
    ["page", "subpages"],
  );
  assert.equal(subOf(sub[0], "page"), "0003");
  const after = harness.sent.length;
  harness.open(1, 0x101, 0x3f7f);
  const page = harness.sent.slice(after);
  assert.deepEqual(
    page.map((message) => message["type"]),
    ["page", "subpages"],
  );
  assert.equal(subOf(page[0], "page"), "0001");
});

test("a sub-page that changes goes to the connections showing it, named, and to no other", () => {
  const harness = new Harness([carousel()]);
  harness.join(1, 0x101);
  harness.open(1, 0x101, 0x0002);
  harness.join(2, 0x101);
  harness.join(3, 0x100);
  const before = harness.sent.length;
  harness.typeText(3, "x");
  const sent = harness.sent.slice(before);
  assert.deepEqual(
    sent.map((message) => [message["type"], message["connections"]]),
    [["page", [1]]],
  );
});

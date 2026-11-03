// Cases of the channel that the rewrite to protocol 2 left without a test,
// listed in item 1 of the to-do TODO-1539: a 3F7F selection answered by the
// first sub-page in ascending order and recorded as the selection
// (DEC-1526, REQ-1502), a page's list sent again when it changes and its
// version wrapping (REQ-1503), the index sent again when a count changes
// (REQ-1477), what the server names cut into lists of `start`'s
// named_connections, log lines cut to `start`'s bounds, and raw packets.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, Screen } from "../src/index.ts";
import { Copies } from "../src/channel/copies.ts";
import { blankContent } from "../src/page/content.ts";
import { Harness, SERVER_LIMITS, type Sent } from "../src/testing/index.ts";

/** Any sub-page (EN 300 706 clause 9.3.1.2). */
const ANY_SUB = 0x3f7f;

/** Packet 1/0 as a stream carries it: Hamming 8/4 of magazine 1 and packet 0, then spaces (EN 300 706 clause 7.1.2). */
const PACKET = Uint8Array.from([0x02, 0x15, ...Array.from({ length: 40 }, () => 0x20)]);

/** A sent sub-page's sub-code. */
function subOf(page: unknown): unknown {
  return typeof page === "object" && page !== null && "sub" in page ? page.sub : undefined;
}

function drawn(text: string): Screen {
  const screen = new Screen();
  screen.text(1, 0, text);
  return screen;
}

/** A channel whose page 100 has the sub-codes `subcodes`, put each by its own; `input` runs on each input. */
function channelOf(subcodes: readonly number[], input?: Application["input"]): Harness {
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.put(
        "channel",
        0x100,
        subcodes.map((subcode) => ({ screen: drawn(`sub ${subcode.toString(16)}`), subcode })),
      );
    },
    ...(input === undefined ? {} : { input }),
  };
  return new Harness([application]);
}

function ofType(sent: readonly Sent[], type: string): Sent[] {
  return sent.filter((message) => message["type"] === type);
}

/** The sub-codes of the `page` messages, in order. */
function subsOf(sent: readonly Sent[]): unknown[] {
  return ofType(sent, "page").map((message) => subOf(message["page"]));
}

test("DEC-1526: a 3F7F selection is answered by the page's first sub-page in ascending order, 0000 first", () => {
  const all = channelOf([0x0002, 0x0000, 0x0001]);
  all.join(1, 0x200);
  all.open(1, 0x100, ANY_SUB);
  assert.deepEqual(subsOf(all.sent), ["0000"]);
  const gaps = channelOf([0x0007, 0x0003]);
  gaps.join(1, 0x200);
  gaps.open(1, 0x100, ANY_SUB);
  assert.deepEqual(subsOf(gaps.sent), ["0003"]);
});

test("DEC-1526: a connection that selected nothing is answered with the initial page's first sub-page", () => {
  const harness = channelOf([0x0005, 0x0004]);
  harness.join(1, 0x100);
  const reply = ofType(harness.sent, "reply")[0];
  assert.equal(subOf(reply?.["selected"]), "0004");
});

test("REQ-1502: the sub-page a 3F7F selection was answered with is the selection: its changes reach the connection, another's do not", () => {
  const harness = channelOf([0x0003, 0x0007], (_session, page, input, context): void => {
    const subcode = input.kind === "text" && input.text === "a" ? 0x0003 : 0x0007;
    context.put("channel", page, [{ screen: drawn(`changed ${subcode}`), subcode }]);
  });
  harness.join(1, 0x200);
  harness.open(1, 0x100, ANY_SUB);
  const before = harness.sent.length;
  harness.typeText(1, "b");
  assert.deepEqual(subsOf(harness.sent.slice(before)), [], "0007 changed: not the selection");
  harness.typeText(1, "a");
  assert.deepEqual(subsOf(harness.sent.slice(before)), ["0003"], "0003 changed: the selection");
});

test("REQ-1503: a page's list is sent again when a sub-code or a title changes, with a new version", () => {
  const harness = channelOf([0x0001, 0x0002], (_session, page, input, context): void => {
    if (input.kind === "text" && input.text === "t") {
      context.put("channel", page, [{ screen: drawn("retitled"), subcode: 0x0001, title: "One" }]);
    } else {
      context.put("channel", page, [{ screen: drawn("three"), subcode: 0x0003 }]);
    }
  });
  harness.join(1, 0x100);
  const lists = (): unknown[] => ofType(harness.sent, "subpages").map((message) => [message["version"], message["subpages"]]);
  const first = lists();
  harness.typeText(1, "t");
  harness.typeText(1, "s");
  const all = lists();
  assert.equal(all.length, first.length + 2, "one list for the title, one for the sub-code");
  assert.deepEqual(all.slice(first.length), [
    [
      2,
      [
        { sub: "0001", title: "One" },
        { sub: "0002", title: null },
      ],
    ],
    [
      3,
      [
        { sub: "0001", title: "One" },
        { sub: "0002", title: null },
        { sub: "0003", title: null },
      ],
    ],
  ]);
  assert.equal(ofType(harness.sent, "index").at(-1)?.["magazines"] !== undefined, true, "the count went from 2 to 3: the index is sent again");
});

test("REQ-1503: a list's version wraps from 65,535 to 0, sixteen bits", () => {
  const copies = new Copies();
  const content = blankContent();
  // The first list of a page is version 1: 0 is the version before any.
  let version = 0;
  for (let change = 0; change <= 0x10000; change += 1) {
    copies.put("channel", 0x100, [{ sub: 1, content, title: String(change) }], true);
    const now = copies.get("channel", 0x100)?.version ?? -1;
    assert.equal(now, version === 0xffff ? 0 : version + 1, `change ${change}`);
    version = now;
  }
});

test("what is sent to many connections goes in lists of at most start's named_connections", () => {
  const limits = { ...SERVER_LIMITS, budgets: { ...SERVER_LIMITS.budgets, namedConnections: 2 } };
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, drawn("one"));
    },
    input: (_session, _page, _input, context): void => {
      context.title(0x100, "Retitled");
      context.packets({ page: 0x100 }, PACKET);
    },
  };
  const harness = new Harness([application], { limits });
  for (const session of [1, 2, 3, 4, 5]) {
    harness.join(session, 0x100);
  }
  const before = harness.sent.length;
  harness.typeText(1, "x");
  const after = harness.sent.slice(before);
  assert.deepEqual(
    ofType(after, "index").map((message) => message["connections"]),
    [[1, 2], [3, 4], [5]],
  );
  assert.deepEqual(
    ofType(after, "packets").map((message) => [message["connections"], message["packets"]]),
    [
      [[1, 2], Buffer.from(PACKET).toString("base64")],
      [[3, 4], Buffer.from(PACKET).toString("base64")],
      [[5], Buffer.from(PACKET).toString("base64")],
    ],
  );
});

test("an author's log line is cut to start's author_log_bytes and an operator's to its log_characters", () => {
  const limits = { ...SERVER_LIMITS, budgets: { ...SERVER_LIMITS.budgets, authorLogBytes: 5, logCharacters: 3 } };
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, drawn("one"));
    },
    input: (_session, _page, _input, context): void => {
      context.authorLog({ connections: "all" }, "I", "ééé");
      context.log("abcdef");
    },
  };
  const harness = new Harness([application], { limits });
  harness.join(1, 0x100);
  harness.typeText(1, "x");
  assert.deepEqual(
    ofType(harness.sent, "author_log").map((message) => message["text"]),
    ["éé"],
    "two two-byte characters: a third would pass 5 bytes",
  );
  assert.deepEqual(
    ofType(harness.sent, "log").map((message) => message["text"]),
    ["abc"],
  );
});

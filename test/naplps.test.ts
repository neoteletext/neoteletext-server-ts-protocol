// A sub-page's NAPLPS (the NAPLPS renderer's REQ-6408 item 4):
// `context.naplps` sends the bytes as a `naplps` message of exact base64,
// to the audience named, with `restart` when asked; and what the server
// would refuse for its form is refused before it is sent.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, Screen } from "../src/index.ts";
import { Harness, SERVER_LIMITS } from "../src/testing/index.ts";
import { pictureFault } from "../src/wire/picture-rules.ts";

/** A full RESET (ESC 2/2 4/6 is not text: bytes as a terminal receives them), then text. */
const HELLO = Uint8Array.from([0x1b, 0x22, 0x46, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
const MORE = Uint8Array.from([0x21]);

test("naplps sends the bytes as base64, a restart when asked and none otherwise", () => {
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Picture" }],
    start: (context): void => {
      context.publish("channel", 0x100, new Screen());
    },
    input: (_session, _page, _input, context): void => {
      context.naplps({ connections: "all" }, 0x100, 0, HELLO, { restart: true });
      context.naplps({ connections: "all" }, 0x100, 0, MORE);
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  const before = harness.sent.length;
  harness.typeText(1, "x");
  const sent = harness.sent.slice(before).filter((message) => message["type"] === "naplps");
  assert.deepEqual(sent, [
    { type: "naplps", connections: "all", page: "100", sub: "0000", restart: true, data: Buffer.from(HELLO).toString("base64") },
    { type: "naplps", connections: "all", page: "100", sub: "0000", restart: false, data: Buffer.from(MORE).toString("base64") },
  ]);
});

test("naplps for no sub-page, or not exact base64, is refused before it is sent", () => {
  const good = { type: "naplps", connections: "all", page: "100", sub: "0000", restart: true, data: Buffer.from(HELLO).toString("base64") } as const;
  assert.equal(pictureFault(good, SERVER_LIMITS), null);
  assert.equal(pictureFault({ ...good, sub: "3F7F" }, SERVER_LIMITS)?.rule, "out_of_range");
  assert.notEqual(pictureFault({ ...good, data: "not base64!" }, SERVER_LIMITS), null);
});

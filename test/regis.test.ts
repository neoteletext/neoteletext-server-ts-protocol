// A sub-page's ReGIS (the server's REQ-6338): `context.regis` sends the
// commands as a `regis` message of exact base64, to the audience named,
// with `restart` when asked; and what the server would refuse for its form
// is refused before it is sent.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, Screen, TextNotWritableError } from "../src/index.ts";
import { Harness, SERVER_LIMITS } from "../src/testing/index.ts";
import { pictureFault } from "../src/wire/picture-rules.ts";

/** A square outlined as numbered drawing 1, then shown. */
const SQUARE = "D(B1)V[0,0][19,0][19,19][0,19][0,0]D(E)D(S1(X100,Y50),C)";

test("regis sends the commands as base64, a restart when asked and none otherwise", () => {
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Picture" }],
    start: (context): void => {
      context.publish("channel", 0x100, new Screen());
    },
    input: (_session, _page, _input, context): void => {
      context.regis({ connections: "all" }, 0x100, 0, SQUARE, { restart: true });
      context.regis({ connections: "all" }, 0x100, 0, new TextEncoder().encode("D(S1(X120),C)"));
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  const before = harness.sent.length;
  harness.typeText(1, "x");
  const sent = harness.sent.slice(before).filter((message) => message["type"] === "regis");
  assert.deepEqual(sent, [
    { type: "regis", connections: "all", page: "100", sub: "0000", restart: true, data: Buffer.from(SQUARE, "latin1").toString("base64") },
    { type: "regis", connections: "all", page: "100", sub: "0000", restart: false, data: Buffer.from("D(S1(X120),C)", "latin1").toString("base64") },
  ]);
});

test("ANIM-19, DEC-6650: regis writes a character to 255 as its one byte and refuses one above, naming it, sending nothing", () => {
  const thrown: unknown[] = [];
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Picture" }],
    start: (context): void => {
      context.publish("channel", 0x100, new Screen());
    },
    input: (_session, _page, _input, context): void => {
      context.regis({ connections: "all" }, 0x100, 0, "T'\u00FF'", { restart: true });
      try {
        // U+0100 has no byte: keeping its low byte would draw "T'" and a NUL.
        context.regis({ connections: "all" }, 0x100, 0, "T'\u{1F600}\u0100'");
      } catch (error) {
        thrown.push(error);
      }
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  const before = harness.sent.length;
  harness.typeText(1, "x");
  const sent = harness.sent.slice(before).filter((message) => message["type"] === "regis");
  assert.deepEqual(
    sent.map((message) => message["data"]),
    [Buffer.from([0x54, 0x27, 0xff, 0x27]).toString("base64")],
  );
  const [error] = thrown;
  assert.ok(error instanceof TextNotWritableError);
  // The index counts characters: the emoji before it is one.
  assert.deepEqual([error.index, error.character], [2, "\u{1F600}"]);
  assert.match(error.message, /^regis: .*U\+1F600.* at index 2 /u);
});

test("regis for no sub-page, or not exact base64, is refused before it is sent", () => {
  const good = { type: "regis", connections: "all", page: "100", sub: "0000", restart: true, data: Buffer.from(SQUARE).toString("base64") } as const;
  assert.equal(pictureFault(good, SERVER_LIMITS), null);
  assert.equal(pictureFault({ ...good, data: "" }, SERVER_LIMITS), null, "a restart with nothing drawn yet");
  assert.equal(pictureFault({ ...good, sub: "3F7F" }, SERVER_LIMITS)?.rule, "out_of_range");
  assert.equal(pictureFault({ ...good, data: "not base64!" }, SERVER_LIMITS)?.rule, "not_base64");
});

test("regisLinks and regisCursor send the server's messages to the audience named", () => {
  const links = [
    { drawing: 12, target: "200" },
    { drawing: 13, target: "web:https://example.org/" },
  ];
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Picture" }],
    start: (context): void => {
      context.publish("channel", 0x100, new Screen());
    },
    input: (_session, _page, _input, context): void => {
      context.regisLinks({ connections: "all" }, 0x100, 0, links);
      context.regisLinks({ connections: "all" }, 0x100, 1, []);
      context.regisCursor({ connections: "all" }, 0x100, 0, 40);
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  const before = harness.sent.length;
  harness.typeText(1, "x");
  const sent = harness.sent.slice(before).filter((message) => message["type"] === "regis_links" || message["type"] === "regis_cursor");
  assert.deepEqual(sent, [
    { type: "regis_links", connections: "all", page: "100", sub: "0000", links },
    { type: "regis_links", connections: "all", page: "100", sub: "0001", links: [] },
    { type: "regis_cursor", connections: "all", page: "100", sub: "0000", drawing: 40 },
  ]);
});

test("drawing links the server would refuse for their form are refused before they are sent", () => {
  const good = { type: "regis_links", connections: "all", page: "100", sub: "0000", links: [{ drawing: 12, target: "200" }] } as const;
  const withLinks = (links: readonly { drawing: number; target: string }[]): ReturnType<typeof pictureFault> => pictureFault({ ...good, links }, SERVER_LIMITS);
  assert.equal(pictureFault(good, SERVER_LIMITS), null);
  assert.equal(withLinks([]), null, "no links removes them");
  assert.equal(pictureFault({ ...good, sub: "3F7F" }, SERVER_LIMITS)?.rule, "out_of_range");
  const many = Array.from({ length: 65 }, (_unused, index) => ({ drawing: index + 1, target: "200" }));
  assert.equal(withLinks(many)?.path, "links");
  assert.equal(withLinks(many.slice(0, 64)), null);
  assert.equal(withLinks([good.links[0], { drawing: 12, target: "300" }])?.path, "links[1].drawing");
  for (const target of ["", "2 00", "200,300", "caf\u00E9", `web:https://example.org/${"a".repeat(8004)}`]) {
    const fault = withLinks([{ drawing: 12, target }]);
    assert.deepEqual([fault?.path, fault?.rule], ["links[0].target", "invalid_drawing_links"], JSON.stringify(target.slice(0, 20)));
  }
  assert.equal(pictureFault({ type: "regis_cursor", connections: "all", page: "100", sub: "3F7F", drawing: 4 }, SERVER_LIMITS)?.rule, "out_of_range");
  assert.equal(pictureFault({ type: "regis_cursor", connections: "all", page: "100", sub: "0000", drawing: 0 }, SERVER_LIMITS), null);
});

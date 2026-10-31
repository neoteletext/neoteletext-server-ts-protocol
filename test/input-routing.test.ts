// Input as the server sends it since DEC-1538, and the answers a viewer can
// otherwise be left without (DEC-1543 items 2 to 4).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type Input, Key, type PageEntry, readMessage } from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";
import { ANY_SUB } from "../src/channel/channel.ts";
import { Recorder, screen } from "./recorder.ts";

function inputLine(fields: Record<string, unknown>): string {
  return JSON.stringify({ type: "input", connection: 1, page: "100", event: { kind: "focus" }, ...fields });
}

/** A sub-page with `text` on it and no links. */
function blank(text: string): { readonly screen: ReturnType<typeof screen> } {
  return { screen: screen(text, [null, null, null, null]) };
}

test("input carries its sub-code and whether the page lost it, and the schema asks for both", () => {
  const message = readMessage(inputLine({ sub: "0002", lost: true, event: { kind: "key", action: "release", key: "a", text: null, base: null } }));
  assert.ok(typeof message !== "string" && message.type === "input");
  assert.equal(message.sub, 2);
  assert.deepEqual(message.input, { kind: "key", action: "release", key: "a", lost: true } satisfies Input);
  const real = readMessage(inputLine({ sub: "0000", lost: false, event: { kind: "key", action: "release", key: "a", text: null, base: null } }));
  assert.ok(typeof real !== "string" && real.type === "input");
  assert.deepEqual(real.input, { kind: "key", action: "release", key: "a" } satisfies Input);
  assert.equal(typeof readMessage(inputLine({ lost: false })), "string", "no sub");
  assert.equal(typeof readMessage(inputLine({ sub: "0000" })), "string", "no lost");
});

test("a coloured key follows the links of the sub-page the input names", () => {
  const twoSubPages: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publishSubpages("channel", 0x100, [{ screen: screen("one", [0x101, null, null, null]) }, { screen: screen("two", [0x102, null, null, null]) }]);
    },
  };
  const harness = new Harness([twoSubPages]);
  harness.join(1, 0x100);
  harness.channel.input(1, 0x100, 2, { kind: "key", action: "press", key: Key.Red });
  assert.deepEqual(harness.redirects(1), [0x102]);
});

test("a selection of a sub-page the page lacks gets a reply with none, then the page", () => {
  const harness = new Harness([new Recorder([{ page: 0x100, title: "Index" }])]);
  harness.channel.connected(5, 5, { page: 0x100, sub: 0x0009 }, []);
  const reply = harness.sent.find((message) => message["type"] === "reply" && message["connection"] === 5);
  assert.equal(reply?.["selected"], null);
  assert.deepEqual(harness.redirects(5), [0x100]);
});

test("a selection of a page no application serves gets a reply with none, then the initial page", () => {
  const harness = new Harness([new Recorder([{ page: 0x100, title: "Index" }])]);
  harness.channel.connected(6, 6, { page: 0x777, sub: ANY_SUB }, []);
  const reply = harness.sent.find((message) => message["type"] === "reply" && message["connection"] === 6);
  assert.equal(reply?.["selected"], null, "the server holds 777 as the selection, and would show this connection nothing else");
  assert.deepEqual(harness.redirects(6), [0x100]);
});

test("two copies of a page never give two lists the same version", () => {
  const own: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publishSubpages("channel", 0x100, [blank("one"), blank("two")]);
    },
    opened: (session, page, context): void => {
      context.publishSubpages(session, page, [blank("mine"), blank("too"), blank("three")]);
    },
    input: (session, page, _input, context): void => {
      context.release(session, page);
    },
  };
  const harness = new Harness([own]);
  harness.join(1, 0x100);
  harness.typeText(1, "x");
  const lists = harness.sent.filter((message) => message["type"] === "subpages");
  assert.equal(lists.length, 2, "the session's list, then the channel's when it is released");
  assert.notEqual(lists[0]?.["version"], lists[1]?.["version"], "the server skips a list whose version the connection holds");
});

test("the keys still select pages on a page the channel does not serve", () => {
  const harness = new Harness([
    new Recorder([
      { page: 0x100, title: "Index" },
      { page: 0x200, title: "Two" },
    ]),
  ]);
  harness.join(1, 0x100);
  for (const digit of "200") {
    harness.channel.input(1, 0x777, ANY_SUB, { kind: "text", text: digit });
  }
  assert.deepEqual(harness.redirects(1), [0x200]);
  assert.deepEqual(harness.errors, []);
});

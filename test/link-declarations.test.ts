// A sub-page's Link Extension links are held to the server's bounds as they
// are declared (REQ-1494, REQ-1479; item 1 of the to-do TODO-1539): each
// bound accepted, and one past it refused before anything is sent.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProgram, Screen, type WirePage } from "../src/index.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";

/** The most page-number and text links a sub-page may have (the engine's page::NUMBER_LINKS and TEXT_LINKS). */
const MOST_LINKS = 8;

function sent(screen: Screen): WirePage["link_extension"] {
  return screen.content().link_extension;
}

test("a key's link is declared once a key, to a target in a form of Appendix E.1, its label within its target's bound", () => {
  const screen = new Screen();
  for (const key of ["red", "green", "yellow", "cyan"] as const) {
    screen.keyLink(key, "101", "123456789");
  }
  screen.keyLink("index", "100");
  screen.keyLink("red", "bbc:102", "12345678");
  assert.deepEqual(
    sent(screen).keys.map(({ key, target }) => [key, target]),
    [
      ["red", "bbc:102"],
      ["green", "101"],
      ["yellow", "101"],
      ["cyan", "101"],
      ["index", "100"],
    ],
    "five keys at most: a key's second link replaces its first",
  );
  assert.throws(() => {
    screen.keyLink("red", "101", "1234567890");
  }, RangeError);
  assert.throws(() => {
    screen.keyLink("red", "bbc:101", "123456789");
  }, RangeError);
  assert.throws(() => {
    screen.keyLink("index", "100", "Index");
  }, RangeError);
  assert.throws(() => {
    screen.keyLink("red", "zzz");
  }, RangeError);
  assert.throws(() => {
    screen.keyLink("red", `https://example.com/${"a".repeat(8000)}`);
  }, RangeError);
  assert.equal(checkProgram({ type: "page", connections: [1], page: { page: "100", sub: "0000", ...screen.content() } }, SERVER_LIMITS), null);
});

test("at most eight page-number links and eight text links, a number never to web:, a text link on rows 1 to 23 within its row", () => {
  const screen = new Screen();
  for (let link = 0; link < MOST_LINKS; link += 1) {
    screen.numberLink(0x200 + link, "101");
    screen.textLink(1 + link, 0, 40, "101");
  }
  assert.throws(() => {
    screen.numberLink(0x300, "101");
  }, RangeError);
  assert.throws(() => {
    screen.textLink(10, 0, 1, "101");
  }, RangeError);
  const other = new Screen();
  assert.throws(() => {
    other.numberLink(0x200, "web:https://example.com");
  }, RangeError);
  for (const [row, column, length] of [
    [0, 0, 1],
    [24, 0, 1],
    [1, 39, 2],
    [1, 40, 1],
    [1, 0, 0],
  ] as const) {
    assert.throws(
      () => {
        other.textLink(row, column, length, "101");
      },
      RangeError,
      `row ${row}, column ${column}, ${length} characters`,
    );
  }
  assert.equal(sent(other).texts.length, 0);
  assert.equal(checkProgram({ type: "page", connections: [1], page: { page: "100", sub: "0000", ...screen.content() } }, SERVER_LIMITS), null);
});

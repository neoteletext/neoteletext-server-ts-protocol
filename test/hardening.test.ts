// TTI and drawings from outside the program are bounded and checked: a row
// never grows past the page, a malformed line stores no NaN, and a cursor,
// a link or a canvas outside the page is refused or cut to it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { COLUMNS, readTti, Screen, Sixels } from "../src/index.ts";

test("an OL line longer than the page is cut at the row's end", () => {
  const [page] = readTti(`PN,10000\nOL,1,${"x".repeat(COLUMNS * 3)}\n`);
  assert.equal(page?.rows[1]?.length, COLUMNS);
});

test("an escape at a line's end, or codes past seven bits, store no code that is not one", () => {
  const [page] = readTti("PN,10000\nOL,2,ab\u001B\nOL,3,é\u{1F600}\n");
  const codes = [...(page?.rows[2] ?? []), ...(page?.rows[3] ?? [])];
  assert.ok(
    codes.every((code) => Number.isInteger(code) && code >= 0 && code <= 0x7f),
    codes.join(","),
  );
});

test("an FL line's malformed or out-of-range fields read as no link", () => {
  const [page] = readTti("PN,10000\nFL,1A0,zz,050,8FF,8FF,100\n");
  assert.deepEqual(page?.links, [0x1a0, null, null, null, null, 0x100]);
});

test("a cursor, a Fastext link or an index link off the page is refused where it is set", () => {
  const screen = new Screen();
  assert.throws(() => {
    screen.cursor(25, 0, 0);
  }, RangeError);
  assert.throws(() => {
    screen.cursor(0, 0, 8);
  }, RangeError);
  assert.throws(() => {
    // Echo, withdrawn by the engine's E.134.
    screen.cursor(0, 0, 1);
  }, RangeError);
  assert.throws(() => {
    screen.cursor(0, Number.NaN, 0);
  }, RangeError);
  assert.throws(() => {
    screen.fastext([Number.NaN, null, null, null]);
  }, RangeError);
  assert.throws(() => {
    screen.indexLink(0x900);
  }, RangeError);
});

test("a canvas is at most a page's sixels, whatever it is asked for", () => {
  const canvas = new Sixels(1e9, Number.POSITIVE_INFINITY);
  assert.deepEqual([canvas.width, canvas.height], [COLUMNS * 2, 0]);
  assert.equal(new Sixels(3.7, -2).width, 3);
});

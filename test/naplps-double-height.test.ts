// Teletext's double height in the NAPLPS builder's text() (neoteletext-common
// docs/naplps-raster.md RAS-8 item 5; TODO-6890): the bytes of a two-row call,
// worked by hand from ANSI X3.110-1983 section 5.3.1's operands and RAS-2's
// mapping, and its upper row's bounds.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Naplps, type PicturePart } from "../src/index.ts";

/** Throws unless `call` throws a RangeError naming `limit`. */
function throwsNaming(call: () => unknown, limit: string): void {
  assert.throws(call, (error: unknown) => error instanceof RangeError && error.message.includes(limit), limit);
}

/** The parts with every bytes part as its bytes' values, for comparing. */
function plain(parts: readonly PicturePart[]): unknown[] {
  return parts.map((part) => (part instanceof Uint8Array ? [...part] : part));
}

/** DOMAIN, fixed-format 5/4 and the logical pel (0, 0) in six bytes (RAS-6). */
const DOMAIN = [0x21, 0x54, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40] as const;

/** TEXT and the double-height field of RAS-8 item 5: 3,276 by 8,904 steps, 000 000 110 011 001 100 and 000 010 001 011 001 000. */
const DOUBLE_HEIGHT_FIELD = [0x22, 0x40, 0x40, 0x40, 0x42, 0x71, 0x5b, 0x49, 0x60] as const;
/** POINT SET at the lower left of row 2, the lower row of double height from row 1, column 0: the dot (0, 59), 93,495.65 up rounded down, 93,495, 010 110 110 100 110 111. */
const ROW_2_COLUMN_0 = [0x24, 0x42, 0x46, 0x46, 0x44, 0x46, 0x47] as const;

test("RAS-8 item 5, TODO-6890: double-height text is the two-row field and the point of the lower row's lower left; its upper row is 1 to 22", () => {
  assert.deepEqual(plain(new Naplps().text("Hi", { row: 1, column: 0, rows: 2 }).parts()), [
    [0x0e, ...DOMAIN, ...DOUBLE_HEIGHT_FIELD, ...ROW_2_COLUMN_0],
    { text: "Hi" },
  ]);
  // Rows 22 and 23, column 39: the dot (468, 479), as single height's row 23.
  assert.deepEqual(plain(new Naplps().text("x", { row: 22, column: 39, rows: 2 }).parts()), [
    [0x0e, ...DOMAIN, ...DOUBLE_HEIGHT_FIELD, 0x24, 0x58, 0x78, 0x48, 0x60, 0x70, 0x58],
    { text: "x" },
  ]);
  // rows: 1 is the call without it.
  assert.deepEqual(plain(new Naplps().text("x", { row: 23, column: 0, rows: 1 }).parts()), plain(new Naplps().text("x", { row: 23, column: 0 }).parts()));
  throwsNaming(() => new Naplps().text("x", { row: 23, column: 0, rows: 2 }), "DISPLAY_LINES");
  throwsNaming(() => new Naplps().text("x", { row: 0, column: 0, rows: 2 }), "DISPLAY_FIRST_LINE");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a program in JavaScript can pass any number
  assert.throws(() => new Naplps().text("x", { row: 1, column: 0, rows: 3 as 2 }), /rows 3 is not an integer from 1 to 2/u);
});

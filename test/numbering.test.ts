// REQ-317 (the engine's, version 2) and REQ-314 part 1: a page given whole
// is numbered by the code of practice. One sub-page is 0000; 2 to 79 are
// 0001 to 0079; more use only sub-codes above 0079, the 3,120 decimal ones
// first (0100 to 3979), then the 4,949 with a hexadecimal digit, 3F7F left
// out, at most 8,069. A program's own sub-codes are kept as given (DEC-1526).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, Screen } from "../src/index.ts";
import { numbered, placeOf } from "../src/page/numbering.ts";
import { Harness, SERVER_LIMITS, type Sent } from "../src/testing/index.ts";

/** The counts at every boundary of the numbering. */
const BOUNDARIES = [1, 2, 79, 80, 3_120, 3_121, 3_199, 3_200, 8_069];
/** The most sub-pages the code of practice numbers (the engine's `SUBCODES_ABOVE_SET`). */
const MOST_NUMBERED = 8_069;
/** 3F7F, no particular sub-page (EN 300 706 clause 9.6.1). */
const ANY_SUB = 0x3f7f;

/** S1 is the low four bits of a sub-code and S3 the four from bit 8 (EN 300 706 clause 9.3.1.2). */
const DIGIT_MASK = 0xf;
const S3_SHIFT = 8;
/** The last decimal digit. */
const LAST_DECIMAL_DIGIT = 9;

/** Whether S1 and S3 of `sub` are decimal digits (S2 and S4 have none above). */
function isDecimal(sub: number): boolean {
  return (sub & DIGIT_MASK) <= LAST_DECIMAL_DIGIT && ((sub >> S3_SHIFT) & DIGIT_MASK) <= LAST_DECIMAL_DIGIT;
}

test("REQ-317: one sub-page is 0000, and 2 to 79 are 0001 to 0079 in decimal", () => {
  assert.deepEqual(numbered(1, SERVER_LIMITS), [0x0000]);
  assert.deepEqual(numbered(2, SERVER_LIMITS), [0x0001, 0x0002]);
  const set = numbered(79, SERVER_LIMITS);
  assert.equal(set.length, 79);
  assert.equal(set[0], 0x0001);
  assert.deepEqual(set.slice(8, 11), [0x0009, 0x0010, 0x0011], "0009 is followed by 0010");
  assert.equal(set.at(-1), 0x0079);
  assert.ok(
    set.every((sub) => isDecimal(sub)),
    "every one decimal",
  );
});

test("REQ-317: more than 79 sub-pages use only sub-codes above 0079, the decimal ones first from 0100", () => {
  const eighty = numbered(80, SERVER_LIMITS);
  assert.deepEqual(eighty.slice(0, 2), [0x0100, 0x0101], "a set of more than 79 starts above 0079");
  assert.deepEqual(eighty.slice(9, 11), [0x0109, 0x0110]);
  assert.equal(eighty.at(-1), 0x0179);
  const decimal = numbered(3_120, SERVER_LIMITS);
  assert.equal(decimal.at(-1), 0x3979, "the 3,120th is the last decimal sub-code");
  assert.ok(decimal.every((sub) => isDecimal(sub)));
  assert.deepEqual(numbered(3_121, SERVER_LIMITS).at(-1), 0x007a, "then the first with a hexadecimal digit, above 0079");
  const many = numbered(3_199, SERVER_LIMITS);
  assert.deepEqual(many.slice(3_119, 3_127), [0x3979, 0x007a, 0x007b, 0x007c, 0x007d, 0x007e, 0x007f, 0x010a]);
  assert.equal(many.at(-1), 0x024a);
  assert.equal(numbered(3_200, SERVER_LIMITS).at(-1), 0x024b);
});

test("REQ-317: at most 8,069 sub-pages are numbered, each once, never 0000 nor 3F7F on several", () => {
  const every = numbered(MOST_NUMBERED, SERVER_LIMITS);
  assert.equal(every.length, MOST_NUMBERED);
  assert.equal(new Set(every).size, MOST_NUMBERED, "each sub-code once");
  assert.ok(every.every((sub) => sub > 0x0079 && sub !== ANY_SUB && (sub & ~ANY_SUB) === 0));
  assert.equal(every.filter((sub) => isDecimal(sub)).length, 3_120);
  assert.equal(every.at(-1), 0x3f7e);
  for (const count of BOUNDARIES.slice(1)) {
    const subs = numbered(count, SERVER_LIMITS);
    assert.equal(subs.length, count);
    assert.ok(!subs.includes(0x0000), `never 0000 for a page of ${count} sub-pages`);
    assert.ok(!subs.includes(ANY_SUB), `never 3F7F for a page of ${count} sub-pages`);
  }
  for (const count of [0, MOST_NUMBERED + 1, 1.5]) {
    assert.throws(() => numbered(count, SERVER_LIMITS), RangeError, `${count} sub-pages are refused`);
  }
});

test("REQ-317: placeOf is numbered's inverse at every boundary, and gives no place to a sub-code not given", () => {
  for (const count of BOUNDARIES) {
    const subs = numbered(count, SERVER_LIMITS);
    for (const [index, sub] of subs.entries()) {
      assert.equal(placeOf(sub, count, SERVER_LIMITS), index + 1, `${sub.toString(16)} of ${count}`);
    }
  }
  assert.equal(placeOf(0x0000, 2, SERVER_LIMITS), null, "0000 is no place on a page of several");
  assert.equal(placeOf(0x0001, 1, SERVER_LIMITS), null);
  assert.equal(placeOf(0x0003, 2, SERVER_LIMITS), null, "past the count");
  assert.equal(placeOf(0x000a, 79, SERVER_LIMITS), null, "not decimal, in the set");
  assert.equal(placeOf(0x0079, 80, SERVER_LIMITS), null, "the set's own, above it");
  assert.equal(placeOf(0x007a, 3_120, SERVER_LIMITS), null, "the hexadecimal ones come after the 3,120 decimal");
  assert.equal(placeOf(0x007a, 3_121, SERVER_LIMITS), 3_121);
  assert.equal(placeOf(ANY_SUB, MOST_NUMBERED, SERVER_LIMITS), null, "never 3F7F");
  assert.equal(placeOf(0x0080, MOST_NUMBERED, SERVER_LIMITS), null, "not a sub-code");
  assert.equal(placeOf(0x0100, MOST_NUMBERED + 1, SERVER_LIMITS), null, "a count not numbered");
});

/** A screen showing `text`. */
function drawn(text: string): Screen {
  const screen = new Screen();
  screen.text(1, 0, text);
  return screen;
}

/** The sub-codes of a `subpages` list, as the protocol writes them. */
function listed(message: Sent | undefined): unknown {
  const subpages: unknown = message?.["subpages"];
  return Array.isArray(subpages) ? subpages.map((entry: { sub: string }) => entry.sub) : undefined;
}

test("REQ-317: a page of 80 sub-pages given whole goes to the server numbered from 0100; a program's own 0000 beside others is kept", () => {
  const app: Application = {
    pages: (): PageEntry[] => [
      { page: 0x100, title: "Whole" },
      { page: 0x101, title: "Own" },
    ],
    start: (context): void => {
      context.publishSubpages(
        "channel",
        0x100,
        Array.from({ length: 80 }, (_, place) => ({ screen: drawn(`place ${place + 1}`) })),
      );
      context.put("channel", 0x101, [
        { screen: drawn("two"), subcode: 0x0002 },
        { screen: drawn("own"), subcode: 0x0000 },
        { screen: drawn("one"), subcode: 0x0001 },
      ]);
    },
    input: (): void => {},
  };
  const harness = new Harness([app]);
  harness.join(1, 0x100);
  const whole = listed(harness.sent.find((message) => message["type"] === "subpages" && message["page"] === "100"));
  assert.ok(Array.isArray(whole));
  assert.equal(whole.length, 80);
  assert.deepEqual(whole.slice(0, 2), ["0100", "0101"]);
  assert.equal(whole.at(-1), "0179");
  const before = harness.sent.length;
  harness.open(1, 0x101, ANY_SUB);
  const own = harness.sent.slice(before).find((message) => message["type"] === "subpages");
  assert.deepEqual(listed(own), ["0000", "0001", "0002"], "kept as given, in ascending order");
});

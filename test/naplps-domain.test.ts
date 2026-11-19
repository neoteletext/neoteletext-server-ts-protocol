// Where the NAPLPS builder writes DOMAIN, and what four-byte coordinates
// reach (renderer parity PAR-40, DEC-6849): twelve bits an axis, a step of
// 1/2048 of the unit screen (ANSI X3.110-1983 section 5.3.2.2.3, Table 5),
// worked by hand.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Naplps, type PicturePart, naplpsLimits } from "../src/index.ts";

/** SO, and DOMAIN (section 5.3.2.2, Figure 14): single values of one byte, multi values of four, two dimensions, then the logical pel (0, 0) in four bytes. */
const SO = 0x0e;
const DOMAIN = [0x21, 0x4c, 0x40, 0x40, 0x40, 0x40] as const;

/** A macro's contents with nothing in them. */
const EMPTY = (): void => {
  // Nothing is drawn.
};

/** The parts with every bytes part as its bytes' values, for comparing. */
function plain(parts: readonly PicturePart[]): unknown[] {
  return parts.map((part) => (part instanceof Uint8Array ? [...part] : part));
}

test("PAR-40, DEC-6849: DOMAIN is written once, again after the builder's own RESET, and by each macro's contents for themselves", () => {
  const SDC = 0x1a;
  const POINT = [0x24, 0x40, 0x40, 0x40, 0x40] as const;
  assert.deepEqual(plain(new Naplps().point(0, 480).point(0, 480).parts()), [[SO, ...DOMAIN, ...POINT, ...POINT, SDC]], "once");
  assert.deepEqual(
    plain(new Naplps().point(0, 480).reset().point(0, 480).parts()),
    [[SO, ...DOMAIN, ...POINT, 0x20, 0x7f, 0x7f, ...DOMAIN, ...POINT, SDC]],
    "RESET restores the default domain",
  );
  assert.deepEqual(
    plain(new Naplps().point(0, 480).text("Hi").point(0, 480).parts()),
    [[SO, ...DOMAIN, ...POINT], { text: "Hi" }, [SO, ...POINT, SDC]],
    "a text part leaves it",
  );
  const macro = new Naplps().point(0, 480).defineMacro(0x21, (contents) => void contents.point(0, 480));
  assert.deepEqual(
    plain(macro.parts()),
    [[SO, ...DOMAIN, ...POINT, 0x1b, 0x40, 0x21, SO, ...DOMAIN, ...POINT, 0x1b, 0x45]],
    "an object's macro starts from the default domain (ANIM-11)",
  );
  assert.deepEqual(plain(new Naplps().defineMacro(0x21, EMPTY).parts()), [[0x1b, 0x40, 0x21, 0x1b, 0x45]], "a definition reads nothing in the domain");
  assert.deepEqual(new Naplps().parts(), [], "nothing drawn, no DOMAIN");
});

test("PAR-40, TODO-6846: a rectangle to the design picture's right edge ends on the largest coordinate, and a coordinate need not be whole", () => {
  const { OBJECT_PICTURE_HEIGHT, OBJECT_PICTURE_WIDTH } = naplpsLimits;
  const [whole] = plain(new Naplps().rect(OBJECT_PICTURE_WIDTH - 1, 0, 1, OBJECT_PICTURE_HEIGHT, { filled: true }).parts());
  // From x = 639, 2045 steps (2044.8 rounded), 011 111 111 101, at the foot, to the largest, 2047: a size of 2 steps,
  // 000 000 000 010, and up the display's whole 1600, 011 001 000 000.
  assert.deepEqual(whole, [SO, ...DOMAIN, 0x33, 0x58, 0x78, 0x78, 0x68, 0x43, 0x41, 0x40, 0x50, 0x1a]);
  // A step is 640/2048 = 5/16 of a design pixel across: x = 5/16 is one step, 000 000 000 001.
  assert.deepEqual(plain(new Naplps().point(5 / 16, 480).parts()), [[SO, ...DOMAIN, 0x24, 0x40, 0x40, 0x40, 0x48, 0x1a]]);
  assert.throws(() => new Naplps().point(Number.NaN, 0), /OBJECT_PICTURE_WIDTH/u);
});

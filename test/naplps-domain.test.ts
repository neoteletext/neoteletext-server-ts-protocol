// Where the NAPLPS builder writes DOMAIN, what six-byte coordinates reach,
// and the page of text every writer must write (neoteletext-common
// docs/naplps-raster.md RAS-2, RAS-6, RAS-8; DEC-6853, DEC-6857): eighteen
// bits an axis, a step of 1/131072 of the unit screen (ANSI X3.110-1983
// section 5.3.2.2.3, Table 5), worked by hand, and every dot of the raster
// decoded as the NAPLPS renderer decodes it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { Naplps, type PicturePart, naplpsLimits } from "../src/index.ts";
import { pictureFields } from "../src/picture/parts.ts";

/** SO, and DOMAIN (section 5.3.2.2, Figure 14): single values of one byte, multi values of six, two dimensions, then the logical pel (0, 0) in six bytes. */
const SO = 0x0e;
const DOMAIN = [0x21, 0x54, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40] as const;
/** A multi-value operand's bytes and an axis's bits in the six-byte domain, three bits of each axis a byte (Figure 11). */
const OPERAND_BYTES = 6;
const AXIS_BITS = 18;
const AXIS_BITS_PER_BYTE = 3;
const AXIS_BYTE_MASK = 0b111;
/** The renderer's sub-pixels a pixel (its `subpixel_of`, RAS-2). */
const SUBPIXELS = 256;

/** A macro's contents with nothing in them. */
const EMPTY = (): void => {
  // Nothing is drawn.
};

/** The parts with every bytes part as its bytes' values, for comparing. */
function plain(parts: readonly PicturePart[]): unknown[] {
  return parts.map((part) => (part instanceof Uint8Array ? [...part] : part));
}

test("PAR-40, RAS-6: DOMAIN is written once, again after the builder's own RESET, and by each macro's contents for themselves", () => {
  const SDC = 0x1a;
  const POINT = [0x24, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40] as const;
  assert.deepEqual(plain(new Naplps().point(0, 479).point(0, 479).parts()), [[SO, ...DOMAIN, ...POINT, ...POINT, SDC]], "once");
  assert.deepEqual(
    plain(new Naplps().point(0, 479).reset().point(0, 479).parts()),
    [[SO, ...DOMAIN, ...POINT, 0x20, 0x7f, 0x7f, ...DOMAIN, ...POINT, SDC]],
    "RESET restores the default domain",
  );
  const macro = new Naplps().point(0, 479).defineMacro(0x21, (contents) => void contents.point(0, 479));
  assert.deepEqual(
    plain(macro.parts()),
    [[SO, ...DOMAIN, ...POINT, 0x1b, 0x40, 0x21, SO, ...DOMAIN, ...POINT, 0x1b, 0x45]],
    "an object's macro starts from the default domain (ANIM-11)",
  );
  assert.deepEqual(plain(new Naplps().defineMacro(0x21, EMPTY).parts()), [[0x1b, 0x40, 0x21, 0x1b, 0x45]], "a definition reads nothing in the domain");
  assert.deepEqual(new Naplps().parts(), [], "nothing drawn, no DOMAIN");
});

test("RAS-6: the whole raster is one rectangle from its bottom left dot to its top right, and a place need not be whole", () => {
  const { RASTER_HEIGHT, RASTER_WIDTH } = naplpsLimits;
  const [whole] = plain(new Naplps().rect(0, 0, RASTER_WIDTH, RASTER_HEIGHT, { filled: true }).parts());
  // From the dot (0, 499), 20 lines below the display area's foot, -4,452.17 up, -4,452 (2^18 - 4,452 = 257,692,
  // 111 110 111 010 011 100), to the dot (479, 0), 130,799 across and 106,629.57 up, 106,630: a displacement of 130,799,
  // 011 111 111 011 101 111, and 111,082, 011 011 000 111 101 010.
  assert.deepEqual(whole, [SO, ...DOMAIN, 0x33, 0x47, 0x46, 0x47, 0x42, 0x43, 0x44, 0x5b, 0x7b, 0x78, 0x5f, 0x6d, 0x7a, 0x1a]);
  // A step is 480/131072 of a dot across: x = 15/4096 is one step, 000 000 000 000 000 001.
  assert.deepEqual(plain(new Naplps().point(15 / 4096, 479).parts()), [[SO, ...DOMAIN, 0x24, 0x40, 0x40, 0x40, 0x40, 0x40, 0x48, 0x1a]]);
  assert.throws(() => new Naplps().point(Number.NaN, 0), /RASTER_WIDTH/u);
});

/** An operand's bytes back to the signed value of each axis (section 5.3.1, Figure 11). */
function axes(bytes: readonly number[]): readonly [number, number] {
  let across = 0;
  let up = 0;
  for (const byte of bytes) {
    across = (across << AXIS_BITS_PER_BYTE) | ((byte >> AXIS_BITS_PER_BYTE) & AXIS_BYTE_MASK);
    up = (up << AXIS_BITS_PER_BYTE) | (byte & AXIS_BYTE_MASK);
  }
  const sign = 2 ** (AXIS_BITS - 1);
  return [across >= sign ? across - 2 * sign : across, up >= sign ? up - 2 * sign : up];
}

test("RAS-2: every dot of the raster, written to the nearest step, is decoded by the renderer's mapping as that dot", () => {
  const { DISPLAY_FIRST_LINE, DISPLAY_HEIGHT_DENOMINATOR, DISPLAY_HEIGHT_NUMERATOR, DISPLAY_LINES, RASTER_HEIGHT, RASTER_WIDTH } = naplpsLimits;
  const steps = 2 ** (AXIS_BITS - 1);
  // SO, DOMAIN and POINT SET's opcode come before the point's operand.
  const operandAt = 1 + DOMAIN.length + 1;
  let checked = 0;
  for (let y = 0; y < RASTER_HEIGHT; y += 1) {
    for (let x = 0; x < RASTER_WIDTH; x += 1) {
      const [bytes] = plain(new Naplps().point(x, y).parts());
      assert.ok(Array.isArray(bytes));
      const [across, up] = axes(bytes.slice(operandAt, operandAt + OPERAND_BYTES).map(Number));
      // The renderer's subpixel_of and pixel_of on a RASTER_WIDTH by DISPLAY_LINES canvas, moved down DISPLAY_FIRST_LINE
      // (RAS-2), in exact integers: sx = floor(across x 480 x 256), sy = (D - 1) x 256 - floor(up x D x 32/25 x 256).
      const subAcross = Math.floor((across * RASTER_WIDTH * SUBPIXELS) / steps);
      const subUp =
        (DISPLAY_LINES - 1) * SUBPIXELS - Math.floor((up * DISPLAY_LINES * DISPLAY_HEIGHT_DENOMINATOR * SUBPIXELS) / (DISPLAY_HEIGHT_NUMERATOR * steps));
      const dotAcross = Math.floor((2 * subAcross + SUBPIXELS) / (2 * SUBPIXELS));
      const dotDown = DISPLAY_FIRST_LINE + Math.floor((2 * subUp + SUBPIXELS) / (2 * SUBPIXELS));
      if (dotAcross !== x || dotDown !== y) {
        assert.fail(`dot (${x}, ${y}) is decoded as (${dotAcross}, ${dotDown})`);
      }
      checked += 1;
    }
  }
  assert.equal(checked, RASTER_WIDTH * RASTER_HEIGHT);
});

/** EN 300 706 Table 36's English national option subset: the codes of the G0 Latin set it replaces, as Unicode. */
const ENGLISH: ReadonlyMap<number, string> = new Map([
  [0x23, "£"],
  [0x5b, "←"],
  [0x5c, "½"],
  [0x5d, "→"],
  [0x5e, "↑"],
  [0x5f, "#"],
]);
/** The G0 Latin set's 94 graphic codes from 2/1 (RAS-8's page cycles through them). */
const FIRST_GRAPHIC = 0x21;
const GRAPHICS = 94;
/** RAS-8's page: rows 1 to 23 of 40 characters, 920 cells. */
const TEXT_COLUMNS = 40;
const FIRST_ROW = 1;
const LAST_ROW = 23;
const PAGE_CELLS = 920;

/** One line of picture-examples.jsonl, as far as this test reads it. */
interface Example {
  readonly example: string;
  readonly parts: readonly unknown[];
}

test("RAS-8: the page of 23 rows of 40 characters, one Noto cell a character, is the shared example naplps-text-page byte for byte", () => {
  const page = new Naplps().reset().clear();
  let cells = 0;
  for (let row = FIRST_ROW; row <= LAST_ROW; row += 1) {
    let text = "";
    for (let column = 0; column < TEXT_COLUMNS; column += 1) {
      const code = FIRST_GRAPHIC + ((row + column) % GRAPHICS);
      text += ENGLISH.get(code) ?? String.fromCodePoint(code);
      cells += 1;
    }
    page.text(text, { row, column: 0 });
  }
  assert.equal(cells, PAGE_CELLS);
  const fields = pictureFields("example", page.parts());
  assert.ok("parts" in fields);
  const carried = fields.parts.map((part) => ("data" in part ? { data: Buffer.from(part.data).toString("base64") } : part));
  const line = readFileSync(join(import.meta.dirname, "fixtures", "picture-examples.jsonl"), "utf8")
    .split("\n")
    .find((each) => each.includes('"example":"naplps-text-page"'));
  assert.ok(line !== undefined, "the shared file holds naplps-text-page");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the shared file's line, compared whole
  const example = JSON.parse(line) as Example;
  assert.deepEqual(carried, example.parts);
});

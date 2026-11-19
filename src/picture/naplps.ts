// A builder of NAPLPS (renderer parity PAR-40): each method appends the
// instructions of ANSI X3.110-1983 it names, in the 7-bit form, and
// `parts()` gives them, with Unicode text as text parts the server writes in
// the provided sets (PAR-5, PAR-21), for `naplps`. Coordinates are dots of
// the 480 by 500 teletext raster (DEC-6853; neoteletext-common
// docs/naplps-raster.md RAS-2, RAS-6), origin at the page's top left and y
// down, the picture drawn on lines DISPLAY_FIRST_LINE to DISPLAY_FIRST_LINE +
// DISPLAY_LINES - 1 (DEC-6857), any number within the raster and not only
// whole dots, and written as unit-screen operands at a six-byte precision
// (section 5.3.2.2.3, Table 5): eighteen bits an axis, a step of 1/131072 of
// the unit screen, the shortest at which a row of 40 characters written as
// one run keeps every character on its Noto cell (RAS-6, RAS-8; section 11
// of that document). The builder sends DOMAIN selecting it before its first PDI or bytes of the
// program's own, and again after its own RESET, which restores the default
// (section 5.3.2.2.1); a macro's contents send their own, since an object's
// macro starts from the default (ANIM-11). Bytes of the program's own are
// read in it, and must leave it in force. Every number is held to the NAPLPS renderer's limits by name
// (naplps-limits.ts), and a call outside one throws, naming it, before
// anything is appended.

// oxlint-disable max-lines -- one method to each instruction PAR-40 names, each with its operands' coding beside it
import type { NaplpsObject } from "../wire/generated/protocol.js";
import type { LanguageTag } from "../wire/languages.ts";
import {
  DEFAULT_PALETTE_BITS,
  DISPLAY_HEIGHT_DENOMINATOR,
  DISPLAY_HEIGHT_NUMERATOR,
  LAYERS,
  MAX_LABEL_BYTES,
  MAX_MACRO_BYTES,
  MAX_OBJECT_FRAMES,
  MAX_VERTICES,
  DISPLAY_FIRST_LINE,
  DISPLAY_LINES,
  RASTER_HEIGHT,
  RASTER_ROW_LINES,
  RASTER_WIDTH,
} from "./naplps-limits.ts";
import type { PicturePart } from "./parts.ts";

/** Shift out and shift in: G1, the PDI set, or G0, the primary set, into the in-use table (sections 4.3.2, 6.1.3.1 and 6.1.3.2). */
const SO = 0x0e;
/** CLEAR SCREEN (section 6.1.2.6). */
const CLEAR_SCREEN = 0x0c;
/** SERVICE DELIMITER CHARACTER, a null operation (section 6.1.6.4), which ends the PDI before it so that it is drawn: a shift does not (the NAPLPS renderer's decoder; TODO-6759). */
const SERVICE_DELIMITER = 0x1a;
/** ESC, and the C1 controls in the 7-bit form, ESC Fe (section 4.3.2): DEF MACRO 8/0 as ESC 4/0 (section 6.2.2.1) and END 8/5 as ESC 4/5 (section 6.2.5). */
const ESC = 0x1b;
const DEF_MACRO = 0x40;
const END = 0x45;
/** The PDI opcodes (section 5.3.1.1, Figure 9). */
const RESET = 0x20;
const DOMAIN = 0x21;
const TEXT = 0x22;
const POINT_SET_ABSOLUTE = 0x24;
const LINE_ABSOLUTE = 0x28;
const SET_RECTANGLE_OUTLINED = 0x32;
const SET_RECTANGLE_FILLED = 0x33;
const SET_POLYGON_OUTLINED = 0x36;
const SET_POLYGON_FILLED = 0x37;
const SET_COLOR = 0x3c;
const SELECT_COLOR = 0x3e;
/** RESET's two bytes (section 5.3.2.9, Tables 14 and 15): byte 1 the DOMAIN to its defaults, colour mode 1 with the default colour map drawing in white, and the display and border to nominal black; byte 2 the text, the blinks, the unprotected fields, the texture, the macros and the DRCS. */
const RESET_EVERYTHING = [0x7f, 0x7f] as const;
/** An operand byte's bit 7, which marks it as data (section 5.3.1.1). */
const OPERAND = 0x40;
/** The data bits of an operand byte, b6 to b1. */
const DATA_BITS = 6;
/**
 * A multi-value operand's bytes in the domain the builder selects (section 5.3.2.2.3, Table 5: six, where the
 * default is three; RAS-6), and its bits of each axis in two dimensions, three to a byte (Figure 11).
 */
const MULTI_VALUE_BYTES = 6;
const AXIS_BITS_PER_BYTE = 3;
const AXIS_BITS = MULTI_VALUE_BYTES * AXIS_BITS_PER_BYTE;
/** A coordinate is a two's complement binary fraction, its most significant bit the sign (section 5.3.1): steps of 1/131072 of the unit screen in eighteen bits. */
const AXIS_STEPS = 2 ** (AXIS_BITS - 1);
const AXIS_MASK = 2 ** AXIS_BITS - 1;
const AXIS_BYTE_MASK = 2 ** AXIS_BITS_PER_BYTE - 1;
/**
 * The largest absolute coordinate, one step short of the unit screen's right and top edges, which an operand's
 * sign bit leaves out (TODO-6846), and the smallest, the unit screen's negative edge: a value is held to them (RAS-2).
 */
const LARGEST_STEP = AXIS_STEPS - 1;
const SMALLEST_STEP = -AXIS_STEPS;
/**
 * The NAPLPS renderer rounds a point to its nearest pixel (sections 5.3.3.4.1 and 5.3.2.2.6), so a dot written to
 * the nearest step lands on its own pixel while a step is under half a dot across and half a line up on the
 * receiver's canvas of RASTER_WIDTH by DISPLAY_LINES (RAS-2): a line is DISPLAY_HEIGHT_NUMERATOR /
 * (DISPLAY_HEIGHT_DENOMINATOR x DISPLAY_LINES) of the unit screen.
 */
if (2 * RASTER_WIDTH >= AXIS_STEPS || 2 * DISPLAY_LINES * DISPLAY_HEIGHT_DENOMINATOR >= DISPLAY_HEIGHT_NUMERATOR * AXIS_STEPS) {
  throw new Error("a step of the operand's precision is half a dot or half a line or more: a dot written to the nearest step may land on its neighbour");
}
/** The raster line the display area's unit-screen bottom, up = 0, lies on: its last line (RAS-2's F + D - 1). */
const DISPLAY_LAST_LINE = DISPLAY_FIRST_LINE + DISPLAY_LINES - 1;
/** Teletext's 40 columns across the raster (RAS-1), each a Noto cell's width of dots. */
const TEXT_COLUMNS = 40;
if (RASTER_WIDTH % TEXT_COLUMNS !== 0) {
  throw new Error("the raster is not a whole number of dots a column");
}
const CELL_DOTS = RASTER_WIDTH / TEXT_COLUMNS;
/** The text rows a picture holds, those of its display area: teletext rows 1 to 23 (DEC-6857 item 1, RAS-8). */
if (DISPLAY_FIRST_LINE % RASTER_ROW_LINES !== 0 || DISPLAY_LINES % RASTER_ROW_LINES !== 0) {
  throw new Error("the display area is not whole teletext rows");
}
const FIRST_TEXT_ROW = DISPLAY_FIRST_LINE / RASTER_ROW_LINES;
const LAST_TEXT_ROW = (DISPLAY_FIRST_LINE + DISPLAY_LINES) / RASTER_ROW_LINES - 1;
/** TEXT's two fixed-format bytes (section 5.3.2.3): no spacing change, path right, no rotation; the cursor and the drawing point move together. The engine's write-text writes the same (RAS-8). */
const TEXT_FORMAT = [0x40, 0x40] as const;
/** DOMAIN's fixed-format byte (section 5.3.2.2.1, Figure 14): single-value operands of one byte (b2 b1, Table 4), multi-value operands of MULTI_VALUE_BYTES (b5 b4 b3, Table 5), two dimensions (b6, section 5.3.2.2.4). */
const MULTI_VALUE_LENGTH_SHIFT = 2;
const DOMAIN_FORMAT = OPERAND | ((MULTI_VALUE_BYTES - 1) << MULTI_VALUE_LENGTH_SHIFT);
/** A colour's bits of each primary in one operand byte, G R B G R B from b6 to b1 (section 5.3.2.5.1): twelve a primary in six bytes. */
const PRIMARY_BITS_PER_BYTE = 2;
const PRIMARY_BITS = MULTI_VALUE_BYTES * PRIMARY_BITS_PER_BYTE;
/** Where each primary's high and low bit of a pair lies in an operand byte, b6 to b1 as bits 5 to 0 (Figure 12: G R B G R B). */
const GREEN_HIGH = 5;
const RED_HIGH = 4;
const BLUE_HIGH = 3;
const GREEN_LOW = 2;
const RED_LOW = 1;
const BLUE_LOW = 0;
/** An 8-bit primary's intensity, written as its eight bits followed by PRIMARY_BITS - 8 zero bits (RAS-6): the renderer keeps a primary's top eight, so every intensity reads back exactly. A colour written shorter than the domain's length is read with zero bits after it (section 5.3.2.2.5), which would take full intensity down a step. */
const INTENSITY_BITS = 8;
const LAST_INTENSITY = 2 ** INTENSITY_BITS - 1;
const PADDING_BITS = PRIMARY_BITS - INTENSITY_BITS;
/** The colour map's entries (2^DEFAULT_PALETTE_BITS), and a single-value operand's entry in its top bits (section 5.3.2.6.2; one byte in the default domain). */
const COLOUR_ENTRIES = 2 ** DEFAULT_PALETTE_BITS;
const ENTRY_SHIFT = DATA_BITS - DEFAULT_PALETTE_BITS;
/** Nominal white, the drawing colour after RESET: entry 011…1, the top of the grey scale (section 5.3.2.5.2). */
const NOMINAL_WHITE = 2 ** (DEFAULT_PALETTE_BITS - 1) - 1;
/** The 96 macro names, codes 2/0 to 7/15 (section 6.2). */
const FIRST_MACRO = 0x20;
const LAST_MACRO = 0x7f;
/** A polygon has at least three vertices. */
const LEAST_VERTICES = 3;
/** The C0 controls end below the space; DEL and the C1 controls are one run: none is in a label (ANIM-11). */
const C0_END = 0x20;
const DEL = 0x7f;
const C1_LAST = 0x9f;

/** A place on the teletext raster, in dots across and lines down from the page's top left (RAS-6). */
export interface RasterPoint {
  readonly x: number;
  readonly y: number;
}

/** A NAPLPS object as a program gives it to {@link Naplps.object}: ANIM-11's fields, in dots of the teletext raster (RAS-4), those left out at their defaults. */
export interface NaplpsObjectSpec {
  /** 1 to 65,535. */
  readonly number: number;
  /** A macro object, drawn by its frame's macro, or a region of the stream's own picture; a macro object when it has frames. */
  readonly kind?: "macro" | "region";
  /** The raster dot of the rectangle's top left. */
  readonly x: number;
  readonly y: number;
  /** Dots across, 1 to `RASTER_WIDTH`: the rectangle is dots x to x + width - 1. */
  readonly width: number;
  /** Lines down, 1 to `RASTER_HEIGHT`: the rectangle is lines y to y + height - 1. */
  readonly height: number;
  /** The raster dot at which the macro, drawn where the stream would draw it, puts the rectangle's top left; 0 for a region. */
  readonly originX?: number;
  readonly originY?: number;
  /** A macro object's frames, 1 to `MAX_OBJECT_FRAMES` macro codes. */
  readonly frames?: readonly number[];
  /** Shown; true when left out. */
  readonly shown?: boolean;
  /** Pointer triggers see it; false when left out. */
  readonly detectable?: boolean;
  /** 1 to `LAYERS` - 1; 1 when left out. */
  readonly layer?: number;
  /** Its order within the layer, -128 to 127; 0 when left out. */
  readonly order?: number;
  /** The macros drawn as its hover, pressed and alternative looks. */
  readonly hover?: number;
  readonly pressed?: number;
  readonly alternative?: number;
  /** A region's cover: the colour-map entry that fills it while it is hidden. */
  readonly cover?: number;
  /** What a screen reader says for it: at most `MAX_LABEL_BYTES` of UTF-8, no control character. */
  readonly label?: string;
}

/** The order an object's rectangle takes within its layer (ANIM-11: a signed byte). */
const LEAST_ORDER = -128;
const MOST_ORDER = 127;
/** An object's number (ANIM-11). */
const MOST_OBJECT_NUMBER = 65_535;
/** An object's coordinates and origin are signed 16-bit (ANIM-11). */
const LEAST_SIGNED = -32_768;
const MOST_SIGNED = 32_767;

/** Throws unless `value` is an integer from `least` to `most`, naming the call, what it is and the bound by its name. */
function within(call: string, what: string, value: number, least: number, most: number, bound: string): void {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`Naplps.${call}: ${what} ${String(value)} is not an integer from ${least} to ${most} (${bound})`);
  }
}

/** Throws unless `value` is a number from `least` to `most`, whole or not (a place between dots: a step of the operand is finer than a dot), naming the call, what it is and the bound by its name. */
function between(call: string, what: string, value: number, least: number, most: number, bound: string): void {
  if (!Number.isFinite(value) || value < least || value > most) {
    throw new RangeError(`Naplps.${call}: ${what} ${String(value)} is not a number from ${least} to ${most} (${bound})`);
  }
}

/** Throws unless (`x`, `y`) lies on the raster, 0 to RASTER_WIDTH - 1 across and 0 to RASTER_HEIGHT - 1 down (RAS-6). */
function onRaster(call: string, x: number, y: number): void {
  between(call, "x", x, 0, RASTER_WIDTH - 1, "RASTER_WIDTH");
  between(call, "y", y, 0, RASTER_HEIGHT - 1, "RASTER_HEIGHT");
}

/** How a place between steps is rounded (RAS-2): to the nearest, a tie up, towards plus infinity; or down, towards minus infinity. */
type Rounding = "nearest" | "down";

/** `steps` steps, not necessarily whole, rounded and held to the operand's signed range, SMALLEST_STEP to LARGEST_STEP (RAS-2). */
function held(steps: number, rounding: Rounding): number {
  const whole = rounding === "nearest" ? Math.floor(steps + 1 / 2) : Math.floor(steps);
  return Math.min(Math.max(whole, SMALLEST_STEP), LARGEST_STEP);
}

/**
 * The raster place (`x`, `y`) on the unit screen, in steps (RAS-2, the renderer's `dot_steps`): across X / RASTER_WIDTH
 * of the unit's width; up, (DISPLAY_LAST_LINE - Y) lines of the display area's DISPLAY_LINES, which span the share
 * DISPLAY_HEIGHT_NUMERATOR / DISPLAY_HEIGHT_DENOMINATOR of the unit's width the display shows (the NAPLPS renderer's
 * surface; Appendix B), measured up from the centre of the bottom line. A whole dot's value is never a tie: 480 and
 * 14,720 have odd factors no power of two cancels, and a fraction's quotient is at least 1/14,720 from a whole number,
 * far more than a double's error.
 */
function dotSteps(x: number, y: number, rounding: Rounding): readonly [number, number] {
  const across = (x * AXIS_STEPS) / RASTER_WIDTH;
  const up = ((DISPLAY_LAST_LINE - y) * DISPLAY_HEIGHT_NUMERATOR * AXIS_STEPS) / (DISPLAY_HEIGHT_DENOMINATOR * DISPLAY_LINES);
  return [held(across, rounding), held(up, rounding)];
}

/** The height of a text call's characters in teletext rows: one, or two for teletext's double height (EN 300 706 Table 26, code 0/D). */
export type TextRows = 1 | 2;
const SINGLE_HEIGHT: TextRows = 1;
const DOUBLE_HEIGHT: TextRows = 2;
/** Where and how a text call writes (RAS-8): the cell of its first character, its height in rows, and its text part's language and whether it is outside the page's own text. */
export interface NaplpsTextOptions {
  readonly row: number;
  readonly column: number;
  readonly rows?: TextRows;
  readonly language?: LanguageTag;
  readonly outside?: boolean;
}
/** The field `rows` teletext rows high: a column across and `rows` rows' RASTER_ROW_LINES up, each rounded down. */
function textField(rows: TextRows): readonly [number, number] {
  return [
    held(AXIS_STEPS / TEXT_COLUMNS, "down"),
    held((rows * RASTER_ROW_LINES * DISPLAY_HEIGHT_NUMERATOR * AXIS_STEPS) / (DISPLAY_HEIGHT_DENOMINATOR * DISPLAY_LINES), "down"),
  ];
}
/**
 * TEXT's character field (section 5.3.2.3.4; RAS-8 item 1): a column, 1/TEXT_COLUMNS of the unit screen, across, and
 * a row's RASTER_ROW_LINES of the display area's DISPLAY_LINES up, each rounded down to a hair under one Noto cell,
 * 3,276 by 4,452 steps, so that the renderer, which covers the pixels whose centres lie inside the field, never
 * covers a thirteenth dot or a twenty-first line.
 */
const TEXT_FIELD = textField(SINGLE_HEIGHT);
/**
 * The double-height field (RAS-8 item 5; TODO-6890, DEC-6889): a column across and two rows up, each rounded down,
 * 3,276 by 8,904 steps, 11.9971 dots by 39.9984 lines, a hair under two cells; drawn by the NAPLPS renderer with the engine's Noto glyphs,
 * every glyph row lands on two raster lines, the same pixels as the engine's own teletext double height.
 */
const DOUBLE_HEIGHT_FIELD = textField(DOUBLE_HEIGHT);

/** A multi-value operand of two axes in steps (section 5.3.1, Figure 11): three bits of x and three of y to a byte, most significant first. */
function multiValue(across: number, up: number): number[] {
  const x = across & AXIS_MASK;
  const y = up & AXIS_MASK;
  const bytes: number[] = [];
  for (let shift = AXIS_BITS - AXIS_BITS_PER_BYTE; shift >= 0; shift -= AXIS_BITS_PER_BYTE) {
    bytes.push(OPERAND | (((x >> shift) & AXIS_BYTE_MASK) << AXIS_BITS_PER_BYTE) | ((y >> shift) & AXIS_BYTE_MASK));
  }
  return bytes;
}

/** Bit `at` of `value`. */
function bit(value: number, at: number): number {
  return (value >> at) & 1;
}

/** A colour operand (section 5.3.2.5.1, Figure 12; RAS-6): each 8-bit primary then PADDING_BITS zero bits, two bits to a byte, G R B G R B from b6 to b1. */
function colourValue(red: number, green: number, blue: number): number[] {
  const [r, g, b] = [red << PADDING_BITS, green << PADDING_BITS, blue << PADDING_BITS];
  const bytes: number[] = [];
  for (let shift = PRIMARY_BITS - PRIMARY_BITS_PER_BYTE; shift >= 0; shift -= PRIMARY_BITS_PER_BYTE) {
    const high = shift + 1;
    bytes.push(
      OPERAND |
        (bit(g, high) << GREEN_HIGH) |
        (bit(r, high) << RED_HIGH) |
        (bit(b, high) << BLUE_HIGH) |
        (bit(g, shift) << GREEN_LOW) |
        (bit(r, shift) << RED_LOW) |
        (bit(b, shift) << BLUE_LOW),
    );
  }
  return bytes;
}

/** A colour-map entry as SELECT COLOR's single-value operand (section 5.3.2.6.2): the entry in the operand's top bits. */
function entryValue(index: number): number {
  return OPERAND | (index << ENTRY_SHIFT);
}

/** Whether text holds a control: C0, DEL or C1. */
function hasControl(text: string): boolean {
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    if (point < C0_END || (point >= DEL && point <= C1_LAST)) {
      return true;
    }
  }
  return false;
}

/** Throws unless an object's fields are within ANIM-11's bounds, naming the first that is not. */
function checkObject(spec: NaplpsObjectSpec, kind: "macro" | "region", frames: readonly number[], originX: number, originY: number): void {
  within("object", "number", spec.number, 1, MOST_OBJECT_NUMBER, "an object's number");
  within("object", "x", spec.x, LEAST_SIGNED, MOST_SIGNED, "a signed 16-bit coordinate");
  within("object", "y", spec.y, LEAST_SIGNED, MOST_SIGNED, "a signed 16-bit coordinate");
  within("object", "width", spec.width, 1, RASTER_WIDTH, "RASTER_WIDTH");
  within("object", "height", spec.height, 1, RASTER_HEIGHT, "RASTER_HEIGHT");
  within("object", "layer", spec.layer ?? 1, 1, LAYERS - 1, "LAYERS");
  within("object", "order", spec.order ?? 0, LEAST_ORDER, MOST_ORDER, "a signed byte");
  within("object", "originX", originX, LEAST_SIGNED, MOST_SIGNED, "a signed 16-bit coordinate");
  within("object", "originY", originY, LEAST_SIGNED, MOST_SIGNED, "a signed 16-bit coordinate");
  if (kind === "macro") {
    within("object", "the number of frames", frames.length, 1, MAX_OBJECT_FRAMES, "MAX_OBJECT_FRAMES");
    if (spec.cover !== undefined) {
      throw new RangeError("Naplps.object: a macro object has no cover (ANIM-11)");
    }
  } else if (frames.length > 0 || originX !== 0 || originY !== 0) {
    throw new RangeError("Naplps.object: a region has no frames and origin 0 (ANIM-11)");
  }
  for (const frame of frames) {
    within("object", "frame", frame, FIRST_MACRO, LAST_MACRO, "the 96 macro names");
  }
  const looks = { hover: spec.hover, pressed: spec.pressed, alternative: spec.alternative };
  for (const [what, look] of Object.entries(looks)) {
    if (look !== undefined) {
      within("object", what, look, FIRST_MACRO, LAST_MACRO, "the 96 macro names");
    }
  }
  if (spec.cover !== undefined) {
    within("object", "cover", spec.cover, 0, COLOUR_ENTRIES - 1, "DEFAULT_PALETTE_BITS");
  }
  if (spec.label !== undefined && (Buffer.byteLength(spec.label) > MAX_LABEL_BYTES || hasControl(spec.label))) {
    throw new RangeError(`Naplps.object: a label is at most ${MAX_LABEL_BYTES} bytes of UTF-8 with no control character (MAX_LABEL_BYTES)`);
  }
}

/** NAPLPS as a list of parts for `naplps` (PAR-40): each method appends its instructions and answers the builder. */
export class Naplps {
  readonly #parts: PicturePart[] = [];
  /** The bytes since the last text part. */
  #bytes: number[] = [];
  /** The PDI set is in the in-use table, as the builder last left it: SO was sent, and nothing since has shifted back. */
  #drawing = false;
  /** A PDI was sent that nothing has ended yet. */
  #pending = false;
  /** The drawing colour the builder selected last, in colour mode 1; null when it does not know (nothing selected, or bytes of the program's own since). */
  #pen: number | null = null;
  /** Bytes of the program's own were appended since the builder last selected a colour, which may have left colour mode 2 in force. */
  #ownBytes = false;
  /** This builder is a macro's contents, being defined: definitions do not nest (section 6.2.2.1). */
  #inMacro = false;
  /** DOMAIN was sent, and the builder's own RESET has not restored the default since. */
  #domain = false;

  /** A builder of a macro's contents. */
  static #contents(): Naplps {
    const contents = new Naplps();
    contents.#inMacro = true;
    return contents;
  }

  /** A PDI: SO first if the PDI set is not in use, then the opcode and its operands; DOMAIN before it when none is in force. */
  #pdi(opcode: number, operands: readonly number[]): this {
    this.#start();
    return this.#instruction(opcode, operands);
  }

  #instruction(opcode: number, operands: readonly number[]): this {
    if (!this.#drawing) {
      this.#bytes.push(SO);
      this.#drawing = true;
    }
    this.#bytes.push(opcode, ...operands);
    this.#pending = true;
    return this;
  }

  /**
   * DOMAIN (section 5.3.2.2), before the builder's first PDI or bytes of the program's own, and after its own RESET: multi-value operands
   * of MULTI_VALUE_BYTES, and the logical pel, which DOMAIN's own multi-value operand gives in that length (section
   * 5.3.2.2.6), at its default, a point (0, 0).
   */
  #start(): void {
    if (!this.#domain) {
      this.#domain = true;
      this.#instruction(DOMAIN, [DOMAIN_FORMAT, ...multiValue(0, 0)]);
    }
  }

  /** RESET with every bit (section 5.3.2.9): the domain, colour mode 1 with the default map drawing in white, the screen and border to black, the text, blinks, fields, texture, macros and DRCS to their defaults; then DOMAIN again, since RESET restored the default domain. */
  reset(): this {
    this.#instruction(RESET, RESET_EVERYTHING);
    this.#domain = false;
    this.#start();
    this.#pen = NOMINAL_WHITE;
    this.#ownBytes = false;
    return this;
  }

  /** CLEAR SCREEN (section 6.1.2.6): the display to nominal black, or the background colour in colour mode 2, and the cursor home. */
  clear(): this {
    this.#bytes.push(CLEAR_SCREEN);
    this.#pending = false;
    return this;
  }

  /**
   * Sets colour-map entry `index` to red, green and blue intensities, 0 to 255, in colour mode 1: SELECT COLOR with
   * one operand, the entry (section 5.3.2.6.2), then SET COLOR (section 5.3.2.5.1), whose operand keeps each
   * intensity's eight bits. The entry is the drawing colour after it.
   */
  colour(index: number, red: number, green: number, blue: number): this {
    within("colour", "index", index, 0, COLOUR_ENTRIES - 1, "DEFAULT_PALETTE_BITS");
    for (const [what, value] of [
      ["red", red],
      ["green", green],
      ["blue", blue],
    ] as const) {
      within("colour", what, value, 0, LAST_INTENSITY, "an 8-bit intensity");
    }
    this.#pdi(SELECT_COLOR, [entryValue(index)]);
    this.#pdi(SET_COLOR, colourValue(red, green, blue));
    this.#pen = index;
    this.#ownBytes = false;
    return this;
  }

  /** Draws with colour-map entry `index` from now on: SELECT COLOR with one operand, colour mode 1 (section 5.3.2.6.2). */
  pen(index: number): this {
    within("pen", "index", index, 0, COLOUR_ENTRIES - 1, "DEFAULT_PALETTE_BITS");
    this.#pdi(SELECT_COLOR, [entryValue(index)]);
    this.#pen = index;
    this.#ownBytes = false;
    return this;
  }

  /** Moves the drawing point to (`x`, `y`) without drawing: POINT SET (Absolute, Invisible) (section 5.3.3.1.2). */
  point(x: number, y: number): this {
    onRaster("point", x, y);
    return this.#pdi(POINT_SET_ABSOLUTE, multiValue(...dotSteps(x, y, "nearest")));
  }

  /** Draws a line from the drawing point to (`x`, `y`), which becomes the drawing point: LINE (Absolute) (section 5.3.3.2.2). */
  line(x: number, y: number): this {
    onRaster("line", x, y);
    return this.#pdi(LINE_ABSOLUTE, multiValue(...dotSteps(x, y, "nearest")));
  }

  /**
   * The rectangle of dots `x` to `x + width - 1` and lines `y` to `y + height - 1`, whole dots of the raster (RAS-6):
   * SET and RECTANGLE (Outlined), or (Filled) with `filled` (sections 5.3.3.4.4 and 5.3.3.4.5), from POINT SET at its
   * bottom left dot (`x`, `y + height - 1`), its displacement the difference of the top right dot's values and that
   * corner's. A filled one covers from the pixel its near corner rounds to through the pixel its far corner rounds to
   * (sections 5.3.3.4.1 and 5.3.2.2.6), so it covers exactly its dots, and cells drawn by it meet exactly.
   */
  rect(x: number, y: number, width: number, height: number, options: { readonly filled?: boolean } = {}): this {
    within("rect", "x", x, 0, RASTER_WIDTH - 1, "RASTER_WIDTH");
    within("rect", "y", y, 0, RASTER_HEIGHT - 1, "RASTER_HEIGHT");
    within("rect", "width", width, 1, RASTER_WIDTH - x, "RASTER_WIDTH");
    within("rect", "height", height, 1, RASTER_HEIGHT - y, "RASTER_HEIGHT");
    const [left, bottom] = dotSteps(x, y + height - 1, "nearest");
    const [right, top] = dotSteps(x + width - 1, y, "nearest");
    return this.#pdi(options.filled === true ? SET_RECTANGLE_FILLED : SET_RECTANGLE_OUTLINED, [
      ...multiValue(left, bottom),
      ...multiValue(right - left, top - bottom),
    ]);
  }

  /**
   * A polygon through `points`, 3 to `MAX_VERTICES`: SET and POLYGON (Outlined), or (Filled) with `filled` (sections
   * 5.3.3.5.4 and 5.3.3.5.5), the first point absolute and each next a displacement from the one before, closed back
   * to the first.
   */
  polygon(points: readonly RasterPoint[], options: { readonly filled?: boolean } = {}): this {
    within("polygon", "the number of points", points.length, LEAST_VERTICES, MAX_VERTICES, "MAX_VERTICES");
    const placed = points.map(({ x, y }) => {
      onRaster("polygon", x, y);
      return dotSteps(x, y, "nearest");
    });
    const operands = placed.flatMap(([across, up], index) => {
      const [beforeAcross, beforeUp] = index === 0 ? [0, 0] : (placed[index - 1] ?? [0, 0]);
      return multiValue(across - beforeAcross, up - beforeUp);
    });
    return this.#pdi(options.filled === true ? SET_POLYGON_FILLED : SET_POLYGON_OUTLINED, operands);
  }

  /**
   * Unicode text from the cell at `row` (FIRST_TEXT_ROW to LAST_TEXT_ROW, teletext rows 1 to 23) and `column` (0 to
   * 39), one Noto cell a character (RAS-8): TEXT with the character field of TEXT_FIELD, then POINT SET at the lower
   * left of the cell, the dot (12 column, 20 row + 19) rounded down on both axes. With `rows: 2` the characters are
   * teletext's double height, as the engine draws it: each 12 dots by two rows, `row` the upper of the two (so 1 to
   * 22), the field DOUBLE_HEIGHT_FIELD and the point the lower left of the row below, the dot (12 column, 20 row + 39)
   * (RAS-8 item 5). Then the text as a text part the
   * server writes in the language's provided sets, characters only (PAR-5, RAS-8 item 4), as one run. Both are written
   * at every call, so nothing of an earlier call is relied on. A text part leaves G0 invoked with the primary set, so
   * the next drawing sends SO again. Colour mode 2 fills a character's field with the background, where a mark would
   * erase its letter, so after bytes of the program's own the builder selects its pen again first, in colour mode 1;
   * it throws when it has none to select.
   */
  text(text: string, options: NaplpsTextOptions): this {
    const rows = options.rows ?? SINGLE_HEIGHT;
    within("text", "rows", rows, SINGLE_HEIGHT, DOUBLE_HEIGHT, "a character is one or two teletext rows high");
    within("text", "row", options.row, FIRST_TEXT_ROW, LAST_TEXT_ROW - (rows - 1), "DISPLAY_FIRST_LINE and DISPLAY_LINES");
    within("text", "column", options.column, 0, TEXT_COLUMNS - 1, "RASTER_WIDTH");
    if (this.#ownBytes) {
      if (this.#pen === null) {
        throw new Error("Naplps.text: after bytes of the program's own the builder knows no pen to leave colour mode 2 with: call pen first (PAR-5)");
      }
      this.pen(this.#pen);
    }
    this.#pdi(TEXT, [...TEXT_FORMAT, ...multiValue(...(rows === DOUBLE_HEIGHT ? DOUBLE_HEIGHT_FIELD : TEXT_FIELD))]);
    const lowerLeft = RASTER_ROW_LINES * (options.row + rows) - 1;
    this.#pdi(POINT_SET_ABSOLUTE, multiValue(...dotSteps(CELL_DOTS * options.column, lowerLeft, "down")));
    this.#flush();
    this.#parts.push({
      text,
      ...(options.language === undefined ? {} : { language: options.language }),
      ...(options.outside === true ? { outside: true } : {}),
    });
    this.#drawing = false;
    this.#pending = false;
    return this;
  }

  /** NAPLPS of the program's own, appended as it is; the builder then sends SO before its next drawing and knows no colour mode. */
  bytes(raw: Uint8Array): this {
    this.#start();
    for (const byte of raw) {
      this.#bytes.push(byte);
    }
    this.#drawing = false;
    this.#pending = false;
    this.#ownBytes = true;
    return this;
  }

  /**
   * Defines macro `code`, one of the 96 macro names 0x20 to 0x7F, as what `build` appends to a new builder: DEF MACRO,
   * the code, the contents, END (sections 6.2.2.1 and 6.2.5). The contents start as an object's macro does (ANIM-11),
   * with SO before their first drawing. Nothing is drawn; an object or the macro set draws it later.
   */
  defineMacro(code: number, build: (contents: Naplps) => void): this {
    if (this.#inMacro) {
      throw new Error("Naplps.defineMacro: definitions do not nest (section 6.2.2.1)");
    }
    within("defineMacro", "code", code, FIRST_MACRO, LAST_MACRO, "the 96 macro names");
    const contents = Naplps.#contents();
    build(contents);
    const parts = contents.#all(false);
    const known = parts.reduce((sum, part) => sum + (part instanceof Uint8Array ? part.length : 0), 0);
    if (known > MAX_MACRO_BYTES) {
      throw new RangeError(`Naplps.defineMacro: macro ${code} holds ${known} bytes, at most ${MAX_MACRO_BYTES} (MAX_MACRO_BYTES)`);
    }
    this.#bytes.push(ESC, DEF_MACRO, code);
    for (const part of parts) {
      if (part instanceof Uint8Array) {
        for (const byte of part) {
          this.#bytes.push(byte);
        }
      } else {
        this.#flush();
        this.#parts.push(part);
      }
    }
    this.#bytes.push(ESC, END);
    this.#pending = false;
    return this;
  }

  /**
   * A NAPLPS object for `naplpsObjects` (ANIM-11), its fields checked against their bounds and those left out at
   * their defaults: shown, not detectable, layer 1, order 0, origin 0. Nothing is appended.
   */
  object(spec: NaplpsObjectSpec): NaplpsObject {
    const frames = spec.frames ?? [];
    const kind = spec.kind ?? (frames.length > 0 ? "macro" : "region");
    const originX = spec.originX ?? 0;
    const originY = spec.originY ?? 0;
    checkObject(spec, kind, frames, originX, originY);
    return {
      number: spec.number,
      kind,
      shown: spec.shown ?? true,
      detectable: spec.detectable ?? false,
      layer: spec.layer ?? 1,
      order: spec.order ?? 0,
      x: spec.x,
      y: spec.y,
      width: spec.width,
      height: spec.height,
      origin_x: originX,
      origin_y: originY,
      frames,
      ...(spec.cover === undefined ? {} : { cover: spec.cover }),
      ...(spec.hover === undefined ? {} : { hover: spec.hover }),
      ...(spec.pressed === undefined ? {} : { pressed: spec.pressed }),
      ...(spec.alternative === undefined ? {} : { alternative: spec.alternative }),
      ...(spec.label === undefined ? {} : { label: spec.label }),
    };
  }

  /** The bytes since the last text part, as one part. */
  #flush(): void {
    if (this.#bytes.length > 0) {
      this.#parts.push(Uint8Array.from(this.#bytes));
      this.#bytes = [];
    }
  }

  /** What has been built; with `ended`, a PDI not yet ended is ended with SERVICE DELIMITER CHARACTER, so that it is drawn now. */
  #all(ended: boolean): PicturePart[] {
    const tail = ended && this.#pending ? [...this.#bytes, SERVICE_DELIMITER] : this.#bytes;
    return tail.length === 0 ? [...this.#parts] : [...this.#parts, Uint8Array.from(tail)];
  }

  /** What has been built, as the parts `naplps` takes; a drawing instruction last is ended, so that it is drawn at once. */
  parts(): PicturePart[] {
    return this.#all(true);
  }
}

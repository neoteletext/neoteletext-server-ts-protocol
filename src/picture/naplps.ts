// A builder of NAPLPS (renderer parity PAR-40): each method appends the
// instructions of ANSI X3.110-1983 it names, in the 7-bit form, and
// `parts()` gives them, with Unicode text as text parts the server writes in
// the provided sets (PAR-5, PAR-21), for `naplps`. Coordinates are given in
// the 640 by 480 design picture of animation.md ANIM-11, origin at the top
// left and y down, and written as unit-screen operands at the default
// three-byte precision (section 5.3.2.2.3), so the builder never sends
// DOMAIN and every operand is read as written after a RESET. Every number is
// held to the NAPLPS renderer's limits by name (naplps-limits.ts), and a
// call outside one throws, naming it, before anything is appended.

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
  OBJECT_PICTURE_HEIGHT,
  OBJECT_PICTURE_WIDTH,
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
/** A multi-value operand's bytes in the default domain (section 5.3.2.2.3, Table 5), and its bits of each axis in two dimensions, three to a byte (Figure 11). */
const MULTI_VALUE_BYTES = 3;
const AXIS_BITS_PER_BYTE = 3;
const AXIS_BITS = MULTI_VALUE_BYTES * AXIS_BITS_PER_BYTE;
/** A coordinate is a two's complement binary fraction, its most significant bit the sign (section 5.3.1): steps of 1/256 of the unit screen in nine bits. */
const AXIS_STEPS = 2 ** (AXIS_BITS - 1);
const AXIS_MASK = 2 ** AXIS_BITS - 1;
const AXIS_BYTE_MASK = 2 ** AXIS_BITS_PER_BYTE - 1;
/** A colour's bits of each primary in one operand byte, G R B G R B from b6 to b1 (section 5.3.2.5.1). */
const PRIMARY_BITS_PER_BYTE = 2;
const PRIMARY_BITS = MULTI_VALUE_BYTES * PRIMARY_BITS_PER_BYTE;
/** Where each primary's high and low bit of a pair lies in an operand byte, b6 to b1 as bits 5 to 0 (Figure 12: G R B G R B). */
const GREEN_HIGH = 5;
const RED_HIGH = 4;
const BLUE_HIGH = 3;
const GREEN_LOW = 2;
const RED_LOW = 1;
const BLUE_LOW = 0;
/** An 8-bit primary's intensity, of which the operand keeps the top PRIMARY_BITS. */
const INTENSITY_BITS = 8;
const LAST_INTENSITY = 2 ** INTENSITY_BITS - 1;
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

/** A point of the design picture. */
export interface DesignPoint {
  readonly x: number;
  readonly y: number;
}

/** A NAPLPS object as a program gives it to {@link Naplps.object}: ANIM-11's fields, in the design picture's pixels, those left out at their defaults. */
export interface NaplpsObjectSpec {
  /** 1 to 65,535. */
  readonly number: number;
  /** A macro object, drawn by its frame's macro, or a region of the stream's own picture; a macro object when it has frames. */
  readonly kind?: "macro" | "region";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Where the rectangle's top left lies in the macro's own drawing; 0 for a region. */
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

/** Throws unless (`x`, `y`) lies in the design picture, 0 to OBJECT_PICTURE_WIDTH across and 0 to OBJECT_PICTURE_HEIGHT down. */
function inPicture(call: string, x: number, y: number): void {
  within(call, "x", x, 0, OBJECT_PICTURE_WIDTH, "OBJECT_PICTURE_WIDTH");
  within(call, "y", y, 0, OBJECT_PICTURE_HEIGHT, "OBJECT_PICTURE_HEIGHT");
}

/** A unit-screen fraction in AXIS_STEPS steps, rounded and kept within the operand's signed range. */
function steps(fraction: number): number {
  return Math.min(Math.max(Math.round(fraction * AXIS_STEPS), -AXIS_STEPS), AXIS_STEPS - 1);
}

/**
 * A design point on the unit screen, in steps: across, the picture's width is the unit's; down, its height is the
 * share of the unit's the display shows, DISPLAY_HEIGHT_NUMERATOR / DISPLAY_HEIGHT_DENOMINATOR, measured up from the
 * bottom (the NAPLPS renderer's surface; Appendix B).
 */
function unitSteps(x: number, y: number): readonly [number, number] {
  const across = x / OBJECT_PICTURE_WIDTH;
  const up = ((OBJECT_PICTURE_HEIGHT - y) / OBJECT_PICTURE_HEIGHT) * (DISPLAY_HEIGHT_NUMERATOR / DISPLAY_HEIGHT_DENOMINATOR);
  return [steps(across), steps(up)];
}

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

/** A colour operand (section 5.3.2.5.1, Figure 12): each 8-bit primary's top PRIMARY_BITS, two to a byte, G R B G R B from b6 to b1. */
function colourValue(red: number, green: number, blue: number): number[] {
  const kept = INTENSITY_BITS - PRIMARY_BITS;
  const [r, g, b] = [red >> kept, green >> kept, blue >> kept];
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
  within("object", "width", spec.width, 1, OBJECT_PICTURE_WIDTH, "OBJECT_PICTURE_WIDTH");
  within("object", "height", spec.height, 1, OBJECT_PICTURE_HEIGHT, "OBJECT_PICTURE_HEIGHT");
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

  /** A builder of a macro's contents. */
  static #contents(): Naplps {
    const contents = new Naplps();
    contents.#inMacro = true;
    return contents;
  }

  /** A PDI: SO first if the PDI set is not in use, then the opcode and its operands. */
  #pdi(opcode: number, operands: readonly number[]): this {
    if (!this.#drawing) {
      this.#bytes.push(SO);
      this.#drawing = true;
    }
    this.#bytes.push(opcode, ...operands);
    this.#pending = true;
    return this;
  }

  /** RESET with every bit (section 5.3.2.9): the domain, colour mode 1 with the default map drawing in white, the screen and border to black, the text, blinks, fields, texture, macros and DRCS to their defaults. */
  reset(): this {
    this.#pdi(RESET, RESET_EVERYTHING);
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
   * intensity's top six bits. The entry is the drawing colour after it.
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
    inPicture("point", x, y);
    return this.#pdi(POINT_SET_ABSOLUTE, multiValue(...unitSteps(x, y)));
  }

  /** Draws a line from the drawing point to (`x`, `y`), which becomes the drawing point: LINE (Absolute) (section 5.3.3.2.2). */
  line(x: number, y: number): this {
    inPicture("line", x, y);
    return this.#pdi(LINE_ABSOLUTE, multiValue(...unitSteps(x, y)));
  }

  /**
   * A rectangle with its top left at (`x`, `y`): SET and RECTANGLE (Outlined), or (Filled) with `filled` (sections
   * 5.3.3.4.4 and 5.3.3.4.5), from its lower left corner, its size up and to the right.
   */
  rect(x: number, y: number, width: number, height: number, options: { readonly filled?: boolean } = {}): this {
    inPicture("rect", x, y);
    inPicture("rect", x + width, y + height);
    within("rect", "width", width, 1, OBJECT_PICTURE_WIDTH, "OBJECT_PICTURE_WIDTH");
    within("rect", "height", height, 1, OBJECT_PICTURE_HEIGHT, "OBJECT_PICTURE_HEIGHT");
    const [left, bottom] = unitSteps(x, y + height);
    const [right, top] = unitSteps(x + width, y);
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
  polygon(points: readonly DesignPoint[], options: { readonly filled?: boolean } = {}): this {
    within("polygon", "the number of points", points.length, LEAST_VERTICES, MAX_VERTICES, "MAX_VERTICES");
    const placed = points.map(({ x, y }) => {
      inPicture("polygon", x, y);
      return unitSteps(x, y);
    });
    const operands = placed.flatMap(([across, up], index) => {
      const [beforeAcross, beforeUp] = index === 0 ? [0, 0] : (placed[index - 1] ?? [0, 0]);
      return multiValue(across - beforeAcross, up - beforeUp);
    });
    return this.#pdi(options.filled === true ? SET_POLYGON_FILLED : SET_POLYGON_OUTLINED, operands);
  }

  /**
   * Unicode text at the cursor, as a text part the server writes in the language's provided sets (PAR-5): it leaves G0
   * invoked with the primary set, so the next drawing sends SO again. Colour mode 2 fills a character's field with the
   * background, where a mark would erase its letter, so after bytes of the program's own the builder selects its pen
   * again first, in colour mode 1; it throws when it has none to select.
   */
  text(text: string, options: { readonly language?: LanguageTag; readonly outside?: boolean } = {}): this {
    if (this.#ownBytes) {
      if (this.#pen === null) {
        throw new Error("Naplps.text: after bytes of the program's own the builder knows no pen to leave colour mode 2 with: call pen first (PAR-5)");
      }
      this.pen(this.#pen);
    }
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

// A builder of ReGIS (renderer parity PAR-39): each method appends the
// commands of DEC's VT330/VT340 Programmer Reference Manual, Volume 2, that
// it names, or ReGIS v2's numbered drawings (the ReGIS renderer's
// docs/regis-v2.md), and `parts()` gives them, with Unicode text as text
// parts the server writes in the provided sets (PAR-21), for `regis`. Every
// number is held to the ReGIS renderer's limits by name (regis-limits.ts),
// and a call outside one throws, naming it, before anything is appended.

import type { LanguageTag } from "../wire/languages.ts";
import { hlsOf } from "./hls.ts";
import type { PicturePart } from "./parts.ts";
import { COLOURS, LAYERS, MAX_CELL_SIDE, MAX_COORDINATE, MAX_DRAWING_NUMBER, MAX_LABEL_BYTES, MAX_TITLE_BYTES, MIN_COORDINATE } from "./regis-limits.ts";

/** A colour's components are percentages, 0 to 100 (manual chapter 2, "HLS System"; the renderer's palette FULL). */
const FULL_PERCENT = 100;
/** The first and last bytes a ReGIS quoted string keeps as text: printable ASCII, then 10/0 to 15/15 (manual chapter 1; regis-v2.md "Attributes", read as ISO/IEC 8859-1). */
const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;
const FIRST_UPPER_HALF = 0xa0;
const LAST_UPPER_HALF = 0xff;
/** The quote a title or label is written between; doubled inside it (manual chapter 1, "Quoted Strings"). */
const QUOTE = "'";

/** A numbered drawing's attributes (regis-v2.md "Attributes"): `I`, `G`, `H`, `A` and `U`. */
export interface RegisDrawingAttributes {
  /** Pointer events report it (`I`). */
  readonly detectable?: boolean;
  /** The layer a top-level drawing is drawn in, 0 to `LAYERS` - 1 (`G`). */
  readonly layer?: number;
  /** The drawing drawn in its place while the pointer is over it, or 0 for none (`H`). */
  readonly hover?: number;
  /** The drawing drawn in its place while it is pressed, or 0 for none (`A`). */
  readonly pressed?: number;
  /** What a screen reader speaks for it, at most `MAX_LABEL_BYTES` of plain ISO/IEC 8859-1 text, or "" for none (`U`). */
  readonly label?: string;
}

/** How picture text is written: a text part's `language` and `outside` (PAR-21), and the character cell `T(S[w,h])` sets before it. */
export interface RegisTextOptions {
  readonly language?: LanguageTag;
  readonly outside?: boolean;
  /** The display cell's width and height in pixels, 1 to `MAX_CELL_SIDE` (manual chapter 7, "Character Cell Size"). */
  readonly size?: readonly [number, number];
}

/** Throws unless `value` is an integer from `least` to `most`, naming the call, what it is and the bound by its name. */
function within(call: string, what: string, value: number, least: number, most: number, bound: string): void {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`Regis.${call}: ${what} ${String(value)} is not an integer from ${least} to ${most} (${bound})`);
  }
}

/** Throws unless `value` is a coordinate the renderer keeps, MIN_COORDINATE to MAX_COORDINATE (manual chapter 1, "Numeric Values"). */
function coordinate(call: string, what: string, value: number): void {
  within(call, what, value, MIN_COORDINATE, MAX_COORDINATE, `MIN_COORDINATE to MAX_COORDINATE`);
}

/** `text` quoted as a v2 label or title (regis-v2.md "Attributes"): plain ISO/IEC 8859-1 text of at most `most` bytes, the quote doubled. */
function quoted(call: string, text: string, most: number, bound: string): string {
  let length = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < FIRST_PRINTABLE || code > LAST_PRINTABLE) && (code < FIRST_UPPER_HALF || code > LAST_UPPER_HALF)) {
      throw new RangeError(`Regis.${call}: ${JSON.stringify(character)} is not plain ISO/IEC 8859-1 text, which a v2 label or title is (regis-v2.md)`);
    }
    length += 1;
  }
  if (length > most) {
    throw new RangeError(`Regis.${call}: ${length} bytes, at most ${most} (${bound})`);
  }
  return `${QUOTE}${text.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`;
}

/** ReGIS as a list of parts for `regis` (PAR-39): each method appends its commands and answers the builder. */
export class Regis {
  readonly #parts: PicturePart[] = [];
  /** The commands since the last text part, written a byte a character. */
  #commands = "";
  /** The drawing being defined, while its `build` runs: definitions do not nest (regis-v2.md "Definitions"). */
  #defining: number | null = null;

  /** Appends commands, as text written a byte a character. */
  #write(commands: string): this {
    this.#commands += commands;
    return this;
  }

  /** Throws for a command the renderer ignores, or a batch fails on, inside a numbered drawing (regis-v2.md "Rules for contents" rule 3, "Definitions"). */
  #outside(call: string): void {
    if (this.#defining !== null) {
      throw new Error(`Regis.${call}: not inside drawing ${this.#defining}, whose contents ignore screen commands and take no D operation (regis-v2.md)`);
    }
  }

  /** Erases the screen to the background, `S(E)` (manual chapter 2, "Screen Erase"); with `background`, `S(I n)` first makes that output map location the background. */
  erase(background?: number): this {
    this.#outside("erase");
    if (background === undefined) {
      return this.#write("S(E)");
    }
    within("erase", "background", background, 0, COLOURS - 1, "COLOURS");
    return this.#write(`S(I${background})S(E)`);
  }

  /**
   * Sets output map location `index` to red, green and blue percentages, 0 to 100, as `S(M index(H…L…S…))` (manual
   * chapter 2, "Output Mapping" and "HLS System"): the manual's RGB system names eight colours by letter and takes no
   * values, so the colour is written in the HLS system, the one that takes values, as the hue, lightness and
   * saturation the renderer turns back nearest to it.
   */
  colour(index: number, red: number, green: number, blue: number): this {
    this.#outside("colour");
    within("colour", "index", index, 0, COLOURS - 1, "COLOURS");
    for (const [what, value] of [
      ["red", red],
      ["green", green],
      ["blue", blue],
    ] as const) {
      within("colour", what, value, 0, FULL_PERCENT, "percent");
    }
    const { hue, lightness, saturation } = hlsOf(red, green, blue);
    return this.#write(`S(M${index}(H${hue}L${lightness}S${saturation}))`);
  }

  /** Writes with output map location `index` from now on, `W(I index)` (manual chapter 3, "Foreground Intensity"). */
  pen(index: number): this {
    within("pen", "index", index, 0, COLOURS - 1, "COLOURS");
    return this.#write(`W(I${index})`);
  }

  /** Moves the active position to (`x`, `y`) without drawing, `P[x,y]` (manual chapter 4). */
  at(x: number, y: number): this {
    coordinate("at", "x", x);
    coordinate("at", "y", y);
    return this.#write(`P[${x},${y}]`);
  }

  /** Draws a line from the active position to (`x`, `y`), `V[x,y]` (manual chapter 5), which becomes the active position. */
  line(x: number, y: number): this {
    coordinate("line", "x", x);
    coordinate("line", "y", y);
    return this.#write(`V[${x},${y}]`);
  }

  /**
   * A rectangle with its top left at (`x`, `y`): `P[x,y]` and its outline as `V` to each corner (manual chapter 5), or
   * filled with `F(…)` (chapter 6). `pen` writes `W(I pen)` before it, and is the pen in force after it. The active
   * position is left at (`x`, `y`).
   */
  box(x: number, y: number, width: number, height: number, options: { readonly fill?: boolean; readonly pen?: number } = {}): this {
    coordinate("box", "x", x);
    coordinate("box", "y", y);
    coordinate("box", "x + width", x + width);
    coordinate("box", "y + height", y + height);
    within("box", "width", width, 1, MAX_COORDINATE - MIN_COORDINATE, "MIN_COORDINATE to MAX_COORDINATE");
    within("box", "height", height, 1, MAX_COORDINATE - MIN_COORDINATE, "MIN_COORDINATE to MAX_COORDINATE");
    if (options.pen !== undefined) {
      this.pen(options.pen);
    }
    const right = x + width;
    const bottom = y + height;
    const outline = `V[${right},${y}][${right},${bottom}][${x},${bottom}][${x},${y}]`;
    return this.#write(`P[${x},${y}]${options.fill === true ? `F(${outline})` : outline}`);
  }

  /** A circle about (`x`, `y`): `P[x,y]C[+radius]` (manual chapter 5, "Circle with Center at Current Position"), or filled with `F(…)`. The active position is left at its centre. */
  circle(x: number, y: number, radius: number, options: { readonly fill?: boolean } = {}): this {
    coordinate("circle", "x", x);
    coordinate("circle", "y", y);
    coordinate("circle", "x + radius", x + radius);
    within("circle", "radius", radius, 1, MAX_COORDINATE - MIN_COORDINATE, "MIN_COORDINATE to MAX_COORDINATE");
    const circle = `C[+${radius}]`;
    return this.#write(`P[${x},${y}]${options.fill === true ? `F(${circle})` : circle}`);
  }

  /**
   * Unicode text at the active position, as a text part the server writes in the language's provided sets (PAR-4):
   * it leaves alphabet 0 selected and the active position after its last character. `size` writes `T(S[w,h])`, the
   * display cell, before it.
   */
  text(text: string, options: RegisTextOptions = {}): this {
    const { size } = options;
    if (size !== undefined) {
      within("text", "cell width", size[0], 1, MAX_CELL_SIDE, "MAX_CELL_SIDE");
      within("text", "cell height", size[1], 1, MAX_CELL_SIDE, "MAX_CELL_SIDE");
      this.#write(`T(S[${size[0]},${size[1]}])`);
    }
    this.#flush();
    this.#parts.push({
      text,
      ...(options.language === undefined ? {} : { language: options.language }),
      ...(options.outside === true ? { outside: true } : {}),
    });
    return this;
  }

  /** ReGIS of the program's own, as bytes or as text written a byte a character, appended as it is. */
  bytes(raw: string | Uint8Array): this {
    if (typeof raw !== "string") {
      this.#flush();
      this.#parts.push(raw);
      return this;
    }
    return this.#write(raw);
  }

  /**
   * Numbered drawing `number` (regis-v2.md "The D command"): `D(B number)`, what `build` appends to the builder as its
   * contents, `D(E)`, then `D(S number(…))` with the attributes given, `I`, `G`, `H`, `A` and `U` in that order.
   * Inside `build`, a command the contents ignore or fail on throws: `erase`, `colour`, `drawing`, `commit`, `title`.
   * Nothing shows before {@link Regis.commit}.
   */
  drawing(number: number, attributes: RegisDrawingAttributes, build: (contents: Regis) => void): this {
    this.#outside("drawing");
    within("drawing", "number", number, 1, MAX_DRAWING_NUMBER, "MAX_DRAWING_NUMBER");
    const set: string[] = [];
    if (attributes.detectable !== undefined) {
      set.push(`I${attributes.detectable ? 1 : 0}`);
    }
    if (attributes.layer !== undefined) {
      within("drawing", "layer", attributes.layer, 0, LAYERS - 1, "LAYERS");
      set.push(`G${attributes.layer}`);
    }
    for (const [letter, what, value] of [
      ["H", "hover", attributes.hover],
      ["A", "pressed", attributes.pressed],
    ] as const) {
      if (value !== undefined) {
        within("drawing", what, value, 0, MAX_DRAWING_NUMBER, "MAX_DRAWING_NUMBER");
        set.push(`${letter}${value}`);
      }
    }
    if (attributes.label !== undefined) {
      set.push(`U${quoted("drawing", attributes.label, MAX_LABEL_BYTES, "MAX_LABEL_BYTES")}`);
    }
    // A build that throws leaves nothing of the drawing, so that no definition is left open in the stream.
    const partsBefore = this.#parts.length;
    const commandsBefore = this.#commands;
    this.#write(`D(B${number})`);
    this.#defining = number;
    try {
      build(this);
    } catch (error) {
      this.#parts.length = partsBefore;
      this.#commands = commandsBefore;
      throw error;
    } finally {
      this.#defining = null;
    }
    this.#write("D(E)");
    return set.length === 0 ? this : this.#write(`D(S${number}(${set.join(",")}))`);
  }

  /** Applies every drawing change since the last commit at once, `D(C)` (regis-v2.md "Commit and repaint"). */
  commit(): this {
    this.#outside("commit");
    return this.#write("D(C)");
  }

  /** The picture's title for page lists, never drawn, `D(T'…')` (regis-v2.md "Title"); "" removes it. It is applied at the next commit. */
  title(text: string): this {
    this.#outside("title");
    return this.#write(`D(T${quoted("title", text, MAX_TITLE_BYTES, "MAX_TITLE_BYTES")})`);
  }

  /** The commands since the last text part, as one part. */
  #flush(): void {
    if (this.#commands !== "") {
      this.#parts.push(this.#commands);
      this.#commands = "";
    }
  }

  /** What has been built, as the parts `regis` takes. */
  parts(): PicturePart[] {
    return this.#commands === "" ? [...this.#parts] : [...this.#parts, this.#commands];
  }
}

// A numbered drawing's attributes as ReGIS v2 writes them inside
// `D(S number(…))` (the ReGIS renderer's docs/regis-v2.md, "Attributes" and
// the grammar's "Attributes"; renderer parity PAR-39), each held to the
// renderer's limit by name before any is written.

import { coordinate, quoted, within } from "./regis-checks.ts";
import { LAYERS, MAX_COORDINATE, MAX_DRAWING_NUMBER, MAX_LABEL_BYTES, MAX_OBJECT_FRAMES, MAX_PAINT_RATE } from "./regis-limits.ts";

/** A numbered drawing's clip rectangle, relative to the drawing's own origin, in pixels (regis-v2.md "Attributes", `C(X…,Y…,W…,H…)`). */
export interface RegisClip {
  /** Its left edge, `MIN_COORDINATE` to `MAX_COORDINATE`. */
  readonly x: number;
  /** Its top edge, `MIN_COORDINATE` to `MAX_COORDINATE`. */
  readonly y: number;
  /** Its width, 0 to `MAX_COORDINATE`: the renderer fails a batch on a negative one. */
  readonly width: number;
  /** Its height, 0 to `MAX_COORDINATE`, for the same reason. */
  readonly height: number;
}

/**
 * A numbered drawing's attributes (regis-v2.md "Attributes" and its grammar's "Attributes"), every one of the
 * fourteen. One left out is not written, and the renderer leaves it as it was. They are written in the order of
 * the fields here: `P`, `R`, `X`, `Y`, `L`, `V`, `C`, `I`, `G`, `H`, `A`, `N`, `F`, `T`, `U`.
 */
export interface RegisDrawingAttributes {
  /** The drawing it belongs to, 1 to `MAX_DRAWING_NUMBER`, or 0 for none, the top level (`P`). */
  readonly parent?: number;
  /** The drawing drawn in place of its own contents, 1 to `MAX_DRAWING_NUMBER`, or 0 for none (`R`). */
  readonly source?: number;
  /** Where its origin sits, relative to its parent, in pixels, `MIN_COORDINATE` to `MAX_COORDINATE` (`X`). */
  readonly x?: number;
  /** As `x`, down the screen (`Y`). */
  readonly y?: number;
  /** Its drawing order among the children of its parent, higher later, `MIN_COORDINATE` to `MAX_COORDINATE`: an attribute's value is a coordinate's 16 bits (`L`). */
  readonly depth?: number;
  /** Whether it and its children are shown (`V`). */
  readonly visible?: boolean;
  /** The rectangle it and its children appear only inside (`C(X…,Y…,W…,H…)`), or null for none (`C0`). */
  readonly clip?: RegisClip | null;
  /** Pointer events report it (`I`). */
  readonly detectable?: boolean;
  /** The layer a top-level drawing is drawn in, 0 to `LAYERS` - 1 (`G`). */
  readonly layer?: number;
  /** The drawing drawn in its place while the pointer is over it, or 0 for none (`H`). */
  readonly hover?: number;
  /** The drawing drawn in its place while it is pressed, or 0 for none (`A`). */
  readonly pressed?: number;
  /** The drawing drawn in its place while the receiver forces the alternative look, or 0 for none (`N`). */
  readonly alternative?: number;
  /** The drawings of which the one the frame in force numbers is drawn in its place: 1 to `MAX_OBJECT_FRAMES` drawings, each 1 to `MAX_DRAWING_NUMBER` (`F(…)`), or an empty list for none (`F0`). */
  readonly frames?: readonly number[];
  /** How fast the receiver paints it, in hundreds of work units a second, 1 to `MAX_PAINT_RATE`, or 0 for at once (`T`). */
  readonly rate?: number;
  /** What a screen reader speaks for it, at most `MAX_LABEL_BYTES` of plain ISO/IEC 8859-1 text, or "" for none (`U`). */
  readonly label?: string;
}

/** An attribute whose value is 0 or 1 (regis-v2.md grammar, "Attributes"). */
function flag(letter: string, value: boolean | undefined): string[] {
  return value === undefined ? [] : [`${letter}${value ? 1 : 0}`];
}

/** An attribute that names a drawing, or none by 0: the renderer fails a batch on a reference above `MAX_DRAWING_NUMBER`. */
function reference(call: string, letter: string, what: string, value: number | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  within(call, what, value, 0, MAX_DRAWING_NUMBER, "MAX_DRAWING_NUMBER");
  return [`${letter}${value}`];
}

/** An attribute whose value is a signed 16-bit number, as a coordinate is (regis-v2.md grammar, "Attributes"). */
function signed(call: string, letter: string, what: string, value: number | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  coordinate(call, what, value);
  return [`${letter}${value}`];
}

/** `C(X…,Y…,W…,H…)`, or `C0` for no clip rectangle. */
function clipOf(call: string, clip: RegisClip | null | undefined): string[] {
  if (clip === undefined) {
    return [];
  }
  if (clip === null) {
    return ["C0"];
  }
  coordinate(call, "clip x", clip.x);
  coordinate(call, "clip y", clip.y);
  within(call, "clip width", clip.width, 0, MAX_COORDINATE, "MAX_COORDINATE");
  within(call, "clip height", clip.height, 0, MAX_COORDINATE, "MAX_COORDINATE");
  return [`C(X${clip.x},Y${clip.y},W${clip.width},H${clip.height})`];
}

/** `F(n,…)`, or `F0` for no frame list: a frame is a drawing, never none, and a list holds at most `MAX_OBJECT_FRAMES`. */
function framesOf(call: string, frames: readonly number[] | undefined): string[] {
  if (frames === undefined) {
    return [];
  }
  if (frames.length === 0) {
    return ["F0"];
  }
  if (frames.length > MAX_OBJECT_FRAMES) {
    throw new RangeError(`Regis.${call}: ${frames.length} frames, at most ${MAX_OBJECT_FRAMES} (MAX_OBJECT_FRAMES)`);
  }
  for (const frame of frames) {
    within(call, "frame", frame, 1, MAX_DRAWING_NUMBER, "MAX_DRAWING_NUMBER");
  }
  return [`F(${frames.join(",")})`];
}

/**
 * The attributes given, each as the grammar writes it, in the order of {@link RegisDrawingAttributes}' fields; every
 * one is checked before any is answered, so that a call outside a limit writes nothing.
 */
export function attributesOf(call: string, attributes: RegisDrawingAttributes): string[] {
  const { layer, rate, label } = attributes;
  if (layer !== undefined) {
    within(call, "layer", layer, 0, LAYERS - 1, "LAYERS");
  }
  if (rate !== undefined) {
    within(call, "rate", rate, 0, MAX_PAINT_RATE, "MAX_PAINT_RATE");
  }
  return [
    ...reference(call, "P", "parent", attributes.parent),
    ...reference(call, "R", "source", attributes.source),
    ...signed(call, "X", "x", attributes.x),
    ...signed(call, "Y", "y", attributes.y),
    ...signed(call, "L", "depth", attributes.depth),
    ...flag("V", attributes.visible),
    ...clipOf(call, attributes.clip),
    ...flag("I", attributes.detectable),
    ...(layer === undefined ? [] : [`G${layer}`]),
    ...reference(call, "H", "hover", attributes.hover),
    ...reference(call, "A", "pressed", attributes.pressed),
    ...reference(call, "N", "alternative", attributes.alternative),
    ...framesOf(call, attributes.frames),
    ...(rate === undefined ? [] : [`T${rate}`]),
    ...(label === undefined ? [] : [`U${quoted(call, label, MAX_LABEL_BYTES, "MAX_LABEL_BYTES")}`]),
  ];
}

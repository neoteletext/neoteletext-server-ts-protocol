// DEC-7036 item 7, TODO-7033 (tested by TODO-7079): every attribute of a
// ReGIS numbered drawing in the Regis builder, and set, delete and
// deleteAll, as the shared call list's note "A numbered drawing's
// attributes" (kit-calls.tsv) and the ReGIS renderer's docs/regis-v2.md
// ("The D command", "Attributes" and the grammar's "Attributes") say. Every
// bound is the renderer's constant by name (regisLimits), tried at its edge
// and one past it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Regis, type RegisDrawingAttributes, regisLimits } from "../src/index.ts";

const { LAYERS, MAX_COORDINATE, MAX_DRAWING_NUMBER, MAX_LABEL_BYTES, MAX_OBJECT_FRAMES, MAX_PAINT_RATE, MIN_COORDINATE } = regisLimits;

/** A drawing's contents with nothing in them. */
const EMPTY = (): void => {
  // Nothing is drawn.
};

/** Each attribute alone, as the grammar writes it: its letter, then its value. */
const ALONE: readonly (readonly [RegisDrawingAttributes, string])[] = [
  [{ parent: 3 }, "P3"],
  [{ source: 4 }, "R4"],
  [{ x: -5 }, "X-5"],
  [{ y: 6 }, "Y6"],
  [{ depth: -7 }, "L-7"],
  [{ visible: true }, "V1"],
  [{ clip: { x: -1, y: 2, width: 3, height: 4 } }, "C(X-1,Y2,W3,H4)"],
  [{ detectable: true }, "I1"],
  [{ layer: 2 }, "G2"],
  [{ hover: 8 }, "H8"],
  [{ pressed: 9 }, "A9"],
  [{ alternative: 10 }, "N10"],
  [{ frames: [11, 12, 13] }, "F(11,12,13)"],
  [{ rate: 14 }, "T14"],
  [{ label: "Go" }, "U'Go'"],
];

test("DEC-7036 item 7, TODO-7033: each of the fourteen attributes alone is written with its letter and its value, by set and by drawing", () => {
  assert.equal(ALONE.length, 15, "fourteen attributes, the clip rectangle's four fields being one, and the label: the grammar's fifteen letters");
  for (const [attributes, written] of ALONE) {
    assert.deepEqual(new Regis().set(5, attributes).parts(), [`D(S5(${written}))`], written);
    assert.deepEqual(new Regis().drawing(5, attributes, EMPTY).parts(), [`D(B5)D(E)D(S5(${written}))`], written);
  }
});

/** The attributes of each of `all` in one object, its fields in the order given. */
function merged(all: readonly RegisDrawingAttributes[]): RegisDrawingAttributes {
  const one: Record<string, unknown> = {};
  for (const attributes of all) {
    Object.assign(one, attributes);
  }
  return one;
}

test("DEC-7036 item 7: attributes given together are written in the grammar's order P, R, X, Y, L, V, C, I, G, H, A, N, F, T, U, commas between, whatever the object's order", () => {
  const inGrammarOrder = ALONE.map(([attributes]) => attributes);
  const written = ALONE.map(([, letters]) => letters).join(",");
  const forwards = merged(inGrammarOrder);
  const backwards = merged(inGrammarOrder.toReversed());
  assert.deepEqual(Object.keys(backwards), Object.keys(forwards).toReversed(), "the second object's fields are in the other order");
  for (const attributes of [forwards, backwards]) {
    assert.deepEqual(new Regis().set(1, attributes).parts(), [`D(S1(${written}))`]);
  }
  assert.deepEqual(new Regis().set(2, { label: "z", layer: 1, parent: 4 }).parts(), ["D(S2(P4,G1,U'z'))"], "three of them, given last first");
});

test("DEC-7036 item 7: no clip is C0, no frame list F0, a reference of none 0, the flags 1 or 0, a label's quote doubled and an empty label U''", () => {
  const cases: readonly (readonly [RegisDrawingAttributes, string])[] = [
    [{ clip: null }, "C0"],
    [{ frames: [] }, "F0"],
    [{ parent: 0, source: 0, hover: 0, pressed: 0, alternative: 0 }, "P0,R0,H0,A0,N0"],
    [{ visible: true, detectable: true }, "V1,I1"],
    [{ visible: false, detectable: false }, "V0,I0"],
    [{ label: "it's 'x'" }, "U'it''s ''x'''"],
    [{ label: "" }, "U''"],
    [{ rate: 0 }, "T0"],
  ];
  for (const [attributes, written] of cases) {
    assert.deepEqual(new Regis().set(1, attributes).parts(), [`D(S1(${written}))`], written);
  }
});

/** A builder holding one command already, to see that a refused call appends nothing to it. */
function started(): Regis {
  return new Regis().at(1, 1);
}

/** That `call` on a started builder throws a RangeError naming `bound`, and leaves its parts as they were. */
function refused(call: (builder: Regis) => unknown, bound: string, what: string): void {
  const builder = started();
  const before = builder.parts();
  assert.throws(
    () => call(builder),
    (error: unknown) => error instanceof RangeError && error.message.includes(bound),
    `${what}: a RangeError naming ${bound}`,
  );
  assert.deepEqual(builder.parts(), before, `${what}: nothing is appended`);
}

/** That `attributes` are refused by set and by drawing, naming `bound`, and that drawing's build is never run. */
function attributesRefused(attributes: RegisDrawingAttributes, bound: string, what: string): void {
  refused((builder) => builder.set(1, attributes), bound, `set ${what}`);
  let built = false;
  refused(
    (builder) =>
      builder.drawing(1, attributes, () => {
        built = true;
      }),
    bound,
    `drawing ${what}`,
  );
  assert.equal(built, false, `drawing ${what}: the build is not run`);
}

/** That `attributes` are taken by set and by drawing. */
function attributesTaken(attributes: RegisDrawingAttributes, what: string): void {
  assert.doesNotThrow(() => new Regis().set(1, attributes), `set ${what}`);
  assert.doesNotThrow(() => new Regis().drawing(1, attributes, EMPTY), `drawing ${what}`);
}

test("DEC-7036 item 7: a drawing's number is 1 to MAX_DRAWING_NUMBER for drawing, set and delete", () => {
  for (const number of [1, MAX_DRAWING_NUMBER]) {
    assert.deepEqual(new Regis().drawing(number, {}, EMPTY).parts(), [`D(B${number})D(E)`]);
    assert.deepEqual(new Regis().set(number, { visible: true }).parts(), [`D(S${number}(V1))`]);
    assert.deepEqual(new Regis().delete(number).parts(), [`D(K${number})`]);
  }
  for (const number of [0, MAX_DRAWING_NUMBER + 1, 1.5]) {
    refused((builder) => builder.drawing(number, {}, EMPTY), "MAX_DRAWING_NUMBER", `drawing ${number}`);
    refused((builder) => builder.set(number, { visible: true }), "MAX_DRAWING_NUMBER", `set ${number}`);
    refused((builder) => builder.delete(number), "MAX_DRAWING_NUMBER", `delete ${number}`);
  }
});

test("DEC-7036 item 7: parent, source, hover, pressed and alternative name a drawing 0 to MAX_DRAWING_NUMBER", () => {
  for (const field of ["parent", "source", "hover", "pressed", "alternative"] as const) {
    for (const value of [0, MAX_DRAWING_NUMBER]) {
      attributesTaken({ [field]: value }, `${field} ${value}`);
    }
    for (const value of [-1, MAX_DRAWING_NUMBER + 1]) {
      attributesRefused({ [field]: value }, "MAX_DRAWING_NUMBER", `${field} ${value}`);
    }
  }
});

/** A clip rectangle at the origin of no size, but for `fields`. */
function clip(fields: Partial<Record<"x" | "y" | "width" | "height", number>>): RegisDrawingAttributes {
  return { clip: { x: 0, y: 0, width: 0, height: 0, ...fields } };
}

test("DEC-7036 item 7: x, y, depth and the clip's x and y are MIN_COORDINATE to MAX_COORDINATE, the clip's width and height 0 to MAX_COORDINATE", () => {
  const signed = [
    ...(["x", "y", "depth"] as const).map((field) => (value: number): RegisDrawingAttributes => ({ [field]: value })),
    (value: number): RegisDrawingAttributes => clip({ x: value }),
    (value: number): RegisDrawingAttributes => clip({ y: value }),
  ];
  for (const attributes of signed) {
    for (const value of [MIN_COORDINATE, MAX_COORDINATE]) {
      attributesTaken(attributes(value), JSON.stringify(attributes(value)));
    }
    for (const value of [MIN_COORDINATE - 1, MAX_COORDINATE + 1, 0.5]) {
      attributesRefused(attributes(value), "MIN_COORDINATE to MAX_COORDINATE", JSON.stringify(attributes(value)));
    }
  }
  for (const field of ["width", "height"] as const) {
    for (const value of [0, MAX_COORDINATE]) {
      attributesTaken(clip({ [field]: value }), `clip ${field} ${value}`);
    }
    for (const value of [-1, MAX_COORDINATE + 1]) {
      attributesRefused(clip({ [field]: value }), "MAX_COORDINATE", `clip ${field} ${value}`);
    }
  }
  assert.deepEqual(new Regis().set(1, { clip: { x: MIN_COORDINATE, y: MAX_COORDINATE, width: MAX_COORDINATE, height: 0 } }).parts(), [
    `D(S1(C(X${MIN_COORDINATE},Y${MAX_COORDINATE},W${MAX_COORDINATE},H0)))`,
  ]);
});

test("DEC-7036 item 7: layer is 0 to LAYERS - 1 and rate 0 to MAX_PAINT_RATE", () => {
  for (const layer of [0, LAYERS - 1]) {
    attributesTaken({ layer }, `layer ${layer}`);
  }
  for (const layer of [-1, LAYERS]) {
    attributesRefused({ layer }, "LAYERS", `layer ${layer}`);
  }
  for (const rate of [0, MAX_PAINT_RATE]) {
    attributesTaken({ rate }, `rate ${rate}`);
  }
  for (const rate of [-1, MAX_PAINT_RATE + 1]) {
    attributesRefused({ rate }, "MAX_PAINT_RATE", `rate ${rate}`);
  }
});

test("DEC-7036 item 7: a frame list is 1 to MAX_OBJECT_FRAMES drawings, each 1 to MAX_DRAWING_NUMBER", () => {
  const most = Array.from({ length: MAX_OBJECT_FRAMES }, (_, at) => at + 1);
  assert.deepEqual(new Regis().set(1, { frames: most }).parts(), [`D(S1(F(${most.join(",")})))`]);
  attributesTaken({ frames: [1] }, "one frame");
  attributesTaken({ frames: [MAX_DRAWING_NUMBER] }, "the last drawing as a frame");
  attributesRefused({ frames: [...most, 1] }, "MAX_OBJECT_FRAMES", "one frame too many");
  attributesRefused({ frames: [0] }, "MAX_DRAWING_NUMBER", "frame 0, which is no drawing");
  attributesRefused({ frames: [1, MAX_DRAWING_NUMBER + 1] }, "MAX_DRAWING_NUMBER", "a frame past the last drawing");
});

test("DEC-7036 item 7: a label is at most MAX_LABEL_BYTES of plain ISO/IEC 8859-1 text", () => {
  const longest = "a".repeat(MAX_LABEL_BYTES);
  assert.deepEqual(new Regis().set(1, { label: longest }).parts(), [`D(S1(U'${longest}'))`]);
  attributesRefused({ label: `${longest}a` }, "MAX_LABEL_BYTES", "one byte too many");
  // A quote counts once, as the renderer keeps it once; doubling it is the grammar's, not the label's.
  attributesTaken({ label: `'${"a".repeat(MAX_LABEL_BYTES - 1)}` }, "a quote and the rest");
  attributesTaken({ label: "\u00A0\u00FF ~" }, "the upper half's first and last, a space and a tilde");
  for (const character of ["\u0100", "\u{1F600}", "\u0080", "\u009F", "\u001F", "\u007F", "\n"]) {
    attributesRefused({ label: `a${character}` }, "ISO/IEC 8859-1", JSON.stringify(character));
  }
});

test("TODO-7033: drawing with no attribute writes no D(S…), and set with none throws", () => {
  assert.deepEqual(new Regis().drawing(9, {}, EMPTY).parts(), ["D(B9)D(E)"]);
  refused((builder) => builder.set(9, {}), "no attribute", "set with none");
});

test("TODO-7033: set, delete and deleteAll each write their D operation alone, and none commits", () => {
  assert.deepEqual(new Regis().set(4, { x: 1 }).parts(), ["D(S4(X1))"]);
  assert.deepEqual(new Regis().delete(4).parts(), ["D(K4)"]);
  assert.deepEqual(new Regis().deleteAll().parts(), ["D(Z)"]);
  assert.deepEqual(new Regis().set(4, { x: 1 }).delete(5).deleteAll().commit().parts(), ["D(S4(X1))D(K5)D(Z)D(C)"]);
});

test("TODO-7033: set, delete, deleteAll and a nested drawing throw inside a drawing's build, leaving nothing of the outer drawing", () => {
  const inside: readonly (readonly [string, (contents: Regis) => unknown])[] = [
    ["set", (contents) => contents.set(2, { x: 1 })],
    ["delete", (contents) => contents.delete(2)],
    ["deleteAll", (contents) => contents.deleteAll()],
    ["drawing", (contents) => contents.drawing(2, {}, EMPTY)],
  ];
  for (const [name, call] of inside) {
    const builder = started();
    const before = builder.parts();
    assert.throws(
      () =>
        builder.drawing(3, { x: 1 }, (contents) => {
          contents.line(5, 5);
          call(contents);
        }),
      (error: unknown) => error instanceof Error && error.message.startsWith(`Regis.${name}: not inside drawing 3`),
      name,
    );
    assert.deepEqual(builder.parts(), before, `${name}: nothing of drawing 3 is left`);
    assert.deepEqual(builder.delete(3).parts(), ["P[1,1]D(K3)"], `${name}: the builder is outside a drawing again`);
  }
});

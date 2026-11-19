// The ReGIS and NAPLPS builders (renderer parity PAR-39, PAR-40): each
// method's bytes are the commands it names, worked out by hand from the
// VT330/VT340 manual, docs/regis-v2.md and ANSI X3.110-1983; every bound is
// a renderer limit by name; and the shared examples (picture-examples.jsonl,
// a copy of neoteletext-common's, which the Python kit also replays) give
// exactly the parts they list.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { Naplps, type PicturePart, Regis, naplpsLimits, regisLimits } from "../src/index.ts";
import { hlsOf, rgbOf } from "../src/picture/hls.ts";
import { pictureFields } from "../src/picture/parts.ts";

/** A drawing's or a macro's contents with nothing in them. */
const EMPTY = (): void => {
  // Nothing is drawn.
};

/** Throws `call`'s RangeError, which names `limit`. */
function throwsNaming(call: () => unknown, limit: string): void {
  assert.throws(call, (error: unknown) => error instanceof RangeError && error.message.includes(limit), limit);
}

/** The parts with every bytes part as its bytes' values and every string as its characters' codes, for comparing. */
function plain(parts: readonly PicturePart[]): unknown[] {
  return parts.map((part) => (part instanceof Uint8Array ? [...part] : part));
}

test("PAR-39: each Regis method writes the commands it names", () => {
  const cases: readonly (readonly [Regis, string])[] = [
    [new Regis().erase(), "S(E)"],
    [new Regis().erase(2), "S(I2)S(E)"],
    [new Regis().colour(1, 20, 20, 80), "S(M1(H0L50S60))"],
    [new Regis().colour(2, 100, 0, 0), "S(M2(H120L50S100))"],
    [new Regis().pen(3), "W(I3)"],
    [new Regis().at(10, 20).line(30, 40), "P[10,20]V[30,40]"],
    [new Regis().box(10, 20, 30, 40), "P[10,20]V[40,20][40,60][10,60][10,20]"],
    [new Regis().box(10, 20, 30, 40, { fill: true, pen: 2 }), "W(I2)P[10,20]F(V[40,20][40,60][10,60][10,20])"],
    [new Regis().circle(100, 100, 50), "P[100,100]C[+50]"],
    [new Regis().circle(100, 100, 50, { fill: true }), "P[100,100]F(C[+50])"],
    [new Regis().commit(), "D(C)"],
    [new Regis().title("Café 'x'"), "D(T'Café ''x''')"],
    [new Regis().title(""), "D(T'')"],
    [new Regis().bytes("P[1,1]"), "P[1,1]"],
  ];
  for (const [built, written] of cases) {
    assert.deepEqual(built.parts(), [written]);
  }
});

test("PAR-39: a numbered drawing is its definition, then its attributes I, G, H, A and U, and its contents take no screen command", () => {
  const built = new Regis().drawing(3, { detectable: true, layer: 2, hover: 4, pressed: 5, label: "It's" }, (contents) => {
    contents.box(0, 0, 10, 10, { fill: true });
  });
  assert.deepEqual(built.parts(), ["D(B3)P[0,0]F(V[10,0][10,10][0,10][0,0])D(E)D(S3(I1,G2,H4,A5,U'It''s'))"]);
  assert.deepEqual(new Regis().drawing(9, {}, EMPTY).parts(), ["D(B9)D(E)"], "no attribute, no set");
  for (const inside of [
    (contents: Regis): unknown => contents.erase(),
    (contents: Regis): unknown => contents.colour(1, 0, 0, 0),
    (contents: Regis): unknown => contents.commit(),
    (contents: Regis): unknown => contents.title("t"),
    (contents: Regis): unknown => contents.drawing(4, {}, EMPTY),
  ]) {
    assert.throws(() => new Regis().drawing(3, {}, (contents) => void inside(contents)), /not inside drawing 3/u);
  }
  const after = new Regis();
  assert.throws(() => after.drawing(3, {}, (contents) => void contents.erase()));
  assert.deepEqual(after.commit().parts(), ["D(C)"], "a build that throws leaves nothing of its drawing");
});

test("PAR-39, PAR-4: text is a text part, after T(S[w,h]) when sized, with the commands around it kept apart", () => {
  const built = new Regis()
    .at(10, 20)
    .text("Καλημέρα", { language: "el", size: [16, 24] })
    .text("x", { outside: true })
    .commit();
  assert.deepEqual(built.parts(), ["P[10,20]T(S[16,24])", { text: "Καλημέρα", language: "el" }, { text: "x", outside: true }, "D(C)"]);
});

test("PAR-39: a number outside the ReGIS renderer's limits throws, naming the limit", () => {
  const { COLOURS, LAYERS, MAX_CELL_SIDE, MAX_COORDINATE, MAX_DRAWING_NUMBER, MAX_LABEL_BYTES, MAX_TITLE_BYTES } = regisLimits;
  throwsNaming(() => new Regis().at(MAX_COORDINATE + 1, 0), "MAX_COORDINATE");
  throwsNaming(() => new Regis().box(MAX_COORDINATE, 0, 1, 1), "MAX_COORDINATE");
  throwsNaming(() => new Regis().at(0.5, 0), "MAX_COORDINATE");
  throwsNaming(() => new Regis().pen(COLOURS), "COLOURS");
  throwsNaming(() => new Regis().colour(0, 101, 0, 0), "percent");
  throwsNaming(() => new Regis().drawing(MAX_DRAWING_NUMBER + 1, {}, EMPTY), "MAX_DRAWING_NUMBER");
  throwsNaming(() => new Regis().drawing(0, {}, EMPTY), "MAX_DRAWING_NUMBER");
  throwsNaming(() => new Regis().drawing(1, { layer: LAYERS }, EMPTY), "LAYERS");
  throwsNaming(() => new Regis().drawing(1, { label: "x".repeat(MAX_LABEL_BYTES + 1) }, EMPTY), "MAX_LABEL_BYTES");
  throwsNaming(() => new Regis().title("x".repeat(MAX_TITLE_BYTES + 1)), "MAX_TITLE_BYTES");
  throwsNaming(() => new Regis().text("x", { size: [MAX_CELL_SIDE + 1, 1] }), "MAX_CELL_SIDE");
  assert.throws(() => new Regis().title("line\nbreak"), /ISO\/IEC 8859-1/u);
  assert.deepEqual(new Regis().drawing(1, { label: "x".repeat(MAX_LABEL_BYTES) }, EMPTY).parts().length, 1, "at the limit it is taken");
});

test("PAR-39: a colour is the HLS the renderer turns back nearest it, within a percent", () => {
  for (let red = 0; red <= 100; red += 10) {
    for (let green = 0; green <= 100; green += 10) {
      for (let blue = 0; blue <= 100; blue += 10) {
        const back = rgbOf(hlsOf(red, green, blue));
        assert.ok(Math.max(Math.abs(back[0] - red), Math.abs(back[1] - green), Math.abs(back[2] - blue)) <= 1, `${red} ${green} ${blue}: ${back.join(" ")}`);
      }
    }
  }
});

/** SO, and DOMAIN (section 5.3.2.2, Figure 14): single values of one byte, multi values of six (Table 5, b5 b4 b3 = 101), two dimensions, then the logical pel (0, 0) in six bytes (RAS-6). */
const SO = 0x0e;
const DOMAIN = [0x21, 0x54, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40] as const;

test("PAR-40, RAS-6: each Naplps method writes the instructions it names, DOMAIN and SO before the first drawing and SDC after the last", () => {
  const SDC = 0x1a;
  // Worked by hand, eighteen bits an axis, three of x and three of y a byte, most significant first (section 5.3.1,
  // Figure 11), a dot (X, Y) being X / 480 across and (479 - Y) x 25 / 14720 up of 131072 steps, to the nearest (RAS-2):
  // dot (0, 479) is (0, 0); dot (240, 249) is (65536, 51200) exactly, 010 000 000 000 000 000 and 001 100 100 000 000 000;
  // dot (479, 479) is 130798.93, 130799, 011 111 111 011 101 111 across and 0 up.
  const cases: readonly (readonly [Naplps, readonly number[]])[] = [
    [new Naplps().reset(), [SO, 0x20, 0x7f, 0x7f, ...DOMAIN, SDC]],
    [new Naplps().clear(), [0x0c]],
    [new Naplps().pen(3), [SO, ...DOMAIN, 0x3e, 0x4c, SDC]],
    // Each primary's eight bits then four zero bits, two to a byte: red 11 11 11 11 00 00 in b5 and b2 (Figure 12).
    [new Naplps().colour(1, 255, 0, 0), [SO, ...DOMAIN, 0x3e, 0x44, 0x3c, 0x52, 0x52, 0x52, 0x52, 0x40, 0x40, SDC]],
    [new Naplps().point(0, 479), [SO, ...DOMAIN, 0x24, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, SDC]],
    [new Naplps().point(240, 249), [SO, ...DOMAIN, 0x24, 0x51, 0x44, 0x44, 0x40, 0x40, 0x40, SDC]],
    [new Naplps().line(479, 479), [SO, ...DOMAIN, 0x28, 0x58, 0x78, 0x78, 0x58, 0x68, 0x78, SDC]],
    // The cell of row 1, column 0: POINT SET at its bottom left dot (0, 39), (0, 97947.83) to the nearest, 97948, and
    // the displacement to its top right dot (11, 20): 11 x 131072 / 480 = 3003.73, 3004, and 4229.57 - 0.17, 4229 up.
    [new Naplps().rect(0, 20, 12, 20, { filled: true }), [SO, ...DOMAIN, 0x33, 0x42, 0x47, 0x47, 0x42, 0x43, 0x44, 0x40, 0x41, 0x68, 0x72, 0x78, 0x65, SDC]],
    [new Naplps().rect(0, 20, 12, 20), [SO, ...DOMAIN, 0x32, 0x42, 0x47, 0x47, 0x42, 0x43, 0x44, 0x40, 0x41, 0x68, 0x72, 0x78, 0x65, SDC]],
    [
      new Naplps().polygon(
        [
          { x: 0, y: 479 },
          { x: 240, y: 249 },
          { x: 479, y: 479 },
        ],
        { filled: true },
      ),
      // The last displacement: across 130799 - 65536 = 65263, 001 111 111 011 101 111; up -51200, 2^18 - 51200 =
      // 210,944, 110 011 100 000 000 000.
      [SO, ...DOMAIN, 0x37, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x51, 0x44, 0x44, 0x40, 0x40, 0x40, 0x4e, 0x7b, 0x7c, 0x58, 0x68, 0x78, SDC],
    ],
    [new Naplps().reset().clear(), [SO, 0x20, 0x7f, 0x7f, ...DOMAIN, 0x0c]],
    [new Naplps().bytes(Uint8Array.from([0x41])), [SO, ...DOMAIN, 0x41]],
  ];
  for (const [built, written] of cases) {
    assert.deepEqual(plain(built.parts()), [written]);
  }
});

/** TEXT with its two fixed-format bytes and the character field of RAS-8 item 1: 3,276 by 4,452 steps, 000 000 110 011 001 100 and 000 001 000 101 100 100. */
const TEXT_FIELD = [0x22, 0x40, 0x40, 0x40, 0x41, 0x70, 0x5d, 0x4c, 0x64] as const;
/** POINT SET at the lower left of row 1, column 0: the dot (0, 39), 97947.83 up rounded down, 97947, 010 111 111 010 011 011 (RAS-8 item 2). */
const ROW_1_COLUMN_0 = [0x24, 0x42, 0x47, 0x47, 0x42, 0x43, 0x43] as const;

test("PAR-40, PAR-5, RAS-8: text is TEXT's field and its cell's point, then a text part; the next drawing sends SO again, and after the program's own bytes the pen is selected first", () => {
  const built = new Naplps().pen(2).text("Hi", { row: 1, column: 0 }).pen(3);
  assert.deepEqual(plain(built.parts()), [[0x0e, ...DOMAIN, 0x3e, 0x48, ...TEXT_FIELD, ...ROW_1_COLUMN_0], { text: "Hi" }, [0x0e, 0x3e, 0x4c, 0x1a]]);
  const own = new Naplps()
    .pen(2)
    .bytes(Uint8Array.from([0x0e, 0x3e, 0x70, 0x4c]))
    .text("Hi", { row: 1, column: 0, language: "ar", outside: true });
  assert.deepEqual(plain(own.parts()), [
    [0x0e, ...DOMAIN, 0x3e, 0x48, 0x0e, 0x3e, 0x70, 0x4c, 0x0e, 0x3e, 0x48, ...TEXT_FIELD, ...ROW_1_COLUMN_0],
    { text: "Hi", language: "ar", outside: true },
  ]);
  assert.throws(() => new Naplps().bytes(Uint8Array.from([0x0e])).text("Hi", { row: 1, column: 0 }), /call pen first/u);
  // Row 23, column 39: the dot (468, 479), 127,795.2 across rounded down, 127,795, and 0 up.
  assert.deepEqual(plain(new Naplps().text("x", { row: 23, column: 39 }).parts()), [
    [0x0e, ...DOMAIN, ...TEXT_FIELD, 0x24, 0x58, 0x78, 0x48, 0x60, 0x70, 0x58],
    { text: "x" },
  ]);
  throwsNaming(() => new Naplps().text("x", { row: 0, column: 0 }), "DISPLAY_FIRST_LINE");
  throwsNaming(() => new Naplps().text("x", { row: 24, column: 0 }), "DISPLAY_LINES");
  throwsNaming(() => new Naplps().text("x", { row: 1, column: 40 }), "RASTER_WIDTH");
  throwsNaming(() => new Naplps().text("x", { row: 1.5, column: 0 }), "DISPLAY_LINES");
});

test("PAR-40: a macro is DEF MACRO, its code, contents that shift for themselves, END; definitions do not nest", () => {
  const built = new Naplps().defineMacro(0x21, (contents) => {
    contents.pen(2).rect(0, 20, 12, 20, { filled: true });
  });
  assert.deepEqual(plain(built.parts()), [
    [0x1b, 0x40, 0x21, 0x0e, ...DOMAIN, 0x3e, 0x48, 0x33, 0x42, 0x47, 0x47, 0x42, 0x43, 0x44, 0x40, 0x41, 0x68, 0x72, 0x78, 0x65, 0x1b, 0x45],
  ]);
  assert.throws(() => new Naplps().defineMacro(0x21, (contents) => void contents.defineMacro(0x22, EMPTY)), /do not nest/u);
  assert.throws(() => new Naplps().defineMacro(0x1f, EMPTY), /the 96 macro names/u);
  const { MAX_MACRO_BYTES } = naplpsLimits;
  assert.throws(
    () => new Naplps().defineMacro(0x21, (contents) => void contents.bytes(new Uint8Array(MAX_MACRO_BYTES + 1))),
    (error: unknown) => error instanceof RangeError && error.message.includes("MAX_MACRO_BYTES"),
  );
});

test("PAR-40, RAS-4: an object is ANIM-11's fields in raster dots with their defaults, and one outside its bounds throws naming them", () => {
  const naplps = new Naplps();
  assert.deepEqual(naplps.object({ number: 7, x: 10, y: 20, width: 30, height: 40, frames: [0x21], detectable: true, label: "Play" }), {
    number: 7,
    kind: "macro",
    shown: true,
    detectable: true,
    layer: 1,
    order: 0,
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    origin_x: 0,
    origin_y: 0,
    frames: [0x21],
    label: "Play",
  });
  const { LAYERS, MAX_OBJECT_FRAMES, RASTER_HEIGHT, RASTER_WIDTH } = naplpsLimits;
  assert.equal(naplps.object({ number: 8, x: 0, y: 0, width: RASTER_WIDTH, height: RASTER_HEIGHT, cover: 0 }).kind, "region", "the whole raster");
  throwsNaming(() => naplps.object({ number: 7, x: 0, y: 0, width: RASTER_WIDTH + 1, height: 1 }), "RASTER_WIDTH");
  throwsNaming(() => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: RASTER_HEIGHT + 1 }), "RASTER_HEIGHT");
  throwsNaming(() => naplps.object({ number: 7, x: 0, y: 0, width: 0, height: 1 }), "RASTER_WIDTH");
  assert.throws(
    () => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, frames: Array.from({ length: MAX_OBJECT_FRAMES + 1 }, () => 0x21) }),
    /MAX_OBJECT_FRAMES/u,
  );
  assert.throws(() => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, layer: LAYERS }), /LAYERS/u);
  assert.throws(() => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, kind: "region", frames: [0x21] }), /a region has no frames/u);
  assert.throws(() => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, label: "a\u0007" }), /MAX_LABEL_BYTES/u);
});

test("PAR-40, RAS-6: a place off the raster, a rectangle past its edge, or a polygon of too few or too many points, throws naming the limit", () => {
  const { MAX_VERTICES, RASTER_HEIGHT, RASTER_WIDTH } = naplpsLimits;
  throwsNaming(() => new Naplps().point(RASTER_WIDTH, 0), "RASTER_WIDTH");
  throwsNaming(() => new Naplps().line(0, RASTER_HEIGHT), "RASTER_HEIGHT");
  throwsNaming(() => new Naplps().point(-0.5, 0), "RASTER_WIDTH");
  throwsNaming(() => new Naplps().rect(470, 0, 11, 1), "RASTER_WIDTH");
  throwsNaming(() => new Naplps().rect(0, 490, 1, 11), "RASTER_HEIGHT");
  throwsNaming(() => new Naplps().rect(0, 0, 0, 1), "RASTER_WIDTH");
  throwsNaming(() => new Naplps().rect(0.5, 0, 1, 1), "RASTER_WIDTH");
  assert.equal(new Naplps().rect(470, 490, 10, 10).parts().length, 1, "to the last dot and line it is taken");
  assert.throws(() => new Naplps().polygon([{ x: 0, y: 0 }]), /MAX_VERTICES/u);
  assert.throws(() => new Naplps().polygon(Array.from({ length: MAX_VERTICES + 1 }, () => ({ x: 0, y: 0 }))), /MAX_VERTICES/u);
  assert.throws(() => new Naplps().pen(16), /DEFAULT_PALETTE_BITS/u);
  assert.throws(() => new Naplps().colour(0, 256, 0, 0), /8-bit intensity/u);
});

/** One builder call of an example: a method, its arguments, and for drawing and defineMacro the calls of the builder their contents are built on. */
interface ExampleCall {
  readonly call: string;
  readonly arguments: readonly unknown[];
  readonly build?: readonly ExampleCall[];
}

/** One line of picture-examples.jsonl: a builder's calls and the parts it then gives, or what its one call returns. */
interface Example {
  readonly example: string;
  readonly builder: "regis" | "naplps";
  readonly calls: readonly ExampleCall[];
  readonly parts?: readonly unknown[];
  readonly returns?: unknown;
}

/** Makes `calls` on `builder`, a nested call's contents built on the builder its method hands over; the last call's answer. */
function replay(builder: Regis | Naplps, calls: readonly ExampleCall[]): unknown {
  let answer: unknown = builder;
  for (const { call, arguments: given, build } of calls) {
    const method: unknown = Reflect.get(builder, call);
    if (typeof method !== "function") {
      assert.fail(`${call} is no method of the builder`);
    }
    const listed = build === undefined ? given : [...given, (contents: Regis | Naplps): unknown => replay(contents, build)];
    answer = Reflect.apply(method, builder, listed);
  }
  return answer;
}

/** The parts as the message carries them (PAR-21): bytes that stand together joined, as base64. */
function carried(parts: readonly PicturePart[]): unknown[] {
  const fields = pictureFields("example", parts);
  assert.ok("parts" in fields);
  return fields.parts.map((part) => ("data" in part ? { data: Buffer.from(part.data).toString("base64") } : part));
}

test("PAR-39, PAR-40: the shared examples give exactly the parts they list", () => {
  const lines = readFileSync(join(import.meta.dirname, "fixtures", "picture-examples.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line !== "");
  assert.ok(lines.length > 0);
  for (const line of lines) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the shared file's lines, each read for what it lists and compared whole
    const example = JSON.parse(line) as Example;
    const builder = example.builder === "regis" ? new Regis() : new Naplps();
    const answer = replay(builder, example.calls);
    if (example.returns === undefined) {
      assert.deepEqual(carried(builder.parts()), example.parts, example.example);
    } else {
      assert.deepEqual(answer, example.returns, example.example);
    }
  }
});

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

/** SO, and DOMAIN (section 5.3.2.2, Figure 14): single values of one byte, multi values of four (Table 5, b5 b4 b3 = 011), two dimensions, then the logical pel (0, 0) in four bytes (DEC-6849). */
const SO = 0x0e;
const DOMAIN = [0x21, 0x4c, 0x40, 0x40, 0x40, 0x40] as const;

test("PAR-40: each Naplps method writes the instructions it names, DOMAIN and SO before the first drawing and SDC after the last", () => {
  const SDC = 0x1a;
  // Worked by hand, twelve bits an axis, three of x and three of y a byte, most significant first (section 5.3.1,
  // Figure 11): y = 240 is up 240/480 of the display's 25/32, 800 of 2048 steps, 001 100 100 000; x = 320 is 1024,
  // 010 000 000 000; the top, 1600, is 011 001 000 000; and x = 640 is the largest, 2047, 011 111 111 111 (TODO-6846).
  const cases: readonly (readonly [Naplps, readonly number[]])[] = [
    [new Naplps().reset(), [SO, 0x20, 0x7f, 0x7f, ...DOMAIN, SDC]],
    [new Naplps().clear(), [0x0c]],
    [new Naplps().pen(3), [SO, ...DOMAIN, 0x3e, 0x4c, SDC]],
    // Each primary's eight bits, two to a byte: red 11 11 11 11 in b5 and b2 (Figure 12).
    [new Naplps().colour(1, 255, 0, 0), [SO, ...DOMAIN, 0x3e, 0x44, 0x3c, 0x52, 0x52, 0x52, 0x52, SDC]],
    [new Naplps().point(0, 480), [SO, ...DOMAIN, 0x24, 0x40, 0x40, 0x40, 0x40, SDC]],
    [new Naplps().point(320, 0), [SO, ...DOMAIN, 0x24, 0x53, 0x41, 0x40, 0x40, SDC]],
    [new Naplps().line(640, 480), [SO, ...DOMAIN, 0x28, 0x58, 0x78, 0x78, 0x78, SDC]],
    [new Naplps().rect(0, 0, 320, 240, { filled: true }), [SO, ...DOMAIN, 0x33, 0x41, 0x44, 0x44, 0x40, 0x51, 0x44, 0x44, 0x40, SDC]],
    [new Naplps().rect(0, 0, 320, 240), [SO, ...DOMAIN, 0x32, 0x41, 0x44, 0x44, 0x40, 0x51, 0x44, 0x44, 0x40, SDC]],
    [
      new Naplps().polygon(
        [
          { x: 0, y: 480 },
          { x: 320, y: 0 },
          { x: 640, y: 480 },
        ],
        { filled: true },
      ),
      // The last displacement: across 2047 - 1024 = 1023, 001 111 111 111; up -1600, 4096 - 1600 = 100 111 000 000.
      [SO, ...DOMAIN, 0x37, 0x40, 0x40, 0x40, 0x40, 0x53, 0x41, 0x40, 0x40, 0x4c, 0x7f, 0x78, 0x78, SDC],
    ],
    [new Naplps().reset().clear(), [SO, 0x20, 0x7f, 0x7f, ...DOMAIN, 0x0c]],
    [new Naplps().bytes(Uint8Array.from([0x41])), [SO, ...DOMAIN, 0x41]],
  ];
  for (const [built, written] of cases) {
    assert.deepEqual(plain(built.parts()), [written]);
  }
});

test("PAR-40, PAR-5: text is a text part, the next drawing sends SO again, and after the program's own bytes the pen is selected first", () => {
  const built = new Naplps().pen(2).text("Hi").pen(3);
  assert.deepEqual(plain(built.parts()), [[0x0e, ...DOMAIN, 0x3e, 0x48], { text: "Hi" }, [0x0e, 0x3e, 0x4c, 0x1a]]);
  const own = new Naplps()
    .pen(2)
    .bytes(Uint8Array.from([0x0e, 0x3e, 0x70, 0x4c]))
    .text("Hi", { language: "ar", outside: true });
  assert.deepEqual(plain(own.parts()), [
    [0x0e, ...DOMAIN, 0x3e, 0x48, 0x0e, 0x3e, 0x70, 0x4c, 0x0e, 0x3e, 0x48],
    { text: "Hi", language: "ar", outside: true },
  ]);
  assert.throws(() => new Naplps().bytes(Uint8Array.from([0x0e])).text("Hi"), /call pen first/u);
});

test("PAR-40: a macro is DEF MACRO, its code, contents that shift for themselves, END; definitions do not nest", () => {
  const built = new Naplps().defineMacro(0x21, (contents) => {
    contents.pen(2).rect(0, 0, 320, 240, { filled: true });
  });
  assert.deepEqual(plain(built.parts()), [[0x1b, 0x40, 0x21, 0x0e, ...DOMAIN, 0x3e, 0x48, 0x33, 0x41, 0x44, 0x44, 0x40, 0x51, 0x44, 0x44, 0x40, 0x1b, 0x45]]);
  assert.throws(() => new Naplps().defineMacro(0x21, (contents) => void contents.defineMacro(0x22, EMPTY)), /do not nest/u);
  assert.throws(() => new Naplps().defineMacro(0x1f, EMPTY), /the 96 macro names/u);
  const { MAX_MACRO_BYTES } = naplpsLimits;
  assert.throws(
    () => new Naplps().defineMacro(0x21, (contents) => void contents.bytes(new Uint8Array(MAX_MACRO_BYTES + 1))),
    (error: unknown) => error instanceof RangeError && error.message.includes("MAX_MACRO_BYTES"),
  );
});

test("PAR-40: an object is ANIM-11's fields with their defaults, and one outside its bounds throws naming them", () => {
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
  assert.equal(naplps.object({ number: 8, x: 0, y: 0, width: 640, height: 480, cover: 0 }).kind, "region");
  const { LAYERS, MAX_OBJECT_FRAMES, OBJECT_PICTURE_WIDTH } = naplpsLimits;
  assert.throws(() => naplps.object({ number: 7, x: 0, y: 0, width: OBJECT_PICTURE_WIDTH + 1, height: 1 }), /OBJECT_PICTURE_WIDTH/u);
  assert.throws(
    () => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, frames: Array.from({ length: MAX_OBJECT_FRAMES + 1 }, () => 0x21) }),
    /MAX_OBJECT_FRAMES/u,
  );
  assert.throws(() => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, layer: LAYERS }), /LAYERS/u);
  assert.throws(() => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, kind: "region", frames: [0x21] }), /a region has no frames/u);
  assert.throws(() => naplps.object({ number: 7, x: 0, y: 0, width: 1, height: 1, label: "a\u0007" }), /MAX_LABEL_BYTES/u);
});

test("PAR-40: a coordinate outside the design picture, or a polygon of too few or too many points, throws naming the limit", () => {
  const { MAX_VERTICES, OBJECT_PICTURE_HEIGHT, OBJECT_PICTURE_WIDTH } = naplpsLimits;
  assert.throws(() => new Naplps().point(OBJECT_PICTURE_WIDTH + 1, 0), /OBJECT_PICTURE_WIDTH/u);
  assert.throws(() => new Naplps().line(0, OBJECT_PICTURE_HEIGHT + 1), /OBJECT_PICTURE_HEIGHT/u);
  assert.throws(() => new Naplps().rect(600, 0, 41, 1), /OBJECT_PICTURE_WIDTH/u);
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

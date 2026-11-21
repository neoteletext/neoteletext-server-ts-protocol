// DEC-7036 item 7, TODO-7033 (tested by TODO-7079 step 5): the ReGIS
// renderer's own program, regis-render, as an oracle run as a separate
// program (DEVELOPMENT.md section 8). What the Regis builder writes for each
// attribute at the edge of its bound is a batch the renderer commits; the
// same attribute one past the edge, written by hand since the builder
// refuses it, is a batch the renderer fails; and the attributes that move,
// hide and clip a drawing, and delete and deleteAll, draw what the same
// picture drawn without them draws. regis-render says on standard error how
// many batches it committed ("numbered drawings: N commits"), and says
// nothing when no drawing is left.
//
// regis-render is REGIS_RENDER, or target/release/regis-render in the ReGIS
// renderer's repository (NEOTELETEXT_REGIS, or ~/devel/neoteletext-renderer-regis);
// built with `cargo build --release -p regis-render` there. Without it the
// tests are skipped, saying so; with REGIS_RENDER naming a file that is not
// there they fail.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Regis, type RegisDrawingAttributes, regisLimits } from "../src/index.ts";

const { LAYERS, MAX_COORDINATE, MAX_DRAWING_NUMBER, MAX_LABEL_BYTES, MAX_OBJECT_FRAMES, MAX_PAINT_RATE, MIN_COORDINATE } = regisLimits;

/** The renderer's program, and why the tests are skipped when it is not found. */
const asked = process.env["REGIS_RENDER"];
const RENDERER = asked ?? join(process.env["NEOTELETEXT_REGIS"] ?? join(homedir(), "devel", "neoteletext-renderer-regis"), "target", "release", "regis-render");
const SKIP =
  asked === undefined && !existsSync(RENDERER)
    ? `needs the ReGIS renderer's regis-render at ${RENDERER} (cargo build --release -p regis-render in that repository), or REGIS_RENDER naming it`
    : false;

/** The folder each rendering is written in. */
const SCRATCH = SKIP === false ? mkdtempSync(join(tmpdir(), "regis-oracle-")) : "";

/** What regis-render made of one stream: its image's bytes and how many batches it committed. */
interface Rendered {
  readonly image: Buffer;
  readonly commits: number;
}

let renderings = 0;

/** Renders `commands`, bare ReGIS, with regis-render to a PPM image. */
function render(commands: string): Rendered {
  renderings += 1;
  const input = join(SCRATCH, `${renderings}.rgs`);
  const output = join(SCRATCH, `${renderings}.ppm`);
  writeFileSync(input, Buffer.from(commands, "latin1"));
  const run = spawnSync(RENDERER, [input, output], { encoding: "utf8" });
  assert.equal(run.status, 0, `regis-render failed: ${run.stderr}`);
  const commits = /numbered drawings: ([0-9]+) commits/u.exec(run.stderr)?.[1];
  return { image: readFileSync(output), commits: commits === undefined ? 0 : Number(commits) };
}

/** The commands a builder wrote, as one string: these builds have no text part. */
function commandsOf(built: Regis): string {
  const parts = built.parts();
  assert.ok(parts.every((part) => typeof part === "string"));
  return parts.join("");
}

/** A drawing's contents: a move to its origin, which draws nothing. */
const AT_ORIGIN = (contents: Regis): void => {
  contents.at(0, 0);
};

/**
 * Drawings 1 and MAX_DRAWING_NUMBER committed first: so that regis-render reports the count even when the batch after it
 * fails, and so that an attribute naming the last drawing names one that exists, as the renderer asks of a reference.
 */
const FIRST = commandsOf(new Regis().drawing(1, {}, AT_ORIGIN).drawing(MAX_DRAWING_NUMBER, {}, AT_ORIGIN).commit());

test("TODO-7079: the stream of every attribute, then set, delete and deleteAll, is what the renderer commits", { skip: SKIP }, () => {
  const built = new Regis()
    .drawing(
      7,
      {
        parent: 0,
        source: 3,
        x: -5,
        y: 6,
        depth: MIN_COORDINATE,
        visible: false,
        clip: { x: 1, y: 2, width: 0, height: MAX_COORDINATE },
        detectable: true,
        layer: LAYERS - 1,
        hover: 4,
        pressed: 5,
        alternative: 6,
        frames: [1, MAX_DRAWING_NUMBER],
        rate: MAX_PAINT_RATE,
        label: "it's",
      },
      (contents) => {
        contents.at(1, 2).line(3, 4);
      },
    )
    .commit()
    .set(7, { visible: true, clip: null, frames: [], rate: 0, label: "" })
    .commit()
    .delete(7)
    .commit()
    .deleteAll()
    .commit();
  assert.equal(render(commandsOf(built)).commits, 4);
});

/** A frame list of `length` drawings that exist: 1 and the last drawing, by turns. */
function framesOf(length: number): number[] {
  return Array.from({ length }, (_, at) => (at % 2 === 0 ? 1 : MAX_DRAWING_NUMBER));
}

/** Each attribute at the edge of its bound, as the builder writes it, and one past the edge as the grammar would write it. */
const EDGES: readonly (readonly [string, RegisDrawingAttributes, string])[] = [
  ["parent", { parent: MAX_DRAWING_NUMBER }, `P${MAX_DRAWING_NUMBER + 1}`],
  ["source", { source: MAX_DRAWING_NUMBER }, `R${MAX_DRAWING_NUMBER + 1}`],
  ["hover", { hover: MAX_DRAWING_NUMBER }, `H${MAX_DRAWING_NUMBER + 1}`],
  ["layer", { layer: LAYERS - 1 }, `G${LAYERS}`],
  ["rate", { rate: MAX_PAINT_RATE }, `T${MAX_PAINT_RATE + 1}`],
  ["clip width", { clip: { x: 0, y: 0, width: 0, height: 0 } }, "C(X0,Y0,W-1,H0)"],
  ["frames", { frames: framesOf(MAX_OBJECT_FRAMES) }, `F(${framesOf(MAX_OBJECT_FRAMES + 1).join(",")})`],
  ["frame", { frames: [1] }, "F(0)"],
  ["label", { label: "a".repeat(MAX_LABEL_BYTES) }, `U'${"a".repeat(MAX_LABEL_BYTES + 1)}'`],
];

test("TODO-7079: each bound the builder holds to is the renderer's: at the edge a batch commits, one past it the batch fails", { skip: SKIP }, () => {
  for (const [what, attributes, past] of EDGES) {
    const edge = commandsOf(new Regis().set(2, attributes).commit());
    assert.equal(render(FIRST + edge).commits, 2, `${what} at its edge: ${edge}`);
    assert.equal(render(`${FIRST}D(S2(${past}))D(C)`).commits, 1, `${what} one past its edge: ${past}`);
  }
});

/** A filled square of side `side` at (`x`, `y`) in pen 3, as a drawing's contents. */
function square(x: number, y: number, side: number): (contents: Regis) => void {
  return (contents) => {
    contents.pen(3).box(x, y, side, side, { fill: true });
  };
}

test("TODO-7079: x and y move a drawing as drawing it there does; visible false, delete and deleteAll leave the screen blank", { skip: SKIP }, () => {
  const there = render(commandsOf(new Regis().drawing(1, {}, square(100, 50, 40)).commit())).image;
  const moved = render(commandsOf(new Regis().drawing(1, { x: 100, y: 50 }, square(0, 0, 40)).commit())).image;
  assert.ok(moved.equals(there), "x and y");
  const setLater = render(
    commandsOf(
      new Regis()
        .drawing(1, {}, square(0, 0, 40))
        .commit()
        .set(1, { x: 100, y: 50 })
        .commit(),
    ),
  ).image;
  assert.ok(setLater.equals(there), "x and y by set, after the drawing was shown");
  const blank = render(commandsOf(new Regis().erase())).image;
  assert.ok(!there.equals(blank), "the square is drawn");
  const hidden = render(commandsOf(new Regis().drawing(1, { visible: false }, square(100, 50, 40)).commit())).image;
  assert.ok(hidden.equals(blank), "visible false");
  const deleted = render(
    commandsOf(
      new Regis()
        .drawing(1, {}, square(100, 50, 40))
        .commit()
        .delete(1)
        .commit(),
    ),
  ).image;
  assert.ok(deleted.equals(blank), "delete");
  const allDeleted = render(
    commandsOf(
      new Regis()
        .drawing(1, {}, square(100, 50, 40))
        .drawing(2, {}, square(300, 50, 40))
        .commit()
        .deleteAll()
        .commit(),
    ),
  ).image;
  assert.ok(allDeleted.equals(blank), "deleteAll");
});

test("TODO-7079: a clip rectangle shows only its own width and height of the drawing, and C0 takes it away", { skip: SKIP }, () => {
  const big = render(commandsOf(new Regis().drawing(1, {}, square(100, 50, 40)).commit())).image;
  const clipped = render(commandsOf(new Regis().drawing(1, { x: 100, y: 50, clip: { x: 0, y: 0, width: 10, height: 10 } }, square(0, 0, 40)).commit())).image;
  // A box's side is from its first pixel to its last (manual chapter 4), so a box of side 9 covers ten pixels, as a clip ten wide shows.
  const tenPixels = render(commandsOf(new Regis().drawing(1, {}, square(100, 50, 9)).commit())).image;
  assert.ok(clipped.equals(tenPixels), "clipped to ten pixels square");
  assert.ok(!clipped.equals(big), "the clip hides the rest");
  const unclipped = render(
    commandsOf(
      new Regis()
        .drawing(1, { x: 100, y: 50, clip: { x: 0, y: 0, width: 10, height: 10 } }, square(0, 0, 40))
        .commit()
        .set(1, { clip: null })
        .commit(),
    ),
  ).image;
  assert.ok(unclipped.equals(big), "C0");
});

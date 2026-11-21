// Writes src/picture/regis-limits.ts and src/picture/naplps-limits.ts, the
// limits of the ReGIS and NAPLPS renderers the kit's picture builders hold
// their calls to (renderer parity PAR-39, PAR-40), and with them each
// renderer's animation budget (animation.md ANIM-16), of which the teletext
// renderer's, the engine's, is src/animation/teletext-limits.ts: all from
// the renderers' own files, their one home. Each constant keeps the
// renderer's name, its value as the renderer writes it and its comment.
//   node scripts/picture-limits.ts SOURCES           write the files
//   node scripts/picture-limits.ts SOURCES --check   fail when a file differs
// SOURCES is a folder holding teletext/, regis/ and naplps/, each the
// renderer's files at the paths below; scripts/check.sh fills it from each
// renderer's repository at the commit LIMITS_FROM, REGIS_FROM or NAPLPS_FROM
// names.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** One constant: its name, its value as the renderer writes it, and its comment's lines. */
interface Limit {
  readonly name: string;
  readonly value: string;
  readonly comment: readonly string[];
}

/** One renderer's file and the constants of it the builders use. */
interface Source {
  readonly path: string;
  readonly names: readonly string[];
}

/** One generated file: its renderer, the name in scripts/check.sh of the commit its sources are read at, where it is written under src/, its sources and what it says of itself. */
interface Output {
  readonly renderer: "teletext" | "regis" | "naplps";
  readonly pin: string;
  readonly file: string;
  readonly what: readonly string[];
  readonly sources: readonly Source[];
}

const OUTPUTS: readonly Output[] = [
  {
    renderer: "teletext",
    pin: "LIMITS_FROM",
    file: "animation/teletext-limits.ts",
    what: [
      "The teletext renderer's limits of a sub-page's animation, its controls and",
      "its object pages (animation.md ANIM-16, ANIM-17; EN 300 706 clause 10.5.1)",
    ],
    sources: [
      {
        path: "crates/neoteletext-core/src/limits.rs",
        names: ["LAYERS", "MAX_SPRITES", "MAX_ANIMATED_OBJECTS", "MAX_CYCLING_OBJECTS", "MAX_OBJECT_FRAMES"],
      },
      { path: "crates/neoteletext-core/src/controls.rs", names: ["MAX_CONTROLS"] },
      { path: "crates/neoteletext-core/src/consts/object_pages.rs", names: ["OBJECT_TYPES", "OBJECTS_PER_TYPE"] },
      { path: "crates/neoteletext-picture/src/tti.rs", names: ["OBJECT_SUBPAGES"] },
    ],
  },
  {
    renderer: "regis",
    pin: "REGIS_FROM",
    file: "picture/regis-limits.ts",
    what: ["The ReGIS renderer's limits the Regis builder holds its calls to (renderer parity PAR-39)", "and of a picture's animation (animation.md ANIM-16)"],
    sources: [
      {
        path: "crates/regis/src/limits.rs",
        names: [
          "MAX_COORDINATE",
          "MIN_COORDINATE",
          "MAX_CELL_SIDE",
          "MAX_DRAWING_NUMBER",
          "LAYERS",
          "MAX_OBJECT_FRAMES",
          "MAX_PAINT_RATE",
          "MAX_LABEL_BYTES",
          "MAX_TITLE_BYTES",
          "MAX_ANIMATED_DRAWINGS",
          "MAX_CYCLING_OBJECTS",
        ],
      },
      { path: "crates/regis/src/palette.rs", names: ["COLOURS"] },
      { path: "crates/regis/src/surface.rs", names: ["SCREEN_WIDTH", "SCREEN_HEIGHT"] },
    ],
  },
  {
    renderer: "naplps",
    pin: "NAPLPS_FROM",
    file: "picture/naplps-limits.ts",
    what: [
      "The NAPLPS renderer's limits the Naplps builder holds its calls to (renderer parity PAR-40)",
      "and of a picture's animation (animation.md ANIM-16)",
    ],
    sources: [
      {
        path: "crates/naplps/src/limits.rs",
        names: [
          "MAX_MACRO_BYTES",
          "MAX_VERTICES",
          "LAYERS",
          "MAX_OBJECT_FRAMES",
          "RASTER_WIDTH",
          "RASTER_HEIGHT",
          "RASTER_ROW_LINES",
          "DISPLAY_FIRST_LINE",
          "DISPLAY_LINES",
          "MAX_LABEL_BYTES",
          "MAX_OBJECTS",
          "MAX_ANIMATED_OBJECTS",
          "MAX_CYCLING_OBJECTS",
          "DEFINABLE_CODES",
        ],
      },
      { path: "crates/naplps/src/surface.rs", names: ["DISPLAY_HEIGHT_NUMERATOR", "DISPLAY_HEIGHT_DENOMINATOR"] },
      { path: "crates/naplps-render/src/main.rs", names: ["DEFAULT_PALETTE_BITS"] },
    ],
  },
];

/** The constant `name` of a renderer's file: its plain integer value and the comment above it. */
function limitOf(lines: readonly string[], name: string, path: string): Limit {
  const at = lines.findIndex((line) => new RegExp(`^pub(?:\\(crate\\))? const ${name}: `, "u").test(line));
  const declared = /^pub(?:\(crate\))? const [A-Z0-9_]+: [a-z0-9]+ = (-?[0-9_]+);$/u.exec(lines[at] ?? "");
  if (declared?.[1] === undefined) {
    throw new Error(`${name} has no plain integer value in ${path}`);
  }
  const comment: string[] = [];
  for (let above = at - 1; above >= 0 && (lines[above] ?? "").startsWith("///"); above -= 1) {
    // Rust's intra-document links, [`NAME`] and [`NAME`](path), are plain names here.
    comment.unshift((lines[above] ?? "").replace(/^\/\/\/ ?/u, "").replaceAll(/\[`([^`]+)`\](?:\([^)]*\))?/gu, "`$1`"));
  }
  return { name, value: declared[1], comment };
}

/** The text of one generated file from the renderer's files under `root`. */
function generated(output: Output, root: string): string {
  const limits = output.sources.flatMap(({ path, names }) => {
    const lines = readFileSync(join(root, output.renderer, path), "utf8").split("\n");
    return names.map((name) => limitOf(lines, name, path));
  });
  const header = [
    ...output.what.map((line, at) => `// ${line}${at === output.what.length - 1 ? "," : ""}`),
    "// generated by scripts/picture-limits.ts from the renderer's files, their one",
    "// home:",
    ...output.sources.map(({ path }) => `//   ${path}`),
    `// at the commit scripts/check.sh names (${output.pin}), which checks this copy against them.`,
    "// Each keeps the renderer's name: write a limit by its name, never its",
    "// figure. Do not edit this file; generate it.",
    "",
  ];
  const body = limits.flatMap(({ name, value, comment }) => [
    ...(comment.length === 1 ? [`/** ${comment[0] ?? ""} */`] : ["/**", ...comment.map((line) => ` * ${line}`.trimEnd()), " */"]),
    `export const ${name} = ${value};`,
  ]);
  return [...header, ...body, ""].join("\n");
}

const [root, mode] = process.argv.slice(2);
if (root === undefined || (mode !== undefined && mode !== "--check")) {
  throw new Error("usage: node scripts/picture-limits.ts SOURCES [--check]");
}
for (const output of OUTPUTS) {
  const path = join(import.meta.dirname, "..", "src", output.file);
  const text = generated(output, root);
  if (mode === "--check") {
    if (readFileSync(path, "utf8") !== text) {
      throw new Error(`src/${output.file} differs from what the ${output.renderer} renderer's files give: generate it again`);
    }
  } else {
    writeFileSync(path, text);
  }
}

// DEC-7036, TODO-7055 (tested by TODO-7080 steps 2 and 3): the generators of
// the kit's copies of the engine's and the renderers' figures, run as
// scripts/check.sh runs them, on small planted engine files. Each script
// writes beside itself (its ../src), so each is run from a copy in a
// scratch folder, never over the kit's own files.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { naplpsLimits, regisLimits, teletextLimits } from "../src/index.ts";

/** The kit's folder. */
const KIT = join(import.meta.dirname, "..");

/** A scratch folder holding a copy of the kit's `script` at scripts/, and the src/ folders it writes into. */
function scratchWith(script: string, outputs: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "kit-generator-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(KIT, "scripts", script), join(root, "scripts", script));
  for (const output of outputs) {
    mkdirSync(join(root, "src", output), { recursive: true });
  }
  return root;
}

/** Writes `files`, each a path under `root` and its lines. */
function plant(root: string, files: Readonly<Record<string, readonly string[]>>): void {
  for (const [path, lines] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), [...lines, ""].join("\n"));
  }
}

/** Runs the copy of `script` in `root` on the planted sources. */
function run(root: string, script: string): { readonly status: number | null; readonly stderr: string } {
  return spawnSync(process.execPath, [join(root, "scripts", script), join(root, "sources")], { encoding: "utf8" });
}

const KEYS = "sources/crates/neoteletext-input/src/keys.rs";
const ONE_BYTE = "sources/crates/neoteletext-input/src/keys/one_byte.rs";
const KEY_NAMES = "sources/crates/neoteletext-input/src/names.rs";

/** A Rust table of strings as the engine writes one: its declaration, one name a line, some with a comment. */
function table(declaration: string, count: number, names: readonly string[]): string[] {
  return [
    "//! A planted table.",
    "",
    `${declaration}: [&str; ${count}] = [`,
    ...names.map((name, at) => `    "${name}",${at === 0 ? " // planted" : ""}`),
    "];",
  ];
}

/** Engine files whose tables give `oneByte` and `keyNames`, FIRST_NAMED `first`, each table declaring `declared` names when given. */
function keyFiles(
  oneByte: readonly string[],
  keyNames: readonly string[],
  options: { readonly first?: number; readonly declared?: number } = {},
): Record<string, readonly string[]> {
  return {
    [KEYS]: ["/// Where the codes of the remaining W3C names begin.", `pub const FIRST_NAMED: u32 = ${options.first ?? oneByte.length};`],
    [ONE_BYTE]: table("pub(super) const ONE_BYTE", options.declared ?? oneByte.length, oneByte),
    [KEY_NAMES]: table("pub const KEY_NAMES", keyNames.length, keyNames),
  };
}

/** The names the generated src/input/functional-keys.ts holds, in order. */
function generatedKeys(root: string): string[] {
  const text = readFileSync(join(root, "src", "input", "functional-keys.ts"), "utf8");
  return [...text.matchAll(/^ {2}"([A-Za-z0-9]*)",$/gmu)].map(([, name]) => name ?? "");
}

test("TODO-7055: key-codes.ts writes ONE_BYTE's names at their places, then KEY_NAMES' that ONE_BYTE does not hold, in their order", () => {
  const root = scratchWith("key-codes.ts", ["input"]);
  plant(root, keyFiles(["", "Escape", "Enter", "", "Tab"], ["Unidentified", "Enter", "Alt", "Tab", "AltGraph"]));
  const ran = run(root, "key-codes.ts");
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(generatedKeys(root), ["", "Escape", "Enter", "", "Tab", "Unidentified", "Alt", "AltGraph"]);
});

test("TODO-7055: key-codes.ts fails, writing nothing, on engine files it cannot read as the engine's tables", () => {
  const cases: readonly (readonly [string, Record<string, readonly string[]>, RegExp])[] = [
    ["ONE_BYTE's length is not FIRST_NAMED", keyFiles(["", "Escape"], ["Alt"], { first: 3 }), /ONE_BYTE holds 2 codes, which is not where FIRST_NAMED says/u],
    ["a declared count differs from the lines", keyFiles(["", "Escape"], ["Alt"], { first: 2, declared: 3 }), /ONE_BYTE in .* declares 3 names and lists 2/u],
    [
      "a line that is no name",
      { ...keyFiles(["", "Escape"], ["Alt"]), [KEY_NAMES]: ["pub const KEY_NAMES: [&str; 1] = [", "    Alt,", "];"] },
      /a line of KEY_NAMES in .* is no name:     Alt,/u,
    ],
    ["a key named twice", keyFiles(["", "Escape", "Escape"], ["Alt"]), /a key is named twice/u],
    ["no FIRST_NAMED", { ...keyFiles(["", "Escape"], ["Alt"]), [KEYS]: ["pub const FIRST: u32 = 2;"] }, /has no FIRST_NAMED/u],
    ["no table", { ...keyFiles(["", "Escape"], ["Alt"]), [KEY_NAMES]: ["pub const OTHER: [&str; 1] = [", '    "Alt",', "];"] }, /has no table KEY_NAMES/u],
  ];
  for (const [what, files, refusal] of cases) {
    const root = scratchWith("key-codes.ts", ["input"]);
    plant(root, files);
    const ran = run(root, "key-codes.ts");
    assert.notEqual(ran.status, 0, what);
    assert.match(ran.stderr, refusal, what);
    assert.equal(existsSync(join(root, "src", "input", "functional-keys.ts")), false, `${what}: nothing is written`);
  }
});

/** Each generated file of picture-limits.ts: its renderer's folder, where it is written, and the constants it holds. */
const PICTURE_LIMITS = [
  { renderer: "teletext", file: "animation/teletext-limits.ts", names: Object.keys(teletextLimits) },
  { renderer: "regis", file: "picture/regis-limits.ts", names: Object.keys(regisLimits) },
  { renderer: "naplps", file: "picture/naplps-limits.ts", names: Object.keys(naplpsLimits) },
] as const;

/** The renderer's files a generated file names in its header: `//   crates/…`. */
function sourcesOf(file: string): string[] {
  return [...readFileSync(join(KIT, "src", file), "utf8").matchAll(/^\/\/ {3}(crates\/\S+)$/gmu)].map(([, path]) => path ?? "");
}

test("TODO-7055: picture-limits.ts keeps each constant's name, its value as written and its comment, a link [`NAME`](path) made a plain name", () => {
  const root = scratchWith("picture-limits.ts", ["animation", "picture"]);
  // Every renderer's file holds every constant of its renderer: the generator takes from each the ones it reads there.
  for (const { renderer, file, names } of PICTURE_LIMITS) {
    const lines = names.flatMap((name, at) =>
      name === "MAX_SPRITES"
        ? [
            "/// At most [`LAYERS`] layers of them, as [`MAX_CONTROLS`](crate::controls::MAX_CONTROLS) are,",
            "/// two lines.",
            `pub(crate) const ${name}: i32 = -${at + 1}_000;`,
          ]
        : [`/// The planted ${name}.`, `pub const ${name}: usize = ${at + 1}_00${at};`],
    );
    const sources = sourcesOf(file);
    assert.ok(sources.length > 0, file);
    plant(root, Object.fromEntries(sources.map((path) => [join("sources", renderer, path), ["//! Planted.", "", ...lines]])));
  }
  const ran = run(root, "picture-limits.ts");
  assert.equal(ran.status, 0, ran.stderr);
  for (const { file, names } of PICTURE_LIMITS) {
    const text = readFileSync(join(root, "src", file), "utf8");
    assert.deepEqual(
      [...text.matchAll(/^export const ([A-Z0-9_]+) = /gmu)].map(([, name]) => name ?? "").toSorted((one, other) => one.localeCompare(other)),
      [...names].toSorted((one, other) => one.localeCompare(other)),
      file,
    );
    for (const [at, name] of names.entries()) {
      const written =
        name === "MAX_SPRITES"
          ? ["/**", " * At most `LAYERS` layers of them, as `MAX_CONTROLS` are,", " * two lines.", " */", `export const ${name} = -${at + 1}_000;`]
          : [`/** The planted ${name}. */`, `export const ${name} = ${at + 1}_00${at};`];
      assert.ok(text.includes(written.join("\n")), `${file}: ${name}`);
    }
  }
  assert.ok(PICTURE_LIMITS[0].names.includes("MAX_SPRITES"), "the teletext file holds the constant planted with links");
});

test("TODO-7055: picture-limits.ts fails on a constant that is missing or not a plain integer", () => {
  for (const value of ["missing", "2 * OTHER"]) {
    const root = scratchWith("picture-limits.ts", ["animation", "picture"]);
    for (const { renderer, file, names } of PICTURE_LIMITS) {
      const lines = names.flatMap((name) => {
        if (name !== "MAX_SPRITES") {
          return [`pub const ${name}: u32 = 1;`];
        }
        return value === "missing" ? [] : [`pub const ${name}: u32 = ${value};`];
      });
      plant(root, Object.fromEntries(sourcesOf(file).map((path) => [join("sources", renderer, path), lines])));
    }
    const ran = run(root, "picture-limits.ts");
    assert.notEqual(ran.status, 0, value);
    assert.match(ran.stderr, /MAX_SPRITES has no plain integer value in crates\/neoteletext-core\/src\/limits\.rs/u, value);
  }
});

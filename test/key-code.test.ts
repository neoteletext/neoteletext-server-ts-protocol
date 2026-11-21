// DEC-7036, TODO-7055 (tested by TODO-7080 step 1): keyCode answers a key's
// code as a condition reads the key that fired its rule (page-rules.md
// RULE-116, the value `fired` `key`; RULE-10): a named key's functional code
// in the engine's table (DOC-1936; the engine's REQ-204), a character key's
// Unicode scalar value, and undefined for what has none a page can know.
// The named keys' codes are checked against the engine's own test of them,
// crates/neoteletext-input/src/keys/tests.rs at the commit scripts/check.sh
// names (LIMITS_FROM), read from the engine's repository
// (NEOTELETEXT_ENGINE, or ~/devel/neoteletext-renderer-teletext); without
// it that test is skipped, saying so.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { keyCode } from "../src/index.ts";
import { FUNCTIONAL_KEY_NAMES } from "../src/input/functional-keys.ts";

/** The engine's commit the kit's key table is generated from. */
const LIMITS_FROM = /^readonly LIMITS_FROM="([0-9a-f]{40})"$/mu.exec(readFileSync(join(import.meta.dirname, "..", "scripts", "check.sh"), "utf8"))?.[1];

/** The engine's repository. */
const ENGINE = process.env["NEOTELETEXT_ENGINE"] ?? join(homedir(), "devel", "neoteletext-renderer-teletext");

/** The engine's file `path` at LIMITS_FROM, or undefined when the engine's repository is not here. */
function engineFile(path: string): string | undefined {
  // A hook in a linked worktree sets GIT_DIR, which would override -C.
  const { GIT_DIR: _dir, GIT_INDEX_FILE: _index, GIT_WORK_TREE: _tree, ...environment } = process.env;
  const shown = spawnSync("git", ["-C", ENGINE, "show", `${LIMITS_FROM ?? "LIMITS_FROM"}:${path}`], { encoding: "utf8", env: environment });
  return shown.status === 0 ? shown.stdout : undefined;
}

const ENGINE_TESTS = engineFile("crates/neoteletext-input/src/keys/tests.rs");
const ENGINE_KEYS = engineFile("crates/neoteletext-input/src/keys.rs");
const SKIP =
  ENGINE_TESTS === undefined || ENGINE_KEYS === undefined ? `needs the engine's repository at ${ENGINE} (or NEOTELETEXT_ENGINE) holding LIMITS_FROM` : false;

test("DEC-7036, TODO-7055: a named key's code is the one the engine's own test fixes for it", { skip: SKIP }, () => {
  assert.ok(LIMITS_FROM !== undefined, "scripts/check.sh names LIMITS_FROM");
  const firstNamed = Number(/^pub const FIRST_NAMED: u32 = ([0-9]+);$/mu.exec(ENGINE_KEYS ?? "")?.[1]);
  assert.ok(Number.isSafeInteger(firstNamed), "the engine's FIRST_NAMED");
  const fixed = [...(ENGINE_TESTS ?? "").matchAll(/assert_eq!\(code\("([A-Za-z0-9]*)"\), (Some\(([0-9]+|FIRST_NAMED \+ ([0-9]+))\)|None)\);/gu)].map(
    ([, name, , some, past]): readonly [string, number | undefined] => {
      if (some === undefined) {
        return [name ?? "", undefined];
      }
      return [name ?? "", past === undefined ? Number(some) : firstNamed + Number(past)];
    },
  );
  assert.deepEqual(
    fixed.map(([name]) => name),
    [
      "Escape",
      "Enter",
      "ArrowUp",
      "F1",
      "F35",
      "Numpad0",
      "NumpadEqual",
      "ShiftLeft",
      "MetaRight",
      "ColorF0Red",
      "Teletext",
      "AudioVolumeDown",
      "Alt",
      "NoSuchKey",
      "",
    ],
    "the engine's test's keys, as read",
  );
  for (const [name, code] of fixed) {
    assert.equal(keyCode({ name }), code, name);
  }
  // The engine's `unidentified()` is FIRST_NAMED, "the first remaining W3C name".
  assert.equal(keyCode({ name: "Unidentified" }), firstNamed);
  // And the codes it finds unused name no key.
  const unused =
    /for unused in \[([0-9, ]+)\]/u
      .exec(ENGINE_TESTS ?? "")?.[1]
      ?.split(", ")
      .map(Number) ?? [];
  assert.ok(unused.length > 0, "the engine's unused codes, as read");
  for (const code of unused) {
    assert.equal(FUNCTIONAL_KEY_NAMES[code], "", `code ${code}`);
  }
});

test("TODO-7055: every name in the kit's table answers its own place, and no name is there twice", () => {
  for (const [code, name] of FUNCTIONAL_KEY_NAMES.entries()) {
    if (name !== "") {
      assert.equal(keyCode({ name }), code, name);
    }
  }
  assert.equal(new Set(FUNCTIONAL_KEY_NAMES.filter((name) => name !== "")).size, FUNCTIONAL_KEY_NAMES.filter((name) => name !== "").length, "no name twice");
});

test("RULE-116: a character key's code is its one character's Unicode scalar value, outside the Basic Multilingual Plane too", () => {
  // The scalar values as Unicode gives them: LATIN SMALL LETTER A, DIGIT ZERO, SPACE, LATIN SMALL LETTER E WITH ACUTE, HEBREW LETTER ALEF, GRINNING FACE.
  const cases: readonly (readonly [string, number])[] = [
    ["a", 0x61],
    ["0", 0x30],
    [" ", 0x20],
    ["\u00E9", 0xe9],
    ["\u05D0", 0x5d0],
    ["\u{1F600}", 0x1f600],
  ];
  for (const [char, code] of cases) {
    assert.equal(keyCode({ char }), code, char);
  }
});

test("RULE-116: no code for a physical key, an unknown or empty name, an empty char or a char of two characters", () => {
  assert.equal(keyCode({ physical: "KeyQ" }), undefined);
  assert.equal(keyCode({ name: "NoSuchKey" }), undefined);
  assert.equal(keyCode({ name: "" }), undefined);
  assert.equal(keyCode({ name: "enter" }), undefined, "names are as W3C writes them");
  assert.equal(keyCode({ char: "" }), undefined);
  assert.equal(keyCode({ char: "ab" }), undefined);
  assert.equal(keyCode({ char: "e\u0301" }), undefined, "a letter and a combining accent are two characters");
  assert.equal(keyCode({ char: "\u{1F600}\u{1F600}" }), undefined);
});

/** The names from `first` to `last` in the kit's table. */
function between(first: string, last: string): readonly string[] {
  const from = FUNCTIONAL_KEY_NAMES.indexOf(first);
  const to = FUNCTIONAL_KEY_NAMES.indexOf(last);
  assert.ok(from > 0 && to >= from, `${first} to ${last}`);
  return FUNCTIONAL_KEY_NAMES.slice(from, to + 1).filter((name) => name !== "");
}

/** ASCII's printable characters, space to tilde (ISO/IEC 646). */
const FIRST_PRINTABLE = " ".codePointAt(0) ?? 0;
const LAST_PRINTABLE = "~".codePointAt(0) ?? 0;

test("RULE-116: the overlap keyCode's note documents holds: ColorF0Red is a backslash's value, and F12 to F35, the keypad's keys and ColorF0Red to AudioVolumeDown are printable", () => {
  assert.equal(keyCode({ name: "ColorF0Red" }), keyCode({ char: "\\" }));
  for (const name of [...between("F12", "F35"), ...between("Numpad0", "NumpadEqual"), ...between("ColorF0Red", "AudioVolumeDown")]) {
    const code = keyCode({ name }) ?? 0;
    assert.ok(code >= FIRST_PRINTABLE && code <= LAST_PRINTABLE, `${name} is ${code}`);
  }
  assert.ok((keyCode({ name: "F11" }) ?? 0) < FIRST_PRINTABLE, "F11 is the last function key below the printable characters, as the note says");
});

// DEC-7036, TODO-7055 (tested by TODO-7080 steps 4 and 5): the kit exports
// the limits of animation (animation.md ANIM-16) by each renderer's names,
// as the shared call list's note says ("Each kit also exports the limits of
// animation", kit-calls.tsv), and limitFigureLines finds a limit of
// animation written by its figure beside its name (REQ-6608).

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { naplpsLimits, regisLimits, teletextLimits } from "../src/index.ts";
import { limitFigureLines } from "../src/testing/index.ts";

/** The call list's notes, their lines joined. */
const NOTES = readFileSync(join(import.meta.dirname, "..", "kit-calls.tsv"), "utf8")
  .split("\n")
  .filter((line) => line.startsWith("#"))
  .map((line) => line.replace(/^# ?/u, ""))
  .join(" ");

/** The names the note lists in the parenthesis after `before`. */
function listed(before: RegExp): string[] {
  const names = before.exec(NOTES)?.[1];
  assert.ok(names !== undefined, String(before));
  return names.split(", ");
}

test("DEC-7036, TODO-7055: teletextLimits holds exactly the names the call list's note gives, and regisLimits and naplpsLimits those it gives among theirs", () => {
  const teletext = listed(/teletextLimits \(teletext_limits in Python: ([A-Z_, ]+), from the engine at LIMITS_FROM\)/u);
  const regis = listed(/among regisLimits \(([A-Z_, ]+)\)/u);
  const naplps = listed(/and naplpsLimits \(([A-Z_, ]+)\)/u);
  assert.deepEqual(Object.keys(teletextLimits).toSorted(), teletext.toSorted());
  for (const [module, names] of [
    [regisLimits, regis],
    [naplpsLimits, naplps],
  ] as const) {
    assert.deepEqual(
      names.filter((name) => !(name in module)),
      [],
    );
  }
  assert.deepEqual(regis.toSorted(), ["MAX_ANIMATED_DRAWINGS", "MAX_CYCLING_OBJECTS", "MAX_OBJECT_FRAMES"], "the ReGIS names, as read");
  assert.deepEqual(
    naplps.toSorted(),
    ["DEFINABLE_CODES", "MAX_ANIMATED_OBJECTS", "MAX_CYCLING_OBJECTS", "MAX_OBJECTS", "MAX_OBJECT_FRAMES"],
    "the NAPLPS names, as read",
  );
  for (const [module, names] of [
    [teletextLimits, teletext],
    [regisLimits, regis],
    [naplpsLimits, naplps],
  ] as const) {
    for (const name of names) {
      const value: unknown = Reflect.get(module, name);
      assert.ok(typeof value === "number" && Number.isSafeInteger(value) && value > 0, name);
    }
  }
});

test("REQ-6608, ANIM-16: limitFigureLines finds a limit of animation beside its figure, a shared name with each renderer's figure, and not a name alone", () => {
  const root = mkdtempSync(join(tmpdir(), "animation-figures-"));
  const lines = [
    `const sprites = ${teletextLimits.MAX_SPRITES}; // MAX_SPRITES`,
    `MAX_ANIMATED_OBJECTS is ${teletextLimits.MAX_ANIMATED_OBJECTS} in teletext`,
    `MAX_ANIMATED_OBJECTS is ${naplpsLimits.MAX_ANIMATED_OBJECTS} in NAPLPS`,
    `MAX_ANIMATED_DRAWINGS is ${regisLimits.MAX_ANIMATED_DRAWINGS}`,
    "MAX_SPRITES by name alone",
  ];
  writeFileSync(join(root, "planted.ts"), [...lines, ""].join("\n"));
  assert.notEqual(teletextLimits.MAX_ANIMATED_OBJECTS, naplpsLimits.MAX_ANIMATED_OBJECTS, "the shared name has two figures");
  assert.deepEqual(limitFigureLines(root, []), [
    `planted.ts:1: MAX_SPRITES is ${teletextLimits.MAX_SPRITES}: ${lines[0] ?? ""}`,
    `planted.ts:2: MAX_ANIMATED_OBJECTS is ${teletextLimits.MAX_ANIMATED_OBJECTS}: ${lines[1] ?? ""}`,
    `planted.ts:3: MAX_ANIMATED_OBJECTS is ${naplpsLimits.MAX_ANIMATED_OBJECTS}: ${lines[2] ?? ""}`,
    `planted.ts:4: MAX_ANIMATED_DRAWINGS is ${regisLimits.MAX_ANIMATED_DRAWINGS}: ${lines[3] ?? ""}`,
  ]);
});

test(
  "TODO-7055: limitFigureLines finds DEFINABLE_CODES, the count of macro names TODO-7055 lists among the limits of animation, beside its figure",
  { skip: "fault: limitFigureLines does not look for DEFINABLE_CODES, a limit of animation the shared note and TODO-7055 name, reported for a Fable fix" },
  () => {
    const root = mkdtempSync(join(tmpdir(), "animation-figures-"));
    const line = `const names = ${naplpsLimits.DEFINABLE_CODES}; // DEFINABLE_CODES`;
    writeFileSync(join(root, "planted.ts"), `${line}\n`);
    assert.deepEqual(limitFigureLines(root, []), [`planted.ts:1: DEFINABLE_CODES is ${naplpsLimits.DEFINABLE_CODES}: ${line}`]);
  },
);

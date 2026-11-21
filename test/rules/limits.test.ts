// The limits of a page's rule table (page-rules.md RULE-57, REQ-6608) are
// the engine's constants by their names, in src/rules/limits.ts, which
// scripts/check.sh checks against the engine's limits.rs at LIMITS_FROM.
// RULE-57's verification asks the kits to compare them with what they
// carry of them: the schema's bounds of a table. And no other file of the
// kit writes a limit's figure beside its name, nor a limit of animation's
// (animation.md ANIM-16) outside the copies generated from the renderers'.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import * as kit from "../../src/index.ts";
import { limitFigureLines } from "../../src/testing/index.ts";

/** The schema, read as JSON. */
const SCHEMA: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "schema", "protocol-16.json"), "utf8"));

/** The member `name` of `value`, when it is an object. */
function member(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? (Reflect.get(value, name) as unknown) : undefined;
}

/** The bound `keyword` of the property `property` of the schema's definition `definition`. */
function bound(definition: string, property: string, keyword: "maxItems" | "maximum"): unknown {
  return member(member(member(member(member(SCHEMA, "$defs"), definition), "properties"), property), keyword);
}

test("RULE-57, REQ-6608: each limit the schema bounds a table by is the engine's constant of that name", () => {
  const held = [
    [kit.MAX_RULES, bound("RuleTable", "rules", "maxItems")],
    [kit.MAX_RECTS, bound("RuleTable", "rects", "maxItems")],
    [kit.MAX_GROUPS, bound("RuleTable", "groups", "maxItems")],
    [kit.MAX_SEQUENCES, bound("RuleTable", "sequences", "maxItems")],
    [kit.MAX_GROUP_COMMANDS, bound("GroupDeclaration", "commands", "maxItems")],
    [kit.MAX_GROUP_COMMANDS, bound("PageRule", "do", "maxItems")],
    [kit.MAX_SEQUENCE_STEPS, bound("SequenceDeclaration", "steps", "maxItems")],
    [kit.MAX_SEQUENCE_REPEAT, bound("SequenceDeclaration", "repeat", "maximum")],
    [kit.MAX_SEQUENCE_TICKS, bound("SequenceDeclaration", "length", "maximum")],
    [kit.MAX_SEQUENCE_TICKS, bound("SequenceStep", "tick", "maximum")],
    [kit.MAX_TIMER_TICKS, bound("Beat", "ticks", "maximum")],
  ] as const;
  for (const [constant, schemas] of held) {
    assert.equal(schemas, constant);
  }
});

test("RULE-57: the kit exports all forty-three limits of the table and the clock's rate, each a positive whole number", () => {
  const names = Object.keys(kit).filter((name) => /^(MAX_[A-Z_]+|TIMERS|VARIABLES|TICKS_PER_SECOND)$/u.test(name));
  assert.equal(names.length, 44);
  const exported: Readonly<Record<string, unknown>> = kit;
  for (const name of names) {
    const value = exported[name];
    assert.ok(typeof value === "number" && Number.isSafeInteger(value) && value > 0, name);
  }
});

test("REQ-6608: no file of the kit but the generated copies and this test, which plants some, writes a limit's figure beside its name", () => {
  const generated = ["src/rules/limits.ts", "src/animation/teletext-limits.ts", "src/picture/regis-limits.ts", "src/picture/naplps-limits.ts"];
  assert.deepEqual(limitFigureLines(join(import.meta.dirname, "..", ".."), [...generated, "scripts/limits.ts", "test/rules/limits.test.ts"]), []);
});

test("REQ-6608: the check finds a figure written beside its limit's name, with or without its thousands marked, and nothing else", () => {
  const root = mkdtempSync(join(tmpdir(), "limit-figures-"));
  writeFileSync(
    join(root, "planted.ts"),
    ["const most = 64; // MAX_RULES", "MAX_GROUPS_BYTES is 16,384", "MAX_RULES is RULE-64's, 640 or v64", "MAX_RECTS by name alone", ""].join("\n"),
  );
  assert.deepEqual(limitFigureLines(root, []), [
    "planted.ts:1: MAX_RULES is 64: const most = 64; // MAX_RULES",
    "planted.ts:2: MAX_GROUPS_BYTES is 16384: MAX_GROUPS_BYTES is 16,384",
  ]);
});

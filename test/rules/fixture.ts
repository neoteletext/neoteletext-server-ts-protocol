// The lines of a shared fixture of protocol 14 (python.md PY-80): copies of
// neoteletext-common's files, which the commit gate holds to them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** One line of a fixture: a JSON object. */
export type FixtureLine = Readonly<Record<string, unknown>>;

function isLine(value: unknown): value is FixtureLine {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The lines of test/fixtures/`name`, each parsed. */
export function fixtureLines(name: string): FixtureLine[] {
  const text = readFileSync(join(import.meta.dirname, "..", "fixtures", name), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      assert.ok(isLine(parsed), line);
      return parsed;
    });
}

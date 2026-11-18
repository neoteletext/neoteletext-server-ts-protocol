// typescript.md 4.3: the test sends brassBank() and then brassPhrase() to
// connection 1 (TS-43).

import assert from "node:assert/strict";
import { test } from "node:test";

import { Harness } from "../../src/testing/index.ts";
import { brassBank, brassPhrase } from "./patch-by-fields.ts";
import { INDEX, expected, serving, soundLines } from "./shared.ts";

test("TS-43, 4.3: a synth106 patch by its fields, as a bank's and inline, writes the fixture's lines", () => {
  const harness = new Harness([
    serving([], {
      joined(connection, context): void {
        context.sound({ connection }, brassBank());
        context.sound({ connection }, brassPhrase());
      },
    }),
  ]);
  harness.join(1, INDEX);
  assert.deepEqual(soundLines(harness), expected("patch-by-fields"));
});

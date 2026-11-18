// The kit speaks protocol 13 only (typescript.md TS-3): PROTOCOL is the
// `const` of the schema's `start.protocol`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { PROTOCOL } from "../src/index.ts";

test("TS-3: PROTOCOL is the schema's start.protocol, 13", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "schema", "protocol-13.json"), "utf8");
  // Read as text, as the language tags' test reads the schema: the one `protocol` field, start's, and its const.
  const consts = [...text.matchAll(/"protocol": \{\s*"const": (\d+),/gu)].map((found) => Number(found[1]));
  assert.deepEqual(consts, [PROTOCOL]);
  assert.equal(PROTOCOL, 13);
});

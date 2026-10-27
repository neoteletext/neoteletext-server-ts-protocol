// The kit's half of the check against the server's TTI reader: the small
// channel in fixtures/hello.ts writes exactly the lines kept in
// fixtures/hello.jsonl. The server's end-to-end test
// (teletext-server's crates/teletext-native/tests/channel_program.rs)
// replays the same lines, kept there as tests/fixtures/kit-channel.jsonl,
// and reads back what it serves; the two files must stay the same.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const FIXTURES = join(import.meta.dirname, "fixtures");

test("the kit's fixture channel writes the lines the server's test replays", () => {
  const start = '{"type":"start","protocol":1,"epoch_ms":0}\n';
  const result = spawnSync(process.execPath, [join(FIXTURES, "hello.ts")], { input: start, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, readFileSync(join(FIXTURES, "hello.jsonl"), "utf8"));
});

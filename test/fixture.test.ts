// The kit's half of a check against the server: the small channel in
// fixtures/hello.ts answers a connection and its selections with exactly
// the lines kept in fixtures/hello.jsonl, every one valid by the server's
// schema (the kit refuses to write any other). The server's own replay of
// them is its to build (neoteletext-app-server TODO-1537 records it), since protocol 2 left
// its TTI fixture behind.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const FIXTURES = join(import.meta.dirname, "fixtures");

test("the kit's fixture channel answers a connection and its selections with the lines kept", () => {
  const start = [
    '{"type":"start","protocol":3,"epoch_ms":0,"standard":{"magazines":8,"pages":2022,"pages_per_magazine":253,"pages_in_magazine_1":251,"keyable_pages":800,"subpages":8190,"decimal_subpages":3199},"budgets":{"line_bytes":16777216,"title_characters":120,"author_log_bytes":200,"log_characters":1000,"named_connections":4096,"reply_limit_ms":5000}}',
    '{"type":"connected","connection":1,"session":1,"cookies":[],"selection":null}',
    '{"type":"left","connection":1,"page":"100"}',
    '{"type":"selected","connection":1,"page":"101","sub":"3F7F"}',
    '{"type":"selected","connection":1,"page":"101","sub":"0002"}',
    '{"type":"left","connection":1,"page":"101"}',
    '{"type":"selected","connection":1,"page":"102","sub":"3F7F"}',
    '{"type":"left","connection":1,"page":"102"}',
    '{"type":"selected","connection":1,"page":"103","sub":"3F7F"}',
    "",
  ].join("\n");
  const result = spawnSync(process.execPath, [join(FIXTURES, "hello.ts")], { input: start, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, readFileSync(join(FIXTURES, "hello.jsonl"), "utf8"));
});

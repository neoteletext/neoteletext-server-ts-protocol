// The kit holds no instrument logic (typescript.md TS-1): src/sound/ and
// src/wire/ hold exactly the files TS-36 keeps and the kit's own wire, so
// that a new module there needs the requirement changed first.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SOURCE = join(import.meta.dirname, "..", "src");

/** What src/sound/ keeps (TS-36): the Opus encoder, its reader of Ogg, the samples' bytes and the profile they are made to. */
const SOUND = ["ffmpeg-opus.ts", "ogg-opus.ts", "opus-encoder.ts", "pcm.ts", "profile.ts"];
/** What src/wire/ keeps: the lines, the validators and their faults, the server's rules for pages and text, the bytes fields, and the generated files. */
const WIRE = [
  "app.ts",
  "bytes.ts",
  "connection-rules.ts",
  "description-rules.ts",
  "encoded.ts",
  "fault.ts",
  "fields.ts",
  "fixed.ts",
  "generated",
  "language-tags.ts",
  "languages.ts",
  "limits.ts",
  "line-splitter.ts",
  "page-rules.ts",
  "picture-rules.ts",
  "rule-pieces.ts",
  "server-events.ts",
  "server-message.ts",
  "server-rules.ts",
  "socket.ts",
  "stream-packets.ts",
  "streams.ts",
  "validate.ts",
];

test("TS-1: src/sound/ and src/wire/ hold the files TS-36 keeps, and none of a synthesizer", () => {
  assert.deepEqual(readdirSync(join(SOURCE, "sound")).toSorted(), SOUND);
  assert.deepEqual(readdirSync(join(SOURCE, "wire")).toSorted(), WIRE);
});

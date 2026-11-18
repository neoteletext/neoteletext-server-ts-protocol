// typescript.md 4.6: a Standard MIDI File made for a DX7, played on synth7,
// its channels 1 and 2 mapped and every other dropped, its leading 32-voice
// dump lifted into a bank, and the server's report of the sound heard by
// `soundBuilt` (TS-23, TS-43).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Context } from "../../src/index.ts";
import type { SoundBuilt, SoundSynth7Member } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { expected, inputFile, inputOf, serving, soundLines } from "./shared.ts";

const FILE_PAGE = 0x330;
const LIFTED_BANK = 40;
/** tune.mid's length (section 4.0). */
const FILE_BYTES = 4_164;
/** A Standard MIDI File's first chunk type, "MThd". */
const HEADER_CHUNK = "MThd";

function fromFile(midiFile: string): SoundSynth7Member {
  return {
    kind: "synth7",
    handle: 41,
    generation: 0,
    banks: [],
    lift_banks: [{ handle: LIFTED_BANK, generation: 0 }],
    length: { tail_us: 2_000_000 },
    music: {
      form: "midi_file",
      bytes: new Uint8Array(readFileSync(midiFile)),
      channel_map: [1, 2, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    },
  };
}

test("TS-43, 4.6: connection 1 opening page 330 is sent the file's bytes as they are, the fixture's line, and hears the report", () => {
  const bytes = inputOf("midi-file", 0, ["music", "bytes"], FILE_BYTES);
  assert.equal(Buffer.from(bytes.subarray(0, HEADER_CHUNK.length)).toString("latin1"), HEADER_CHUNK);
  const file = inputFile("tune.mid", bytes);
  const logged: string[] = [];
  const filePlayer = serving([FILE_PAGE], {
    opened(_connection: number, page: number, context: Context): void {
      if (page === FILE_PAGE) {
        context.sound({ page }, fromFile(file));
      }
    },
    soundBuilt(report: SoundBuilt, context: Context): void {
      context.log(`${report.kind} ${report.handle}: ${report.blocks} blocks, dropped ${JSON.stringify(report.dropped)}`);
      logged.push(report.kind);
    },
  });
  const harness = new Harness([filePlayer]);
  harness.join(1, FILE_PAGE);
  assert.deepEqual(soundLines(harness), expected("midi-file"));
  const [sent] = harness.soundsOfKind(1, "synth7");
  assert.ok(sent !== undefined);
  harness.report(sent, {
    blocks: 50,
    bytes: 1_000,
    longest_block: 40,
    banks_lifted: [{ handle: LIFTED_BANK, generation: 0 }],
    dropped: { not_taken: 0, unmapped_channel: 2, system_messages: 0, escapes: 0, meta_events: 0 },
  });
  assert.deepEqual(logged, ["synth7"]);
  assert.match(String(harness.sent.at(-1)?.["text"]), /synth7 41: 50 blocks, dropped .*"unmapped_channel":2/u);
});

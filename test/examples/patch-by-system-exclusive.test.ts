// typescript.md 4.4: a DX7 voice as the 163 bytes of a single-voice bulk
// dump, sent as the one patch of a bank and inline at the start of a stored
// sound (TS-43).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { SoundSynth7BankMember, SoundSynth7Member } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { INDEX, expected, inputFile, inputOf, serving, soundLines } from "./shared.ts";

/** A DX7 single-voice bulk dump is 163 bytes (MIDI-54): a program should not send what it knows is not one. The server checks the bytes. */
const VOICE_DUMP_BYTES = 163;
const VOICES = 9;

function readVoice(voiceFile: string): Uint8Array {
  const dump = new Uint8Array(readFileSync(voiceFile));
  if (dump.length !== VOICE_DUMP_BYTES) {
    throw new RangeError(`${voiceFile}: ${dump.length} bytes, not a single-voice dump`);
  }
  return dump;
}

function voiceBank(voiceFile: string): SoundSynth7BankMember {
  return { kind: "synth7_bank", handle: VOICES, generation: 0, bank: { form: "patches", patches: [{ form: "bytes", bytes: readVoice(voiceFile) }] } };
}

function electricPiano(voiceFile: string): SoundSynth7Member {
  return {
    kind: "synth7",
    handle: 8,
    generation: 0,
    banks: [VOICES],
    lift_banks: [],
    length: { tail_us: 1_500_000 },
    music: {
      form: "events",
      events: [
        { event: "patch", time_us: 0, channel: 1, patch: { form: "bytes", bytes: readVoice(voiceFile) } },
        { event: "note_on", time_us: 0, channel: 1, key: 64, velocity: 90 },
        { event: "note_off", time_us: 1_000_000, channel: 1, key: 64, velocity: 64 },
      ],
    },
  };
}

/** A single-voice dump's first bytes: F0, Yamaha's ID 43, sub-status 0 (channel 1), format 0, byte count 01 1B (synth7.md S7-51). */
const DUMP_HEAD = [0xf0, 0x43, 0x00, 0x00, 0x01, 0x1b];
const END_OF_EXCLUSIVE = 0xf7;

test("TS-43, 4.4: a voice dump given as bytes, in a bank and inline, writes the fixture's lines, the bytes as base64", () => {
  const dump = inputOf("patch-by-system-exclusive", 0, ["bank", "patches", 0, "bytes"], VOICE_DUMP_BYTES);
  assert.deepEqual([...dump.subarray(0, DUMP_HEAD.length)], DUMP_HEAD);
  assert.equal(dump.at(-1), END_OF_EXCLUSIVE);
  const file = inputFile("voice.syx", dump);
  const harness = new Harness([
    serving([], {
      joined(connection, context): void {
        context.sound({ connection }, voiceBank(file));
        context.sound({ connection }, electricPiano(file));
      },
    }),
  ]);
  harness.join(1, INDEX);
  assert.deepEqual(soundLines(harness), expected("patch-by-system-exclusive"));
  assert.deepEqual(
    harness.soundsOfKind(1, "synth7_bank")[0]?.bank,
    { form: "patches", patches: [{ form: "bytes", bytes: dump }] },
    "the harness gives the bytes back as bytes (TS-29)",
  );
});

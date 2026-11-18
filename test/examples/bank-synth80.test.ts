// typescript.md 4.5, synth80: a bank given as a list of patches, each in the
// `bytes` form, a patch being 85 control values in synth80.md's fixed order
// (MIDI-54; S80-33) (TS-43).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SoundSynth80BankMember } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { INDEX, expected, inputOf, serving, soundLines } from "./shared.ts";

/** synth80's patch: 85 control values (S80-33). */
const PATCH_VALUES = 85;

function stringsBank(patches: readonly Uint8Array[]): SoundSynth80BankMember {
  return { kind: "synth80_bank", handle: 30, generation: 0, bank: { form: "patches", patches: patches.map((bytes) => ({ form: "bytes", bytes })) } };
}

test("TS-43, 4.5: synth80's default patch as a bank of one, written as the fixture's line", () => {
  const patch = inputOf("bank-synth80", 0, ["bank", "patches", 0, "bytes"], PATCH_VALUES);
  const harness = new Harness([
    serving([], {
      joined(connection, context): void {
        context.sound({ connection }, stringsBank([patch]));
      },
    }),
  ]);
  harness.join(1, INDEX);
  assert.deepEqual(soundLines(harness), expected("bank-synth80"));
});

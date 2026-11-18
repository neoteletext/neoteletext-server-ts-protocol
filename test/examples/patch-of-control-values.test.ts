// typescript.md 4.7, synthD: a stored synthD sound whose patch is the 60
// control values in synthd.md's fixed order (SD-22), in the `bytes` form,
// inline and as the one patch of the bank the sound names (TS-43).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SoundSynthdBankMember, SoundSynthdMember } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { INDEX, expected, inputOf, serving, soundLines } from "./shared.ts";

const BASS_BANK = 61;
/** synthD's patch: 60 control values (SD-22). */
const CONTROL_VALUES = 60;

function bassBank(values: Uint8Array): SoundSynthdBankMember {
  return { kind: "synthd_bank", handle: BASS_BANK, generation: 0, bank: { form: "patches", patches: [{ form: "bytes", bytes: values }] } };
}

function bass(values: Uint8Array): SoundSynthdMember {
  return {
    kind: "synthd",
    handle: 60,
    generation: 0,
    banks: [BASS_BANK],
    lift_banks: [],
    length: { tail_us: 500_000 },
    music: {
      form: "events",
      events: [
        { event: "patch", time_us: 0, channel: 1, patch: { form: "bytes", bytes: values } },
        { event: "note_on", time_us: 0, channel: 1, key: 36, velocity: 110 },
        { event: "note_off", time_us: 250_000, channel: 1, key: 36, velocity: 64 },
      ],
    },
  };
}

test("TS-43, 4.7: synthD's 60 control values, in a bank and inline, write the fixture's lines", () => {
  const values = inputOf("patch-of-control-values", 0, ["bank", "patches", 0, "bytes"], CONTROL_VALUES);
  const harness = new Harness([
    serving([], {
      joined(connection, context): void {
        context.sound({ connection }, bassBank(values));
        context.sound({ connection }, bass(values));
      },
    }),
  ]);
  harness.join(1, INDEX);
  assert.deepEqual(soundLines(harness), expected("patch-of-control-values"));
});

// typescript.md 4.5, synth53: a bank of program dumps of one group, given as
// the dumps' bytes from a file, and a stored sound that names it, the group
// chosen by bank select as the program change's `bank_lsb` (TS-43).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Context } from "../../src/index.ts";
import type { SoundSynth53BankMember, SoundSynth53Member } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { expected, inputFile, inputOf, serving, soundLines } from "./shared.ts";

const BANK_HANDLE = 20;
/** Controller 32's value 1 chooses group 0 (S53-13), the group of the bank's dumps. */
const GROUP_0 = 1;
/** Two program dumps of S53-28, packed by S53-32 (section 4.0). */
const DUMPS_BYTES = 318;
const BANKED_PAGE = 0x320;

function groupBank(dumpsFile: string): SoundSynth53BankMember {
  return { kind: "synth53_bank", handle: BANK_HANDLE, generation: 0, bank: { form: "bytes", bytes: new Uint8Array(readFileSync(dumpsFile)) } };
}

function twoPrograms(): SoundSynth53Member {
  return {
    kind: "synth53",
    handle: 21,
    generation: 0,
    banks: [BANK_HANDLE],
    lift_banks: [],
    length: { tail_us: 1_000_000 },
    music: {
      form: "events",
      events: [
        { event: "program_change", time_us: 0, channel: 1, program: 0, bank_lsb: GROUP_0 },
        { event: "note_on", time_us: 0, channel: 1, key: 57, velocity: 100 },
        { event: "note_off", time_us: 1_000_000, channel: 1, key: 57, velocity: 64 },
        { event: "program_change", time_us: 1_000_000, channel: 1, program: 1, bank_lsb: GROUP_0 },
        { event: "note_on", time_us: 1_000_000, channel: 1, key: 57, velocity: 100 },
        { event: "note_off", time_us: 2_000_000, channel: 1, key: 57, velocity: 64 },
      ],
    },
  };
}

test("TS-43, 4.5: connection 1 opening page 320 is sent the synth53 bank and the sound naming it, the fixture's lines", () => {
  const file = inputFile("group-0.syx", inputOf("bank-synth53", 0, ["bank", "bytes"], DUMPS_BYTES));
  const banked = serving([BANKED_PAGE], {
    opened(_connection: number, page: number, context: Context): void {
      if (page === BANKED_PAGE) {
        context.sound({ page }, groupBank(file));
        context.sound({ page }, twoPrograms());
      }
    },
  });
  const harness = new Harness([banked]);
  harness.join(1, BANKED_PAGE);
  assert.deepEqual(soundLines(harness), expected("bank-synth53"));
});

// The analogue synthesizers' scores and live program changes (DEC-6429):
// a SynthScore is the synth7's score held to its synthesizer's codec, with
// the synth80's pressure and the synth8's portamento and balance, and a
// SynthProgramRepeater repeats a live sound's program changes as the
// synth7's does.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Synth7Score, SYNTHS, SynthProgramRepeater, SynthScore } from "../src/index.ts";

/** The slots of `blocks`, four bytes each. */
function slotsOf(blocks: Uint8Array): number[][] {
  return Array.from({ length: blocks.length / 4 }, (_, index) => Array.from(blocks.subarray(index * 4, index * 4 + 4)));
}

const events = (score: Synth7Score | SynthScore): Synth7Score | SynthScore =>
  score.program(0, 0, 3).note(5.5, 0, 60, 100, 40).pitchBend(30, 0, 16_383).modWheel(30, 0, 64).volume(30, 0, 100).sustain(41, 0, true).allNotesOff(59.9, 0);

test("a synthesizer's score places its events as a synth7 score does", () => {
  const synth7 = events(new Synth7Score()).build(20);
  for (const synth of SYNTHS) {
    assert.deepEqual(events(new SynthScore(synth)).build(20), synth7, synth);
  }
  assert.deepEqual(slotsOf(synth7.blocks).slice(0, 2), [
    [0, 0xc0, 3, 0],
    [55, 0x90, 60, 100],
  ]);
});

test("the synth80's score takes key and channel pressure; another synthesizer's refuses them where they are added", () => {
  const synth80 = new SynthScore("synth80").noteOn(0, 0, 60, 90).keyPressure(10, 0, 60, 127).channelPressure(15, 2, 33).build();
  assert.deepEqual(slotsOf(synth80.blocks), [
    [0, 0x90, 60, 90],
    [100, 0xa0, 60, 127],
    [150, 0xd2, 33, 0],
  ]);
  assert.throws(() => new SynthScore("synth106").keyPressure(0, 0, 60, 1), {
    name: "RangeError",
    message: "synth106: the event at 0 ms (status 160, data 60 and 1): its status is a note off, note on, control change, program change or pitch bend",
  });
  assert.throws(() => new SynthScore("synth80").keyPressure(0, 0, 60, 128), { name: "RangeError", message: "synth80: a pressure is 0 to 127, not 128" });
});

test("the synth8's score takes portamento and the balance, and program changes on its two parts only", () => {
  const synth8 = new SynthScore("synth8").program(0, 0, 4).program(0, 1, 9).portamentoTime(1, 0, 80).balance(1, 0, 64).portamento(1, 0, true).build();
  assert.deepEqual(slotsOf(synth8.blocks), [
    [0, 0xc0, 4, 0],
    [0, 0xc1, 9, 0],
    [10, 0xb0, 5, 80],
    [10, 0xb0, 8, 64],
    [10, 0xb0, 65, 127],
  ]);
  assert.throws(() => new SynthScore("synth8").program(0, 2, 0), /a synth8's program change is on MIDI channel 1, the upper patch, or 2, the lower/u);
  assert.throws(() => new SynthScore("synth53").portamento(0, 0, true), /a control change is of controller 1, 7, 64, 120, 121 or 123/u);
  assert.throws(() => new Synth7Score().add({ ms: 0, status: 0xd0, data1: 1, data2: 0 }), /^RangeError: synth7: /u);
});

test("a live synthesizer sound's program change is written again within half a second, held to its codec", () => {
  const repeater = new SynthProgramRepeater("synth8", 2);
  repeater.pass(Uint8Array.from([0, 0xc0, 4, 0, 0, 0xc1, 9, 0]));
  const passed = repeater.pass(new Uint8Array(25 * 8));
  assert.deepEqual(slotsOf(passed.subarray(24 * 8)), [
    [0, 0xc0, 4, 0],
    [0, 0xc1, 9, 0],
  ]);
  assert.throws(() => repeater.pass(Uint8Array.from([0, 0xc2, 1, 0, 0, 0, 0, 0])), /^RangeError: synth8: block 0 slot 0: /u);
  assert.throws(() => new SynthProgramRepeater("synth80", 0), { name: "RangeError", message: "synth80: a block has 1 to 16 slots, not 0" });
  assert.deepEqual(new SynthProgramRepeater("synth80", 1).pass(Uint8Array.from([0, 0xd0, 1, 0])), Uint8Array.from([0, 0xd0, 1, 0]));
});

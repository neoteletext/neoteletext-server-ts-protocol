// The synth7 score and the live sound's repeated program changes (REQ-6414
// items 2 and 5): each event in its block at its time, the fewest slots a
// block, a seventeenth event in a block refused, and a part's program
// change seen again within a second.

import assert from "node:assert/strict";
import { test } from "node:test";

import { PROGRAM_REPEAT_BLOCKS, Synth7ProgramRepeater, Synth7Score } from "../src/index.ts";

/** The slots of `blocks`, four bytes each. */
function slotsOf(blocks: Uint8Array): number[][] {
  return Array.from({ length: blocks.length / 4 }, (_, index) => Array.from(blocks.subarray(index * 4, index * 4 + 4)));
}

test("each event is in its 20 ms block at its tenth of a millisecond, a block's events in order of time", () => {
  const score = new Synth7Score().noteOn(19.9, 0, 62, 90).noteOn(0, 0, 60, 100).program(0, 2, 31).note(45.5, 1, 64, 127, 10).noteOff(19.95, 15, 60);
  const { slots, blocks, lengthMs } = score.build();
  assert.equal(slots, 3, "the busiest block has three events");
  assert.equal(lengthMs, 60);
  assert.deepEqual(slotsOf(blocks), [
    // Block 0: two events at time 0 in the order they were added, then 19.9 ms.
    [0, 0x90, 60, 100],
    [0, 0xc2, 31, 0],
    [199, 0x90, 62, 90],
    // Block 1: 19.95 ms rounds to 200 tenths, the block's start.
    [0, 0x8f, 60, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    // Block 2: 45.5 ms is 55 tenths in, and its note off 10 ms later.
    [55, 0x91, 64, 127],
    [155, 0x81, 64, 0],
    [0, 0, 0, 0],
  ]);
  assert.deepEqual(score.events[0], { ms: 19.9, status: 0x90, data1: 62, data2: 90 });
  assert.deepEqual(slotsOf(new Synth7Score(score.events).build().blocks), slotsOf(blocks), "a score made of another's events is the same blocks");
});

test("every kind of event is the MIDI message the codec takes", () => {
  const score = new Synth7Score()
    .pitchBend(0, 3, 8192)
    .pitchBend(1, 3, 16_383)
    .modWheel(2, 4, 127)
    .volume(3, 5, 100)
    .sustain(4, 6, true)
    .sustain(5, 6, false)
    .allNotesOff(6, 7)
    .add({ ms: 7, status: 0xb0, data1: 121, data2: 0 });
  assert.deepEqual(slotsOf(score.build().blocks), [
    [0, 0xe3, 0, 64],
    [10, 0xe3, 127, 127],
    [20, 0xb4, 1, 127],
    [30, 0xb5, 7, 100],
    [40, 0xb6, 64, 127],
    [50, 0xb6, 64, 0],
    [60, 0xb7, 123, 0],
    [70, 0xb0, 121, 0],
  ]);
});

test("a block holds at most 16 events: a seventeenth is refused, naming the block", () => {
  const score = new Synth7Score();
  for (let key = 0; key < 16; key += 1) {
    score.noteOn(40 + key, 0, 60 + key, 100);
  }
  assert.equal(score.build().slots, 16);
  score.noteOn(59.9, 0, 100, 100);
  assert.throws(() => score.build(), /block 2, from 40 ms, has 17 events: a block holds at most 16/u);
});

test("a tail is empty blocks after the last event; a score of nothing is one empty block", () => {
  const built = new Synth7Score().note(0, 0, 60, 100, 30).build(100);
  assert.equal(built.lengthMs, 140, "two blocks of events and five of tail");
  assert.equal(built.blocks.length, 7 * 4);
  assert.deepEqual(new Synth7Score().build(), { slots: 1, blocks: new Uint8Array(4), lengthMs: 20 });
});

test("an event the codec would not take is refused where it is added", () => {
  const score = new Synth7Score();
  for (const bad of [
    (): Synth7Score => score.noteOn(0, 16, 60, 100),
    (): Synth7Score => score.noteOn(0, 0, 128, 100),
    (): Synth7Score => score.noteOn(0, 0, 60, 128),
    (): Synth7Score => score.noteOn(-1, 0, 60, 100),
    (): Synth7Score => score.noteOn(Number.NaN, 0, 60, 100),
    (): Synth7Score => score.noteOn(65_536 * 20, 0, 60, 100),
    (): Synth7Score => score.program(0, 0, 32),
    (): Synth7Score => score.pitchBend(0, 0, 16_384),
    (): Synth7Score => score.modWheel(0, 0, 128),
    (): Synth7Score => score.volume(0, 0, -1),
    (): Synth7Score => score.add({ ms: 0, status: 0xa0, data1: 60, data2: 1 }),
    (): Synth7Score => score.add({ ms: 0, status: 0xb0, data1: 10, data2: 1 }),
    (): Synth7Score => score.add({ ms: 0, status: 0x40, data1: 0, data2: 0 }),
    (): Synth7Score => score.add({ ms: 0, status: 0, data1: 0, data2: 0 }),
    (): Synth7Score => score.add({ ms: 0, status: 0x90, data1: 60.5, data2: 1 }),
    (): Synth7Score => score.add({ ms: 0, status: 0x90, data1: 60, data2: -1 }),
    (): unknown => score.build(-1),
  ]) {
    assert.throws(bad, RangeError);
  }
  assert.equal(score.events.length, 0, "nothing refused was kept");
});

/** The blocks of `blocks`, of `slots` slots, in which a slot is `slot`. */
function blocksWith(blocks: Uint8Array, slots: number, slot: number[]): number[] {
  const found: number[] = [];
  for (const [index, one] of slotsOf(blocks).entries()) {
    if (one.join(",") === slot.join(",")) {
      found.push(Math.floor(index / slots));
    }
  }
  return found;
}

test("a live sound's program change is written again within a second, in a slot that was empty", () => {
  assert.equal(PROGRAM_REPEAT_BLOCKS, 25, "half a second of 20 ms blocks");
  const repeater = new Synth7ProgramRepeater(2);
  const first = new Synth7Score().program(0, 3, 5).noteOn(0, 3, 60, 100).program(5, 9, 31).build();
  assert.equal(first.slots, 3);
  assert.throws(() => repeater.pass(first.blocks), RangeError, "blocks of another size");
  const start = Uint8Array.from([0, 0xc3, 5, 0, 0, 0x93, 60, 100]);
  assert.deepEqual(repeater.pass(start), start, "its own block goes through as it is");
  assert.equal(repeater.programs[3], 5);
  assert.equal(repeater.programs[0], -1);
  // The next 100 blocks: empty, but for a note in the first slot of every tenth.
  const next = new Uint8Array(100 * 8);
  for (let block = 0; block < 100; block += 10) {
    next.set([50, 0x93, 62, 90], block * 8);
  }
  const given = next.slice();
  const passed = repeater.pass(next);
  assert.deepEqual(next, given, "what is given is not changed");
  // Block 0 was the start; these are blocks 1 to 100, so the 25th block after it is at index 24.
  assert.deepEqual(blocksWith(passed, 2, [0, 0xc3, 5, 0]), [24, 49, 74, 99]);
  assert.deepEqual(blocksWith(passed, 2, [50, 0x93, 62, 90]), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], "every note is still there");
  assert.equal(passed.filter((byte) => byte !== 0).length, 4 * 2 + 10 * 4, "and nothing else was written");
});

test("a repeated program change comes first in its block, waits for an empty slot, and follows the part's latest program", () => {
  const repeater = new Synth7ProgramRepeater(1);
  repeater.pass(Uint8Array.from([0, 0xc0, 7, 0]));
  const full = new Uint8Array(40 * 4);
  for (let block = 0; block < 40; block += 1) {
    full.set([0, 0x90, 60, 100], block * 4);
  }
  assert.deepEqual(repeater.pass(full), full, "no slot is empty, so nothing is added and nothing is lost");
  assert.deepEqual(Array.from(repeater.pass(new Uint8Array(8))), [0, 0xc0, 7, 0, 0, 0, 0, 0], "the first empty slot takes it, and it is not sent twice");
  const two = new Synth7ProgramRepeater(2);
  two.pass(Uint8Array.from([0, 0xc1, 1, 0, 0, 0xc1, 2, 0]));
  const later = new Uint8Array(25 * 8);
  later.set([120, 0x91, 60, 100], 24 * 8);
  assert.deepEqual(Array.from(two.pass(later).subarray(24 * 8)), [0, 0xc1, 2, 0, 120, 0x91, 60, 100]);
  assert.throws(() => new Synth7ProgramRepeater(17), RangeError);
  assert.throws(() => two.pass(Uint8Array.from([200, 0x90, 60, 100, 0, 0, 0, 0])), /block 0 slot 0/u);
});

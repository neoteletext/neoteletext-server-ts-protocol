// The synth6581 helpers (REQ-6414 item 1): an image's bytes for known register
// settings, a pitch's frequency register on each clock, a track's blocks,
// and the hard restart's images before a note, frame by frame.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SYNTH6581_HARD_RESTART_MS,
  SYNTH6581_NTSC_CLOCK_HZ,
  SYNTH6581_PAL_CLOCK_HZ,
  Synth6581Image,
  type Synth6581Note,
  Synth6581Track,
  synth6581ClockHz,
  synth6581Frequency,
  synth6581Gate,
  synth6581HardRestart,
  synth6581Note,
} from "../src/index.ts";

/** Concert A, and its frequency register on each clock: round(440 × 2^24 / 985,248) and round(440 × 2^24 / 1,022,727). */
const A4_HZ = 440;
const A4_PAL = 7493;
const A4_NTSC = 7218;

test("a pitch's frequency register is round(hertz × 2^24 / clock), held to 16 bits", () => {
  assert.equal(SYNTH6581_PAL_CLOCK_HZ, 985_248);
  assert.equal(SYNTH6581_NTSC_CLOCK_HZ, 1_022_727);
  assert.equal(synth6581ClockHz("pal"), 985_248);
  assert.equal(synth6581ClockHz("ntsc"), 1_022_727);
  assert.equal(synth6581Frequency(A4_HZ, "pal"), A4_PAL);
  assert.equal(synth6581Frequency(A4_HZ), A4_PAL, "PAL's clock when none is named");
  assert.equal(synth6581Frequency(A4_HZ, "ntsc"), A4_NTSC);
  assert.equal(synth6581Frequency(0), 0);
  assert.equal(synth6581Frequency(20_000), 0xffff, "a pitch above the register's range is held at its top");
  assert.throws(() => synth6581Frequency(-1), RangeError);
  assert.throws(() => synth6581Frequency(Number.NaN), RangeError);
});

test("an image's 25 bytes are the registers in address order, each field in its bits", () => {
  const image = new Synth6581Image()
    .frequency(1, 0x1234)
    .pulseWidth(1, 0x0abc)
    .control(1, { gate: true, sawtooth: true })
    .envelope(1, { attack: 1, decay: 2, sustain: 3, release: 4 })
    .frequency(2, 0xffff)
    .pulseWidth(2, 4095)
    .control(2, { sync: true, ring: true, test: true, triangle: true, pulse: true, noise: true })
    .attack(2, 15)
    .decay(2, 15)
    .sustain(2, 15)
    .release(2, 0)
    .pitch(3, A4_HZ)
    .cutoff(0x555)
    .resonance(9)
    .route([1, 3], true)
    .mode({ lowPass: true, highPass: true, voice3Off: true })
    .volume(11);
  // Voice 1 at 0, voice 2 at 7, voice 3 at 14 (7,493 is 0x1D45), then cutoff low 3 bits, cutoff high 8, resonance and routing, mode and volume.
  const expected = [
    [0x34, 0x12, 0xbc, 0x0a, 0x21, 0x12, 0x34],
    [0xff, 0xff, 0xff, 0x0f, 0xde, 0xff, 0xf0],
    [0x45, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x05, 0xaa, 0x9d, 0xdb],
  ].flat();
  assert.deepEqual(Array.from(image.bytes()), expected);
  assert.equal(image.register(4), 0x21);
  image.bytes()[0] = 0;
  assert.equal(image.register(0), 0x34, "bytes() is a copy");
});

test("a setter changes its own bits and keeps its neighbours'; a field out of its range is refused", () => {
  const image = new Synth6581Image().control(2, { pulse: true, gate: true }).volume(15).mode({ bandPass: true }).resonance(15).route([2]);
  assert.equal(image.gate(2, false).register(11), 0x40, "the gate alone is cleared");
  assert.equal(image.gate(2, true).register(11), 0x41);
  assert.equal(image.register(24), 0x2f, "the mode keeps the volume");
  assert.equal(image.volume(0).register(24), 0x20, "the volume keeps the mode");
  assert.equal(image.register(23), 0xf2, "resonance and routing share a register");
  assert.equal(image.route([]).register(23), 0xf0);
  assert.equal(image.cutoff(2047).register(21), 0x07);
  assert.equal(image.register(22), 0xff);
  const copy = new Synth6581Image(image).volume(9);
  assert.equal(image.register(24), 0x20, "a copy is its own registers");
  assert.equal(copy.register(24), 0x29);
  for (const bad of [
    (): Synth6581Image => image.frequency(1, 0x1_0000),
    (): Synth6581Image => image.pulseWidth(1, 4096),
    (): Synth6581Image => image.attack(1, 16),
    (): Synth6581Image => image.decay(1, -1),
    (): Synth6581Image => image.sustain(1, 1.5),
    (): Synth6581Image => image.release(1, 16),
    (): Synth6581Image => image.cutoff(2048),
    (): Synth6581Image => image.resonance(16),
    (): Synth6581Image => image.volume(16),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a voice the type refuses, to see the check refuse it at run time
    (): Synth6581Image => image.frequency(4 as 1, 0),
    (): number => image.register(25),
  ]) {
    assert.throws(bad, RangeError);
  }
});

const NOTE: Synth6581Note = { voice: 1, frequency: A4_PAL, waveform: { sawtooth: true }, attack: 2, decay: 3, sustain: 10, release: 4 };

/** Voice 1's seven registers in each image of `bytes`. */
function voice1(bytes: Uint8Array): number[][] {
  return Array.from({ length: bytes.length / 25 }, (_, index) => Array.from(bytes.subarray(index * 25, index * 25 + 7)));
}

test("a hard restart is two frames of a clear gate and a zero envelope, then the note's envelope and its gate", () => {
  assert.equal(SYNTH6581_HARD_RESTART_MS, 40);
  const track = new Synth6581Track();
  const image = new Synth6581Image().volume(15);
  synth6581Note(track, image, NOTE);
  synth6581Note(track, image, { ...NOTE, frequency: 0x2000, pulseWidth: 0x800, waveform: { pulse: true } });
  assert.equal(track.steps, 6);
  assert.equal(track.lengthMs, 120);
  assert.deepEqual(voice1(track.images()), [
    [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x45, 0x1d, 0x00, 0x00, 0x21, 0x23, 0xa4],
    // The second note's restart: the first note's pitch and waveform stay, its gate and envelope go.
    [0x45, 0x1d, 0x00, 0x00, 0x20, 0x00, 0x00],
    [0x45, 0x1d, 0x00, 0x00, 0x20, 0x00, 0x00],
    [0x00, 0x20, 0x00, 0x08, 0x41, 0x23, 0xa4],
  ]);
  assert.ok(
    Array.from({ length: 6 }, (_, index) => track.images()[index * 25 + 24]).every((volume) => volume === 15),
    "the rest of the image goes through",
  );
});

test("a hard restart is 40 ms whatever the track's step, and its two halves can be used apart", () => {
  const track = new Synth6581Track(4);
  const image = new Synth6581Image();
  synth6581Note(track, image, NOTE);
  assert.equal(track.stepMs, 5);
  assert.equal(track.steps, 9, "eight steps of 5 ms restarting, then the note");
  assert.deepEqual(voice1(track.images()).slice(7, 9), [
    [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x45, 0x1d, 0x00, 0x00, 0x21, 0x23, 0xa4],
  ]);
  const apart = new Synth6581Image().control(3, { noise: true, gate: true }).envelope(3, { attack: 9, decay: 9, sustain: 9, release: 9 });
  synth6581HardRestart(apart, 3);
  assert.deepEqual(Array.from(apart.bytes().subarray(14, 21)), [0, 0, 0, 0, 0x80, 0, 0]);
  synth6581Gate(apart, { ...NOTE, voice: 3 });
  assert.deepEqual(Array.from(apart.bytes().subarray(14, 21)), [0x45, 0x1d, 0, 0, 0x21, 0x23, 0xa4]);
});

test("a track gives whole blocks: a part block is filled by holding the last image, and take leaves what is not yet whole", () => {
  const track = new Synth6581Track(2);
  const image = new Synth6581Image();
  track.push(image.volume(1), 2).push(image.volume(2));
  assert.equal(track.lengthMs, 30);
  const images = track.images();
  assert.equal(images.length, 100, "two blocks of two images");
  assert.deepEqual([images[24], images[49], images[74], images[99]], [1, 1, 2, 2]);
  assert.deepEqual(track.sound("synth8580", { handle: 3, generation: 1 }), { synth8580: { handle: 3, generation: 1, imagesPerBlock: 2, images } });
  assert.deepEqual(track.sound("synth6581", { handle: 3, generation: 1, clock: "ntsc" }), {
    synth6581: { handle: 3, generation: 1, clock: "ntsc", imagesPerBlock: 2, images },
  });
  const taken = track.take();
  assert.equal(taken.length, 50, "one whole block");
  assert.equal(track.steps, 1, "the third image waits for a fourth");
  assert.equal(track.take().length, 0);
  assert.equal(new Synth6581Track().images().length, 0);
  assert.throws(() => new Synth6581Track().push(image, 6_001), RangeError, "two minutes at most");
  assert.throws(() => track.push(image, -1), RangeError);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a count the type refuses, to see the check refuse it at run time
  assert.throws(() => new Synth6581Track(3 as 1), RangeError);
});

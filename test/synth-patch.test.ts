// The analogue synthesizers' patches (DEC-6429): each init patch packs to
// the engine's default patch byte for byte, every field is written to its
// byte, a field out of its range is a RangeError that names it, and the
// patch rules refuse what the instrument's reader refuses, in the
// server's words.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SYNTH_PATCH_BYTES,
  type Synth,
  synth80InitPatch,
  synth80InitTone,
  synth106InitPatch,
  synth8InitPatch,
  synthdInitPatch,
  packSynth80Patch,
  packSynth106Patch,
  packSynth8Patch,
  packSynthdPatch,
  packSynth51Patch,
  packSynth52Patch,
  packSynth53Patch,
  packSynth60Patch,
  synth51InitPatch,
  synth52InitPatch,
  synth60InitPatch,
  synth53Dial,
  synth53InitPatch,
  synthPatchFault,
} from "../src/index.ts";

/** Little-endian bytes of a 16-bit number. */
const word = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff];

/** `length` bytes of 0 but those `set` gives, at their places. */
function bytesWith(length: number, set: readonly (readonly [number, number])[]): number[] {
  const bytes = Array.from({ length }, () => 0);
  for (const [at, value] of set) {
    bytes[at] = value;
  }
  return bytes;
}

/** `bytes` with one byte changed. */
const changed = (bytes: Uint8Array, at: number, value: number): Uint8Array => bytes.with(at, value);

test("the synth106's and the synthD's init patches are the engine's defaults, byte for byte", () => {
  // synth106::Patch::DEFAULT.to_bytes(): the sliders, then 8' | sawtooth | chorus off, and PWM manual | HPF 1 (three less, in bits 3 and 4).
  assert.deepEqual([...packSynth106Patch(synth106InitPatch)], [0, 0, 0, 0, 0, 127, 0, 0, 0, 0, 64, 0, 0, 127, 0, 0, 0x32, 0x11]);
  // synthd::Patch::DEFAULT.to_bytes(): oscillators 1 and 2 at 8' (3) sawtooth (2), oscillator 3 at LO triangle; the cutoff at 5; switch byte 34 is OSC. 3 CONTROL and oscillator 1's mixer switch.
  const contour = [...word(0), ...word(0), 100];
  assert.deepEqual(
    [...packSynthdPatch(synthdInitPatch)],
    [...word(0), 0, 0, 3, 2, 3, 2, ...word(0), 0, 0, ...word(0), 100, 100, 100, 0, 0, ...word(500), 0, 0, ...contour, ...contour, 100, 0b000_0110, 0],
  );
});

/** synth53::Patch::DEFAULT: the knobs, and the switches of bytes 1, 6, 12, 14 and 15 in their top bits. */
const SWITCHED = 0x80;
const SYNTH53_DEFAULT = bytesWith(24, [
  [21, 64],
  [22, 64],
  [13, 64],
  [11, 64],
  [12, 127 | SWITCHED],
  [8, 127],
  [2, 127],
  [6, 127 | SWITCHED],
  [1, SWITCHED],
  [14, SWITCHED],
  [15, SWITCHED],
]);

/** synth8::Patch::DEFAULT. */
const SYNTH8_DEFAULT = bytesWith(43, [
  [3, 128],
  [4, 128],
  [5, 1],
  [6, 1],
  [8, 1],
  [10, 1],
  [11, 1],
  [14, 12],
  [15, 128],
  [16, 1],
  [17, 255],
  [20, 255],
  [23, 128],
  [25, 128],
  [26, 128],
  [27, 192],
  [28, 128],
  [31, 255],
  [36, 255],
  [41, 1],
  [42, 1],
]);

/** synth80::Patch::DEFAULT: two tones of sawtooth, LPF, VCF LEVEL, S and LEVEL; both channels at 8'; the levers that rest at the centre. */
const SYNTH80_TONE_DEFAULT = bytesWith(26, [
  [4, 1],
  [8, 127],
  [15, 127],
  [19, 127],
  [21, 127],
]);
const SYNTH80_DEFAULT = [
  ...SYNTH80_TONE_DEFAULT,
  ...SYNTH80_TONE_DEFAULT,
  ...bytesWith(33, [
    [0, 1],
    [1, 1],
    [2, 64],
    [4, 64],
    [6, 64],
    [7, 64],
    [8, 64],
    [9, 64],
  ]),
];

test("the synth53's, the synth8's and the synth80's init patches are the engine's defaults, byte for byte", () => {
  assert.deepEqual([...packSynth53Patch(synth53InitPatch)], SYNTH53_DEFAULT);
  assert.deepEqual([...packSynth8Patch(synth8InitPatch)], SYNTH8_DEFAULT);
  assert.deepEqual([...packSynth80Patch(synth80InitPatch)], SYNTH80_DEFAULT);
});

test("every field of a synth106's and a synthD's patch is written to its byte", () => {
  const synth106 = packSynth106Patch({
    ...synth106InitPatch,
    dcoSub: 99,
    range: 4,
    pulse: true,
    chorus: "I",
    pwm: "lfo",
    envelopePolarity: "-",
    vca: "gate",
    hpf: 3,
  });
  assert.deepEqual([synth106[15], synth106[16], synth106[17]], [99, 0b100 | 0x08 | 0x10 | 0x40, 0b110]);
  assert.equal(packSynth106Patch({ ...synth106InitPatch, chorus: "II", hpf: 0 })[16], 0b010 | 0x10);
  assert.equal(packSynth106Patch({ ...synth106InitPatch, hpf: 0 })[17], 0x01 | (3 << 3));
  const packed = packSynthdPatch({
    ...synthdInitPatch,
    tune: -242,
    oscillator2: { ...synthdInitPatch.oscillator2, frequency: 700, waveform: "narrow-rectangular", range: 2, on: true },
    oscillator3: { ...synthdInitPatch.oscillator3, frequency: -700 },
    filterContour: { attackMs: 10_000, decayMs: 1_234, sustain: 55 },
    noise: "pink",
    decayOn: true,
  });
  assert.deepEqual([...packed.subarray(0, 2)], word(-242 & 0xffff));
  assert.deepEqual([...packed.subarray(6, 10)], [5, 5, ...word(700)]);
  assert.deepEqual([...packed.subarray(12, 14)], word(-700 & 0xffff));
  assert.deepEqual([...packed.subarray(23, 28)], [...word(10_000), ...word(1_234), 55]);
  assert.deepEqual([packed[34], packed[35]], [0b000_1110, 0b10_0001]);
});

test("every field of a synth53's, a synth8's and a synth80's patch is written to its byte", () => {
  const synth53 = packSynth53Patch({ ...synth53InitPatch, oscBFine: 127, sync: true, oscBLowFrequency: true, resonance: 100 });
  assert.deepEqual([synth53[23], synth53[2], synth53[21], synth53[15]], [127, 0x80 | 127, 0x80 | 64, 0x80 | 100]);
  assert.deepEqual(
    [0, 5, 10, 100].map((tenths) => synth53Dial(tenths)),
    [0, 6, 12, 120],
  );
  const synth8 = packSynth8Patch({
    ...synth8InitPatch,
    vcfEnvMod: -128,
    vco2FineTune: 127,
    vco2Range: 36,
    assignMode: "poly-2",
    vcfSlope: 12,
    vco1Range: 2,
  });
  assert.deepEqual([synth8[23], synth8[15], synth8[14], synth8[38], synth8[22], synth8[10]], [0, 255, 36, 3, 1, 3]);
  const synth80 = packSynth80Patch({
    ...synth80InitPatch,
    tones: [synth80InitTone, { ...synth80InitTone, square: true, afterLevel: 77 }],
    feetII: "2'",
    subFunction: "external",
    tremolo: true,
    effectDepth: 12,
  });
  assert.deepEqual([synth80[26 + 3], synth80[26 + 25], synth80[53], synth80[62], synth80[82], synth80[84]], [1, 77, 5, 5, 1, 12]);
});

test("a field out of its range is a RangeError that names the instrument, the field and its range", () => {
  const faults: readonly (readonly [() => unknown, string])[] = [
    [() => packSynth106Patch({ ...synth106InitPatch, vcfResonance: 128 }), "synth106: vcfResonance is 0 to 127, not 128"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- values the types refuse, to see the checks refuse them at run time
    [() => packSynth106Patch({ ...synth106InitPatch, range: 2 as 4 }), "synth106: range is one of 16, 8, 4, not 2"],
    [() => packSynth106Patch({ ...synth106InitPatch, hpf: 4 }), "synth106: hpf is 0 to 3, not 4"],
    [() => packSynthdPatch({ ...synthdInitPatch, tune: 243 }), "synthd: tune is -242 to 242, not 243"],
    [
      () => packSynthdPatch({ ...synthdInitPatch, oscillator3: { ...synthdInitPatch.oscillator3, frequency: -701 } }),
      "synthd: oscillator3.frequency is -700 to 700, not -701",
    ],
    [
      () => packSynthdPatch({ ...synthdInitPatch, loudnessContour: { attackMs: 10_001, decayMs: 0, sustain: 0 } }),
      "synthd: loudnessContour.attackMs is 0 to 10000, not 10001",
    ],
    [() => packSynthdPatch({ ...synthdInitPatch, emphasis: 100.5 }), "synthd: emphasis is 0 to 100, not 100.5"],
    [() => packSynth53Patch({ ...synth53InitPatch, cutoff: -1 }), "synth53: cutoff is 0 to 127, not -1"],
    [() => packSynth8Patch({ ...synth8InitPatch, vco2Range: 37 }), "synth8: vco2Range is 0 to 36, not 37"],
    [() => packSynth8Patch({ ...synth8InitPatch, vcaLfoMod: 128 }), "synth8: vcaLfoMod is -128 to 127, not 128"],
    [
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
      () => packSynth8Patch({ ...synth8InitPatch, lfoWaveform: "triangle" as "sine" }),
      "synth8: lfoWaveform is one of sine, sawtooth, square, random, not triangle",
    ],
    [() => packSynth80Patch({ ...synth80InitPatch, tones: [{ ...synth80InitTone, lpf: 200 }, synth80InitTone] }), "synth80: tones[0].lpf is 0 to 127, not 200"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
    [() => packSynth80Patch({ ...synth80InitPatch, feetI: "32'" as "16'" }), "synth80: feetI is one of 16', 8', 5 1/3', 4', 2 2/3', 2', not 32'"],
  ];
  for (const [pack, message] of faults) {
    assert.throws(pack, { name: "RangeError", message });
  }
});

test("every packed patch is one its instrument reads; a byte past its control's range is named as the server names it", () => {
  assert.equal(synthPatchFault("synth106", packSynth106Patch(synth106InitPatch)), null);
  assert.equal(synthPatchFault("synthd", packSynthdPatch(synthdInitPatch)), null);
  assert.equal(synthPatchFault("synth53", packSynth53Patch(synth53InitPatch)), null);
  assert.equal(synthPatchFault("synth8", packSynth8Patch(synth8InitPatch)), null);
  assert.equal(synthPatchFault("synth80", packSynth80Patch(synth80InitPatch)), null);
  const faults: readonly (readonly [Synth, Uint8Array, string])[] = [
    [
      "synth106",
      changed(packSynth106Patch(synth106InitPatch), 16, 0x13),
      "byte 16 (range, waveforms and chorus) is 0x13: at most 0x7F, with exactly one of the range bits 0x01 (16'), 0x02 (8') and 0x04 (4')",
    ],
    ["synth106", changed(packSynth106Patch(synth106InitPatch), 17, 0x20), "byte 17 (PWM, ENV, VCA and HPF switches) is 0x20: no bit outside 0x1F"],
    ["synthd", changed(packSynthdPatch(synthdInitPatch), 9, 0x03), "byte 8 (OSCILLATOR 2 FREQUENCY) is 768: -700 to 700, the low byte first"],
    ["synthd", changed(packSynthdPatch(synthdInitPatch), 26, 0x28), "byte 25 (filter DECAY TIME) is 10240: at most 10000, the low byte first"],
    ["synth53", changed(packSynth53Patch(synth53InitPatch), 22, 0xc0), "byte 22 (OSC B FREQUENCY) is 192: at most 127"],
    ["synth8", changed(packSynth8Patch(synth8InitPatch), 14, 37), "byte 14 (VCO-2 RANGE) is 37: at most 36"],
    ["synth80", changed(packSynth80Patch(synth80InitPatch), 62, 6), "byte 62 (SUB OSCILLATOR FUNCTION) is 6: at most 5"],
    ["synth80", new Uint8Array(84), "is 84 bytes, not a synth80 patch's 85"],
  ];
  for (const [synth, bytes, why] of faults) {
    assert.equal(synthPatchFault(synth, bytes), why);
  }
  assert.deepEqual(SYNTH_PATCH_BYTES, { synth7: 128, synth106: 18, synth60: 18, synthd: 36, synth53: 24, synth52: 24, synth51: 24, synth8: 43, synth80: 85 });
});

test("each name of a family packs its family's layout under its own name (DEC-6461)", () => {
  assert.deepEqual(packSynth60Patch(synth60InitPatch), packSynth106Patch(synth106InitPatch));
  assert.deepEqual(packSynth52Patch(synth52InitPatch), packSynth53Patch(synth53InitPatch));
  assert.deepEqual(packSynth51Patch(synth51InitPatch), packSynth53Patch(synth53InitPatch));
  assert.throws(() => packSynth60Patch({ ...synth60InitPatch, hpf: 4 }), { name: "RangeError", message: "synth60: hpf is 0 to 3, not 4" });
  assert.throws(() => packSynth51Patch({ ...synth51InitPatch, filterAttack: 128 }), {
    name: "RangeError",
    message: "synth51: filterAttack is 0 to 127, not 128",
  });
  assert.equal(synthPatchFault("synth60", packSynth60Patch(synth60InitPatch)), null);
  assert.equal(synthPatchFault("synth52", new Uint8Array(23)), "is 23 bytes, not a synth52 patch's 24");
  assert.equal(synthPatchFault("synth7", new Uint8Array(128).fill(128, 5, 6)), "byte 5 is 128: at most 127");
});

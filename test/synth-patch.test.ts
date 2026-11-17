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
  cs80InitPatch,
  cs80InitTone,
  junoInitPatch,
  jupiter8InitPatch,
  minimoogInitPatch,
  packCs80Patch,
  packJunoPatch,
  packJupiter8Patch,
  packMinimoogPatch,
  packProphet5Patch,
  prophet5Dial,
  prophet5InitPatch,
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

test("the Juno's and the Minimoog's init patches are the engine's defaults, byte for byte", () => {
  // juno::Patch::DEFAULT.to_bytes(): the sliders, then 8' | sawtooth | chorus off, and PWM manual | HPF 1 (three less, in bits 3 and 4).
  assert.deepEqual([...packJunoPatch(junoInitPatch)], [0, 0, 0, 0, 0, 127, 0, 0, 0, 0, 64, 0, 0, 127, 0, 0, 0x32, 0x11]);
  // minimoog::Patch::DEFAULT.to_bytes(): oscillators 1 and 2 at 8' (3) sawtooth (2), oscillator 3 at LO triangle; the cutoff at 5; switch byte 34 is OSC. 3 CONTROL and oscillator 1's mixer switch.
  const contour = [...word(0), ...word(0), 100];
  assert.deepEqual(
    [...packMinimoogPatch(minimoogInitPatch)],
    [...word(0), 0, 0, 3, 2, 3, 2, ...word(0), 0, 0, ...word(0), 100, 100, 100, 0, 0, ...word(500), 0, 0, ...contour, ...contour, 100, 0b000_0110, 0],
  );
});

/** prophet5::Patch::DEFAULT: the knobs, and the switches of bytes 1, 6, 12, 14 and 15 in their top bits. */
const SWITCHED = 0x80;
const PROPHET5_DEFAULT = bytesWith(24, [
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

/** jupiter8::Patch::DEFAULT. */
const JUPITER8_DEFAULT = bytesWith(43, [
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

/** cs80::Patch::DEFAULT: two tones of sawtooth, LPF, VCF LEVEL, S and LEVEL; both channels at 8'; the levers that rest at the centre. */
const CS80_TONE_DEFAULT = bytesWith(26, [
  [4, 1],
  [8, 127],
  [15, 127],
  [19, 127],
  [21, 127],
]);
const CS80_DEFAULT = [
  ...CS80_TONE_DEFAULT,
  ...CS80_TONE_DEFAULT,
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

test("the Prophet-5's, the Jupiter-8's and the CS-80's init patches are the engine's defaults, byte for byte", () => {
  assert.deepEqual([...packProphet5Patch(prophet5InitPatch)], PROPHET5_DEFAULT);
  assert.deepEqual([...packJupiter8Patch(jupiter8InitPatch)], JUPITER8_DEFAULT);
  assert.deepEqual([...packCs80Patch(cs80InitPatch)], CS80_DEFAULT);
});

test("every field of a Juno's and a Minimoog's patch is written to its byte", () => {
  const juno = packJunoPatch({ ...junoInitPatch, dcoSub: 99, range: 4, pulse: true, chorus: "I", pwm: "lfo", envelopePolarity: "-", vca: "gate", hpf: 3 });
  assert.deepEqual([juno[15], juno[16], juno[17]], [99, 0b100 | 0x08 | 0x10 | 0x40, 0b110]);
  assert.equal(packJunoPatch({ ...junoInitPatch, chorus: "II", hpf: 0 })[16], 0b010 | 0x10);
  assert.equal(packJunoPatch({ ...junoInitPatch, hpf: 0 })[17], 0x01 | (3 << 3));
  const moog = packMinimoogPatch({
    ...minimoogInitPatch,
    tune: -242,
    oscillator2: { ...minimoogInitPatch.oscillator2, frequency: 700, waveform: "narrow-rectangular", range: 2, on: true },
    oscillator3: { ...minimoogInitPatch.oscillator3, frequency: -700 },
    filterContour: { attackMs: 10_000, decayMs: 1_234, sustain: 55 },
    noise: "pink",
    decayOn: true,
  });
  assert.deepEqual([...moog.subarray(0, 2)], word(-242 & 0xffff));
  assert.deepEqual([...moog.subarray(6, 10)], [5, 5, ...word(700)]);
  assert.deepEqual([...moog.subarray(12, 14)], word(-700 & 0xffff));
  assert.deepEqual([...moog.subarray(23, 28)], [...word(10_000), ...word(1_234), 55]);
  assert.deepEqual([moog[34], moog[35]], [0b000_1110, 0b10_0001]);
});

test("every field of a Prophet-5's, a Jupiter-8's and a CS-80's patch is written to its byte", () => {
  const prophet5 = packProphet5Patch({ ...prophet5InitPatch, oscBFine: 127, sync: true, oscBLowFrequency: true, resonance: 100 });
  assert.deepEqual([prophet5[23], prophet5[2], prophet5[21], prophet5[15]], [127, 0x80 | 127, 0x80 | 64, 0x80 | 100]);
  assert.deepEqual(
    [0, 5, 10, 100].map((tenths) => prophet5Dial(tenths)),
    [0, 6, 12, 120],
  );
  const jupiter8 = packJupiter8Patch({
    ...jupiter8InitPatch,
    vcfEnvMod: -128,
    vco2FineTune: 127,
    vco2Range: 36,
    assignMode: "poly-2",
    vcfSlope: 12,
    vco1Range: 2,
  });
  assert.deepEqual([jupiter8[23], jupiter8[15], jupiter8[14], jupiter8[38], jupiter8[22], jupiter8[10]], [0, 255, 36, 3, 1, 3]);
  const cs80 = packCs80Patch({
    ...cs80InitPatch,
    tones: [cs80InitTone, { ...cs80InitTone, square: true, afterLevel: 77 }],
    feetII: "2'",
    subFunction: "external",
    tremolo: true,
    effectDepth: 12,
  });
  assert.deepEqual([cs80[26 + 3], cs80[26 + 25], cs80[53], cs80[62], cs80[82], cs80[84]], [1, 77, 5, 5, 1, 12]);
});

test("a field out of its range is a RangeError that names the instrument, the field and its range", () => {
  const faults: readonly (readonly [() => unknown, string])[] = [
    [() => packJunoPatch({ ...junoInitPatch, vcfResonance: 128 }), "juno: vcfResonance is 0 to 127, not 128"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- values the types refuse, to see the checks refuse them at run time
    [() => packJunoPatch({ ...junoInitPatch, range: 2 as 4 }), "juno: range is one of 16, 8, 4, not 2"],
    [() => packJunoPatch({ ...junoInitPatch, hpf: 4 }), "juno: hpf is 0 to 3, not 4"],
    [() => packMinimoogPatch({ ...minimoogInitPatch, tune: 243 }), "minimoog: tune is -242 to 242, not 243"],
    [
      () => packMinimoogPatch({ ...minimoogInitPatch, oscillator3: { ...minimoogInitPatch.oscillator3, frequency: -701 } }),
      "minimoog: oscillator3.frequency is -700 to 700, not -701",
    ],
    [
      () => packMinimoogPatch({ ...minimoogInitPatch, loudnessContour: { attackMs: 10_001, decayMs: 0, sustain: 0 } }),
      "minimoog: loudnessContour.attackMs is 0 to 10000, not 10001",
    ],
    [() => packMinimoogPatch({ ...minimoogInitPatch, emphasis: 100.5 }), "minimoog: emphasis is 0 to 100, not 100.5"],
    [() => packProphet5Patch({ ...prophet5InitPatch, cutoff: -1 }), "prophet5: cutoff is 0 to 127, not -1"],
    [() => packJupiter8Patch({ ...jupiter8InitPatch, vco2Range: 37 }), "jupiter8: vco2Range is 0 to 36, not 37"],
    [() => packJupiter8Patch({ ...jupiter8InitPatch, vcaLfoMod: 128 }), "jupiter8: vcaLfoMod is -128 to 127, not 128"],
    [
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
      () => packJupiter8Patch({ ...jupiter8InitPatch, lfoWaveform: "triangle" as "sine" }),
      "jupiter8: lfoWaveform is one of sine, sawtooth, square, random, not triangle",
    ],
    [() => packCs80Patch({ ...cs80InitPatch, tones: [{ ...cs80InitTone, lpf: 200 }, cs80InitTone] }), "cs80: tones[0].lpf is 0 to 127, not 200"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
    [() => packCs80Patch({ ...cs80InitPatch, feetI: "32'" as "16'" }), "cs80: feetI is one of 16', 8', 5 1/3', 4', 2 2/3', 2', not 32'"],
  ];
  for (const [pack, message] of faults) {
    assert.throws(pack, { name: "RangeError", message });
  }
});

test("every packed patch is one its instrument reads; a byte past its control's range is named as the server names it", () => {
  assert.equal(synthPatchFault("juno", packJunoPatch(junoInitPatch)), null);
  assert.equal(synthPatchFault("minimoog", packMinimoogPatch(minimoogInitPatch)), null);
  assert.equal(synthPatchFault("prophet5", packProphet5Patch(prophet5InitPatch)), null);
  assert.equal(synthPatchFault("jupiter8", packJupiter8Patch(jupiter8InitPatch)), null);
  assert.equal(synthPatchFault("cs80", packCs80Patch(cs80InitPatch)), null);
  const faults: readonly (readonly [Synth, Uint8Array, string])[] = [
    [
      "juno",
      changed(packJunoPatch(junoInitPatch), 16, 0x13),
      "byte 16 (range, waveforms and chorus) is 0x13: at most 0x7F, with exactly one of the range bits 0x01 (16'), 0x02 (8') and 0x04 (4')",
    ],
    ["juno", changed(packJunoPatch(junoInitPatch), 17, 0x20), "byte 17 (PWM, ENV, VCA and HPF switches) is 0x20: no bit outside 0x1F"],
    ["minimoog", changed(packMinimoogPatch(minimoogInitPatch), 9, 0x03), "byte 8 (OSCILLATOR 2 FREQUENCY) is 768: -700 to 700, the low byte first"],
    ["minimoog", changed(packMinimoogPatch(minimoogInitPatch), 26, 0x28), "byte 25 (filter DECAY TIME) is 10240: at most 10000, the low byte first"],
    ["prophet5", changed(packProphet5Patch(prophet5InitPatch), 22, 0xc0), "byte 22 (OSC B FREQUENCY) is 192: at most 127"],
    ["jupiter8", changed(packJupiter8Patch(jupiter8InitPatch), 14, 37), "byte 14 (VCO-2 RANGE) is 37: at most 36"],
    ["cs80", changed(packCs80Patch(cs80InitPatch), 62, 6), "byte 62 (SUB OSCILLATOR FUNCTION) is 6: at most 5"],
    ["cs80", new Uint8Array(84), "is 84 bytes, not a cs80 patch's 85"],
  ];
  for (const [synth, bytes, why] of faults) {
    assert.equal(synthPatchFault(synth, bytes), why);
  }
  assert.deepEqual(SYNTH_PATCH_BYTES, { juno: 18, minimoog: 36, prophet5: 24, jupiter8: 43, cs80: 85 });
});

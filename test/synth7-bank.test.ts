// synth7 patches (REQ-6414 item 3): a bank from the instrument's 32-voice
// bulk dump, checked before it is used, and one patch packed from its
// parameters into the dump's 128 bytes (Yamaha's DX7 MIDI data format
// sheet, "Bulk data for 32 voices" and "Bulk dump packed format").

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SYNTH7_SYSEX_BYTES,
  type Synth7Operator,
  type Synth7Patch,
  synth7BankFromSysex,
  synth7InitVoice,
  synth7Patches,
  packSynth7Patch,
} from "../src/index.ts";

/** The data of a dump: 32 patches of 128 bytes, each byte its place in its patch but the first, which is the patch's number. */
function bankData(): Uint8Array {
  return Uint8Array.from({ length: 4096 }, (_, index) => (index % 128 === 0 ? index / 128 : index % 128));
}

/** A 32-voice dump of `data` sent on MIDI channel `channel` + 1: F0 43 0n 09 20 00, the data, its checksum, F7. */
function dump(data: Uint8Array, channel: number): Uint8Array {
  let sum = 0;
  for (const byte of data) {
    sum += byte;
  }
  return Uint8Array.from([0xf0, 0x43, channel, 0x09, 0x20, 0x00, ...data, -sum & 0x7f, 0xf7]);
}

test("a 32-voice dump gives its 4,096 bytes of patches, whatever MIDI channel it was sent on", () => {
  assert.equal(SYNTH7_SYSEX_BYTES, 4104);
  const data = bankData();
  assert.deepEqual(synth7BankFromSysex(dump(data, 1)), data, "MIDI channel 2");
  assert.deepEqual(synth7BankFromSysex(dump(data, 0)), data);
  assert.deepEqual(synth7BankFromSysex(dump(data, 15)), data);
  // A checksum is the sum's two's complement in 7 bits: data that sums to a multiple of 128 has checksum 0.
  const zeros = dump(new Uint8Array(4096), 0);
  assert.equal(zeros[4102], 0);
  assert.equal(synth7BankFromSysex(zeros).length, 4096);
});

test("a dump with a wrong length, header, checksum or end is refused", () => {
  const good = dump(bankData(), 1);
  const changed = (at: number, byte: number): Uint8Array => good.with(at, byte);
  const cases: readonly (readonly [string, Uint8Array, RegExp])[] = [
    ["a byte short", good.subarray(0, 4103), /4104 bytes, not 4103/u],
    ["a byte long", Uint8Array.from([...good, 0]), /4104 bytes, not 4105/u],
    ["not System Exclusive", changed(0, 0xf1), /F0 43/u],
    ["not the maker's", changed(1, 0x44), /F0 43/u],
    ["a parameter change's sub-status", changed(2, 0x11), /sub-status/u],
    ["one voice's format", changed(3, 0x00), /format 9/u],
    ["another byte count", changed(4, 0x10), /format 9/u],
    ["another byte count's low byte", changed(5, 0x01), /format 9/u],
    ["a changed data byte", changed(100, (good[100] ?? 0) ^ 1), /checksum/u],
    ["a changed checksum", changed(4102, (good[4102] ?? 0) ^ 1), /checksum/u],
    ["a data byte above 127", changed(6 + 200, 0x80), /data byte 200 is 128/u],
    ["no end byte", changed(4103, 0x00), /end F7/u],
  ];
  for (const [what, bytes, why] of cases) {
    assert.throws(() => synth7BankFromSysex(bytes), why, what);
  }
});

test("patches are chosen from a bank in any order", () => {
  const data = bankData();
  const chosen = synth7Patches(data, [31, 0, 31]);
  assert.equal(chosen.length, 3 * 128);
  assert.deepEqual([chosen[0], chosen[128], chosen[256], chosen[127]], [31, 0, 31, 127]);
  assert.throws(() => synth7Patches(data, []), RangeError);
  assert.throws(() => synth7Patches(data, [32]), RangeError);
  assert.throws(() => synth7Patches(data.subarray(0, 128), [1]), RangeError);
  assert.throws(() => synth7Patches(data.subarray(0, 100), [0]), RangeError);
  assert.throws(
    () =>
      synth7Patches(
        data,
        Array.from({ length: 33 }, () => 0),
      ),
    RangeError,
  );
});

test("the instrument's INIT VOICE packs to its 128 bytes", () => {
  // Operators 6 to 2: silent sine waves at ratio 1, detune 7 (7 << 3 is 56), coarse 1 (1 << 1 is 2).
  const silent = [99, 99, 99, 99, 99, 99, 99, 0, 39, 0, 0, 0, 56, 0, 0, 2, 0];
  // The pitch envelope, algorithm 1 as 0, feedback 0 with key sync (8), LFO speed 35, key sync with pitch modulation sensitivity 3 (1 | 3 << 4), transpose 24.
  const after = [99, 99, 99, 99, 50, 50, 50, 50, 0, 8, 35, 0, 0, 0, 49, 24];
  // Operators 6 to 2, then operator 1, the same at output level 99.
  const expected = [...Array.from({ length: 5 }, () => silent).flat(), ...silent.with(14, 99), ...after, ...Buffer.from("INIT VOICE", "ascii")];
  assert.equal(expected.length, 128);
  assert.deepEqual(Array.from(packSynth7Patch(synth7InitVoice())), expected);
});

/** Operator `k`, every parameter a value that depends on it, so that an operator out of place or a field in the wrong bits shows. */
function operator(k: number): Synth7Operator {
  return {
    rates: [k, 10 + k, 20 + k, 30 + k],
    levels: [40 + k, 50 + k, 60 + k, 70 + k],
    breakPoint: 80 + k,
    leftDepth: 90 + k,
    rightDepth: k,
    leftCurve: k % 4,
    rightCurve: (k + 1) % 4,
    rateScaling: k,
    ampModSensitivity: k % 4,
    keyVelocitySensitivity: k,
    outputLevel: 99 - k,
    mode: k % 2 === 1 ? "fixed" : "ratio",
    coarse: 20 + k,
    fine: 2 * k,
    detune: 8 + k,
  };
}

const PATCH: Synth7Patch = {
  operators: [operator(1), operator(2), operator(3), operator(4), operator(5), operator(6)],
  pitchRates: [1, 2, 3, 4],
  pitchLevels: [5, 6, 7, 8],
  algorithm: 32,
  feedback: 5,
  oscillatorKeySync: true,
  lfoSpeed: 11,
  lfoDelay: 22,
  pitchModDepth: 33,
  ampModDepth: 44,
  lfoKeySync: false,
  lfoWave: 5,
  pitchModSensitivity: 7,
  transpose: 48,
  name: "AB",
};

test("a patch's parameters are packed operator 6 first, each field in its byte and its bits", () => {
  const bytes = Array.from(packSynth7Patch(PATCH));
  // Operator 6 at 0: curves 2 | 3 << 2, rate scaling 6 | detune 14 << 3, sensitivities 2 | 6 << 2, ratio | coarse 26 << 1.
  assert.deepEqual(bytes.slice(0, 17), [6, 16, 26, 36, 46, 56, 66, 76, 86, 96, 6, 14, 118, 26, 93, 52, 12]);
  // Operator 1 at 85: curves 1 | 2 << 2, rate scaling 1 | detune 9 << 3, sensitivities 1 | 1 << 2, fixed | coarse 21 << 1.
  assert.deepEqual(bytes.slice(85, 102), [1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 1, 9, 73, 5, 98, 43, 2]);
  // Operators 5 to 2 at 17, 34, 51 and 68 begin with their own rates.
  assert.deepEqual([bytes[17], bytes[34], bytes[51], bytes[68]], [5, 4, 3, 2]);
  // Algorithm 32 as 31; feedback 5 | key sync << 3; the LFO; no LFO key sync | wave 5 << 1 | sensitivity 7 << 4; transpose; the name and its spaces.
  assert.deepEqual(bytes.slice(102, 118), [1, 2, 3, 4, 5, 6, 7, 8, 31, 13, 11, 22, 33, 44, 122, 48]);
  assert.deepEqual(bytes.slice(118), [0x41, 0x42, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20]);
  assert.ok(bytes.every((byte) => byte <= 127));
});

/** Every parameter with a range: its name, its greatest value, and a patch with it set. */
const OPERATOR_RANGES: readonly (readonly [keyof Synth7Operator, number])[] = [
  ["breakPoint", 99],
  ["leftDepth", 99],
  ["rightDepth", 99],
  ["leftCurve", 3],
  ["rightCurve", 3],
  ["rateScaling", 7],
  ["ampModSensitivity", 3],
  ["keyVelocitySensitivity", 7],
  ["outputLevel", 99],
  ["coarse", 31],
  ["fine", 99],
  ["detune", 14],
];
const PATCH_RANGES: readonly (readonly [keyof Synth7Patch, number])[] = [
  ["algorithm", 32],
  ["feedback", 7],
  ["lfoSpeed", 99],
  ["lfoDelay", 99],
  ["pitchModDepth", 99],
  ["ampModDepth", 99],
  ["lfoWave", 5],
  ["pitchModSensitivity", 7],
  ["transpose", 48],
];

/** `PATCH` with operator 4 changed. */
function withOperator(change: Partial<Synth7Operator>): Synth7Patch {
  const [one, two, three, four, five, six] = PATCH.operators;
  return { ...PATCH, operators: [one, two, three, { ...four, ...change }, five, six] };
}

test("each parameter is taken at its greatest value and refused one past it", () => {
  for (const [name, most] of OPERATOR_RANGES) {
    assert.equal(packSynth7Patch(withOperator({ [name]: most })).length, 128, name);
    assert.throws(() => packSynth7Patch(withOperator({ [name]: most + 1 })), new RegExp(`operator 4 .* is 0 to ${most}, not ${most + 1}`, "u"), name);
    assert.throws(() => packSynth7Patch(withOperator({ [name]: -1 })), RangeError, name);
  }
  for (const [name, most] of PATCH_RANGES) {
    assert.equal(packSynth7Patch({ ...PATCH, [name]: most }).length, 128, name);
    assert.throws(() => packSynth7Patch({ ...PATCH, [name]: most + 1 }), RangeError, name);
    assert.throws(() => packSynth7Patch({ ...PATCH, [name]: 0.5 }), RangeError, name);
  }
  assert.throws(() => packSynth7Patch({ ...PATCH, algorithm: 0 }), /the algorithm is 1 to 32, not 0/u);
  for (const four of [
    [0, 0, 0, 100],
    [100, 0, 0, 0],
    [0, -1, 0, 0],
  ] as const) {
    assert.throws(() => packSynth7Patch(withOperator({ rates: four })), RangeError);
    assert.throws(() => packSynth7Patch(withOperator({ levels: four })), RangeError);
    assert.throws(() => packSynth7Patch({ ...PATCH, pitchRates: four }), RangeError);
    assert.throws(() => packSynth7Patch({ ...PATCH, pitchLevels: four }), RangeError);
  }
});

test("a name is at most ten printable ASCII characters; a patch has six operators and an operator a mode", () => {
  assert.equal(Buffer.from(packSynth7Patch({ ...PATCH, name: "E.PIANO 1 " }).subarray(118)).toString("ascii"), "E.PIANO 1 ");
  assert.equal(Buffer.from(packSynth7Patch({ ...PATCH, name: "" }).subarray(118)).toString("ascii"), " ".repeat(10));
  for (const name of ["ELEVEN CHARS", "caf\u{E9}", "TAB\tBED", "\u{7F}"]) {
    assert.throws(() => packSynth7Patch({ ...PATCH, name }), /printable ASCII/u, name);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a mode the type refuses, to see the check refuse it at run time
  assert.throws(() => packSynth7Patch(withOperator({ mode: "both" as "fixed" })), /ratio or fixed/u);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- five operators, which the type refuses, to see the check refuse them at run time
  assert.throws(() => packSynth7Patch({ ...PATCH, operators: PATCH.operators.slice(1) as unknown as Synth7Patch["operators"] }), /6 operators, not 5/u);
});

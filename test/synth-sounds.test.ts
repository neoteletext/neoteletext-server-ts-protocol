// The members of `context.sound` of the synthesizers played by slots
// (DEC-6429, DEC-6461): each name its own kind, written as the server reads
// it, a synth8's with its keyboard, each fault the server would refuse refused here as a
// RangeError that names it, the wire's own check giving the server's path
// and rule, and a channel's tests reading what was sent.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Application,
  type PageEntry,
  SYNTHS,
  SYNTH_FAMILY,
  SYNTH_PATCH_BYTES,
  type SoundMember,
  type Synth,
  type SynthBlocks,
  type SynthLive,
  type SynthSound,
  Synth106Controller,
  checkProgram,
  instrumentSlotFault,
  synth106InitPatch,
  synth8InitPatch,
  packSynth106Patch,
  packSynth8Patch,
  soundFields,
} from "../src/index.ts";
import { Harness, SERVER_LIMITS, soundBytes } from "../src/testing/index.ts";
import { screen } from "./recorder.ts";

const base64 = (bytes: Uint8Array | readonly number[]): string => Buffer.from(bytes).toString("base64");
/** Two blocks of two slots: a program change and a note, then the note's end and an empty slot. */
const SLOTS = Uint8Array.from([0, 0xc0, 3, 0, 10, 0x90, 60, 100, 199, 0x80, 60, 0, 0, 0, 0, 0]);
/** A patch of each synthesizer that its instrument reads: zeros but a synth106's or synth60's range, 8'. */
const plain = (synth: Synth): Uint8Array => {
  const patch = new Uint8Array(SYNTH_PATCH_BYTES[synth]);
  if (SYNTH_FAMILY[synth] === "synth106") {
    patch[16] = 0b010;
  }
  return patch;
};

/** A synthesizer's live blocks member. */
function blocksMember(synth: Synth, blocks: SynthBlocks): SoundMember {
  const members: Record<Synth, SoundMember> = {
    synth7: { synth7Blocks: blocks },
    synth106: { synth106Blocks: blocks },
    synth60: { synth60Blocks: blocks },
    synthd: { synthdBlocks: blocks },
    synth53: { synth53Blocks: blocks },
    synth52: { synth52Blocks: blocks },
    synth51: { synth51Blocks: blocks },
    synth8: { synth8Blocks: blocks },
    synth80: { synth80Blocks: blocks },
  };
  return members[synth];
}

/** A synthesizer's bank member, of handle 1 and generation 0. */
function bankMember(synth: Synth, patches: Uint8Array): SoundMember {
  const bank = { handle: 1, generation: 0, patches };
  const members: Record<Synth, SoundMember> = {
    synth7: { synth7Bank: bank },
    synth106: { synth106Bank: bank },
    synth60: { synth60Bank: bank },
    synthd: { synthdBank: bank },
    synth53: { synth53Bank: bank },
    synth52: { synth52Bank: bank },
    synth51: { synth51Bank: bank },
    synth8: { synth8Bank: bank },
    synth80: { synth80Bank: bank },
  };
  return members[synth];
}

/** A synthesizer's stored sound member. */
function soundMember(synth: Synth, sound: SynthSound): SoundMember {
  const members: Record<Synth, SoundMember> = {
    synth7: { synth7: sound },
    synth106: { synth106: sound },
    synth60: { synth60: sound },
    synthd: { synthd: sound },
    synth53: { synth53: sound },
    synth52: { synth52: sound },
    synth51: { synth51: sound },
    synth8: { synth8: sound },
    synth80: { synth80: sound },
  };
  return members[synth];
}

/** A synthesizer's live sound member. */
function liveMember(synth: Synth, live: SynthLive): SoundMember {
  const members: Record<Synth, SoundMember> = {
    synth7: { synth7Live: live },
    synth106: { synth106Live: live },
    synth60: { synth60Live: live },
    synthd: { synthdLive: live },
    synth53: { synth53Live: live },
    synth52: { synth52Live: live },
    synth51: { synth51Live: live },
    synth8: { synth8Live: live },
    synth80: { synth80Live: live },
  };
  return members[synth];
}

test("each name's members are written as its own kind, with no model, and a synth8's with its keyboard as said or by default", () => {
  const sound = { handle: 7, generation: 1, slots: 2, bank: 200, blocks: SLOTS };
  const wired = { handle: 7, generation: 1, slots: 2, bank: 200, blocks: base64(SLOTS) };
  const live = { handle: 8, generation: 2, slots: 16, bank: 0 };
  for (const synth of SYNTHS) {
    const keys = synth === "synth8" ? { key_mode: "whole", split_key: 60 } : {};
    assert.deepEqual(soundFields(soundMember(synth, sound)), { kind: synth, ...wired, ...keys }, synth);
    assert.deepEqual(soundFields(liveMember(synth, live)), { kind: `${synth}_live`, ...live, ...keys }, synth);
  }
  assert.deepEqual(soundFields({ synth8: { ...sound, keyMode: "split", splitKey: 48 } }), { kind: "synth8", ...wired, key_mode: "split", split_key: 48 });
  assert.deepEqual(soundFields({ synth8Live: { ...live, keyMode: "dual" } }), { kind: "synth8_live", ...live, key_mode: "dual", split_key: 60 });
  for (const synth of SYNTHS) {
    const blocks = { handle: 8, generation: 2, slots: 2, first: 65_535, blocks: SLOTS };
    assert.deepEqual(soundFields(blocksMember(synth, blocks)), { kind: `${synth}_blocks`, ...blocks, blocks: base64(SLOTS) }, synth);
    const patches = Uint8Array.from([...plain(synth), ...plain(synth)]);
    assert.deepEqual(soundFields(bankMember(synth, patches)), { kind: `${synth}_bank`, handle: 1, generation: 0, patches: base64(patches) }, synth);
  }
});

test("the synth106 and the synth60 alone take MIDI's four mode messages after all notes off, with a value of 0 to 127", () => {
  for (const controller of Object.values(Synth106Controller)) {
    for (const synth of SYNTHS) {
      const fault = instrumentSlotFault({ time: 0, status: 0xb0, data1: controller, data2: 0 }, synth);
      assert.equal(fault === null, SYNTH_FAMILY[synth] === "synth106", `${synth} ${controller}: ${fault}`);
    }
    assert.equal(instrumentSlotFault({ time: 0, status: 0xb0, data1: controller, data2: 128 }, "synth106"), "a controller's value is 0 to 127");
    assert.notEqual(instrumentSlotFault({ time: 0, status: 0xb0, data1: controller, data2: 0 }, "synth7"), null);
  }
});

test("a synthesizer member out of the server's bounds is a RangeError where it is made", () => {
  const sound = { handle: 1, generation: 0, slots: 1, bank: 0, blocks: SLOTS.subarray(0, 4) };
  const cases: readonly (readonly [SoundMember, string])[] = [
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a value the types refuse, to see the check refuse it at run time
    [{ synth8: { ...sound, keyMode: "layer" as "dual" } }, "sound: key_mode is one of whole, dual, split, not layer"],
    [{ synth8Live: { ...sound, splitKey: 128 } }, "sound: split_key is 0 to 127, not 128"],
    [{ synth80: { ...sound, slots: 17 } }, "sound: slots is 1 to 16, not 17"],
    [{ synthd: { ...sound, blocks: new Uint8Array(4 * 6_001) } }, "sound: blocks are at most 6000 blocks, not 6001"],
    [{ synth106Blocks: { ...sound, first: 0, blocks: new Uint8Array(4 * 101) } }, "sound: blocks are at most 100 blocks, not 101"],
    [
      { synthd: { ...sound, blocks: Uint8Array.from([0, 0xa0, 60, 1]) } },
      "sound: blocks: block 0 slot 0: its status is a note off, note on, control change, program change or pitch bend",
    ],
    [
      { synth80Blocks: { ...sound, first: 0, blocks: Uint8Array.from([0, 0xd0, 1, 1]) } },
      "sound: blocks: block 0 slot 0: a channel pressure's second data byte is 0",
    ],
    [
      { synth8: { ...sound, blocks: Uint8Array.from([0, 0xc5, 1, 0]) } },
      "sound: blocks: block 0 slot 0: a synth8's program change is on MIDI channel 1, the upper patch, or 2, the lower",
    ],
    [
      { synth106Blocks: { ...sound, first: 0, blocks: Uint8Array.from([0, 0xb0, 122, 0]) } },
      "sound: blocks: block 0 slot 0: a synth106's control change is of controller 1, 7, 64, 120, 121 or 123 to 127",
    ],
    [
      { synth60Blocks: { ...sound, first: 0, blocks: Uint8Array.from([0, 0xb0, 122, 0]) } },
      "sound: blocks: block 0 slot 0: a synth60's control change is of controller 1, 7, 64, 120, 121 or 123 to 127",
    ],
    [
      { synthd: { ...sound, blocks: Uint8Array.from([0, 0xb0, 124, 0]) } },
      "sound: blocks: block 0 slot 0: a control change is of controller 1, 7, 64, 120, 121 or 123",
    ],
    [bankMember("synth106", new Uint8Array(17)), "sound: patches are whole patches of 18 bytes, not 17 bytes"],
    [bankMember("synth80", new Uint8Array(85 * 33)), "sound: patches are at most 32 patches, not 33"],
    [
      bankMember("synth106", new Uint8Array(18)),
      "sound: patches: patch 0 byte 16 (range, waveforms and chorus) is 0x00: at most 0x7F, with exactly one of the range bits 0x01 (16'), 0x02 (8') and 0x04 (4')",
    ],
    [
      bankMember("synth8", Uint8Array.from([...packSynth8Patch(synth8InitPatch), ...packSynth8Patch(synth8InitPatch)]).fill(9, 43 + 38, 43 + 39)),
      "sound: patches: patch 1 byte 38 (ASSIGN MODE) is 9: at most 3",
    ],
  ];
  for (const [member, message] of cases) {
    assert.throws(() => soundFields(member), { name: "RangeError", message });
  }
  assert.equal(soundFields({ synth106Bank: { handle: 1, generation: 0, patches: new Uint8Array(32 * 18).fill(0b010) } }).kind, "synth106_bank", "32 patches");
});

/** A `sound` line of an instrument's kind. */
function wire(kind: string, fields: Record<string, unknown>): unknown {
  return { type: "sound", connections: [1], kind, handle: 1, generation: 0, ...fields };
}

/** The path and rule `checkProgram` refuses `message` with, or null. */
function refusal(message: unknown): [string, string] | null {
  const fault = checkProgram(message, SERVER_LIMITS);
  return fault === null ? null : [fault.path, fault.rule];
}

test("a line of a synthesizer's sound is held to the server's schema and rules, with its paths and rules", () => {
  const blocks = { slots: 2, bank: 0, blocks: base64(SLOTS) };
  for (const synth of SYNTHS) {
    const keys = synth === "synth8" ? { key_mode: "split", split_key: 0 } : {};
    assert.equal(refusal(wire(synth, { ...blocks, ...keys })), null, synth);
    assert.equal(refusal(wire(`${synth}_live`, { slots: 16, bank: 255, ...keys })), null, synth);
    assert.equal(refusal(wire(`${synth}_blocks`, { slots: 2, first: 65_535, blocks: base64(SLOTS) })), null, synth);
    assert.equal(refusal(wire(`${synth}_bank`, { patches: base64(plain(synth)) })), null, synth);
    assert.deepEqual(refusal(wire(`${synth}_bank`, { patches: base64(new Uint8Array(SYNTH_PATCH_BYTES[synth] + 1)) })), ["patches", "wrong_length"], synth);
  }
  const refused: readonly (readonly [unknown, string, string])[] = [
    [wire("synth8", { ...blocks, key_mode: "split", split_key: 128 }), "split_key", "out_of_range"],
    [wire("synth8_live", { slots: 1, bank: 0, key_mode: "layer", split_key: 1 }), "key_mode", "not_listed"],
    [wire("synth80", { ...blocks, slots: 17 }), "slots", "out_of_range"],
    [wire("synth80_blocks", { slots: 1, first: 0, blocks: base64(new Uint8Array(4 * 101)) }), "blocks", "too_long"],
    [wire("synth53_blocks", { slots: 1, first: 0, blocks: base64([0, 0xa0, 1, 1]) }), "blocks", "outside_profile"],
    [wire("synth8_bank", { patches: base64(new Uint8Array(43).fill(255)) }), "patches", "outside_profile"],
    [wire("synthd_bank", { patches: base64(new Uint8Array(36 * 33)) }), "patches", "too_long"],
  ];
  for (const [message, path, rule] of refused) {
    assert.deepEqual(refusal(message), [path, rule], JSON.stringify(message).slice(0, 200));
  }
});

test("a channel's tests read a synthesizer's sound and its bank from what was sent", () => {
  const patch = packSynth106Patch({ ...synth106InitPatch, vcfResonance: 90 });
  const player: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, screen("index"));
    },
    joined: (session, context): void => {
      context.sound({ session }, { synth106Bank: { handle: 200, generation: 1, patches: patch } });
      context.sound({ session }, { synth60: { handle: 7, generation: 1, slots: 2, bank: 200, blocks: SLOTS } });
      context.sound({ session }, { play: { channel: 0, handle: 7, generation: 1 } });
    },
  };
  const harness = new Harness([player]);
  harness.join(1, 0x100);
  const sounds = harness.sounds(1);
  assert.deepEqual(
    sounds.map((sound) => sound["kind"]),
    ["synth106_bank", "synth60", "play"],
  );
  const [bank, synth60] = sounds;
  assert.ok(bank !== undefined && synth60 !== undefined);
  assert.deepEqual(soundBytes(bank), patch);
  assert.deepEqual(soundBytes(synth60), SLOTS);
  assert.deepEqual([synth60["bank"], synth60["model"]], [200, undefined]);
});

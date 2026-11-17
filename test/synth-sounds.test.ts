// The analogue synthesizers' members of `context.sound` (DEC-6429; the
// server's 2df311a): each written as the server reads it, with its model
// or keyboard, each fault the server would refuse refused here as a
// RangeError that names it, the wire's own check giving the server's path
// and rule, and a channel's tests reading what was sent.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Application,
  type PageEntry,
  SYNTHS,
  SYNTH_PATCH_BYTES,
  type SoundMember,
  type Synth,
  type SynthBlocks,
  checkProgram,
  junoInitPatch,
  jupiter8InitPatch,
  packJunoPatch,
  packJupiter8Patch,
  soundFields,
} from "../src/index.ts";
import { Harness, SERVER_LIMITS, soundBytes } from "../src/testing/index.ts";
import { screen } from "./recorder.ts";

const base64 = (bytes: Uint8Array | readonly number[]): string => Buffer.from(bytes).toString("base64");
/** Two blocks of two slots: a program change and a note, then the note's end and an empty slot. */
const SLOTS = Uint8Array.from([0, 0xc0, 3, 0, 10, 0x90, 60, 100, 199, 0x80, 60, 0, 0, 0, 0, 0]);
/** A patch of each synthesizer that its instrument reads: zeros but the Juno's range, 8'. */
const plain = (synth: Synth): Uint8Array => {
  const patch = new Uint8Array(SYNTH_PATCH_BYTES[synth]);
  if (synth === "juno") {
    patch[16] = 0b010;
  }
  return patch;
};

/** A synthesizer's live blocks member. */
function blocksMember(synth: Synth, blocks: SynthBlocks): SoundMember {
  const members: Record<Synth, SoundMember> = {
    juno: { junoBlocks: blocks },
    minimoog: { minimoogBlocks: blocks },
    prophet5: { prophet5Blocks: blocks },
    jupiter8: { jupiter8Blocks: blocks },
    cs80: { cs80Blocks: blocks },
  };
  return members[synth];
}

/** A synthesizer's bank member, of handle 1 and generation 0. */
function bankMember(synth: Synth, patches: Uint8Array): SoundMember {
  const bank = { handle: 1, generation: 0, patches };
  const members: Record<Synth, SoundMember> = {
    juno: { junoBank: bank },
    minimoog: { minimoogBank: bank },
    prophet5: { prophet5Bank: bank },
    jupiter8: { jupiter8Bank: bank },
    cs80: { cs80Bank: bank },
  };
  return members[synth];
}

test("each synthesizer's members are written as the server reads them, with its model or keyboard as said or by default", () => {
  const sound = { handle: 7, generation: 1, slots: 2, bank: 200, blocks: SLOTS };
  const wired = { handle: 7, generation: 1, slots: 2, bank: 200, blocks: base64(SLOTS) };
  assert.deepEqual(soundFields({ juno: sound }), { kind: "juno", ...wired, model: "106" });
  assert.deepEqual(soundFields({ juno: { ...sound, model: "60" } }), { kind: "juno", ...wired, model: "60" });
  assert.deepEqual(soundFields({ minimoog: sound }), { kind: "minimoog", ...wired });
  assert.deepEqual(soundFields({ prophet5: sound }), { kind: "prophet5", ...wired, model: "revision_3" });
  assert.deepEqual(soundFields({ prophet5: { ...sound, model: "revisions_1_and_2" } }), { kind: "prophet5", ...wired, model: "revisions_1_and_2" });
  assert.deepEqual(soundFields({ jupiter8: sound }), { kind: "jupiter8", ...wired, key_mode: "whole", split_key: 60 });
  assert.deepEqual(soundFields({ jupiter8: { ...sound, keyMode: "split", splitKey: 48 } }), { kind: "jupiter8", ...wired, key_mode: "split", split_key: 48 });
  assert.deepEqual(soundFields({ cs80: sound }), { kind: "cs80", ...wired });
  const live = { handle: 8, generation: 2, slots: 16, bank: 0 };
  assert.deepEqual(soundFields({ junoLive: { ...live, model: "60" } }), { kind: "juno_live", ...live, model: "60" });
  assert.deepEqual(soundFields({ minimoogLive: live }), { kind: "minimoog_live", ...live });
  assert.deepEqual(soundFields({ prophet5Live: live }), { kind: "prophet5_live", ...live, model: "revision_3" });
  assert.deepEqual(soundFields({ jupiter8Live: { ...live, keyMode: "dual" } }), { kind: "jupiter8_live", ...live, key_mode: "dual", split_key: 60 });
  assert.deepEqual(soundFields({ cs80Live: live }), { kind: "cs80_live", ...live });
  for (const synth of SYNTHS) {
    const blocks = { handle: 8, generation: 2, slots: 2, first: 65_535, blocks: SLOTS };
    assert.deepEqual(soundFields(blocksMember(synth, blocks)), { kind: `${synth}_blocks`, ...blocks, blocks: base64(SLOTS) }, synth);
    const patches = Uint8Array.from([...plain(synth), ...plain(synth)]);
    assert.deepEqual(soundFields(bankMember(synth, patches)), { kind: `${synth}_bank`, handle: 1, generation: 0, patches: base64(patches) }, synth);
  }
});

test("a synthesizer member out of the server's bounds is a RangeError where it is made", () => {
  const sound = { handle: 1, generation: 0, slots: 1, bank: 0, blocks: SLOTS.subarray(0, 4) };
  const cases: readonly (readonly [SoundMember, string])[] = [
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- values the types refuse, to see the checks refuse them at run time
    [{ juno: { ...sound, model: "106A" as "106" } }, "sound: model is one of 106, 60, not 106A"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
    [{ prophet5Live: { ...sound, model: "revision_2" as "revision_3" } }, "sound: model is one of revision_3, revisions_1_and_2, not revision_2"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
    [{ jupiter8: { ...sound, keyMode: "layer" as "dual" } }, "sound: key_mode is one of whole, dual, split, not layer"],
    [{ jupiter8Live: { ...sound, splitKey: 128 } }, "sound: split_key is 0 to 127, not 128"],
    [{ cs80: { ...sound, slots: 17 } }, "sound: slots is 1 to 16, not 17"],
    [{ minimoog: { ...sound, blocks: new Uint8Array(4 * 6_001) } }, "sound: blocks are at most 6000 blocks, not 6001"],
    [{ junoBlocks: { ...sound, first: 0, blocks: new Uint8Array(4 * 101) } }, "sound: blocks are at most 100 blocks, not 101"],
    [
      { minimoog: { ...sound, blocks: Uint8Array.from([0, 0xa0, 60, 1]) } },
      "sound: blocks: block 0 slot 0: its status is a note off, note on, control change, program change or pitch bend",
    ],
    [
      { cs80Blocks: { ...sound, first: 0, blocks: Uint8Array.from([0, 0xd0, 1, 1]) } },
      "sound: blocks: block 0 slot 0: a channel pressure's second data byte is 0",
    ],
    [
      { jupiter8: { ...sound, blocks: Uint8Array.from([0, 0xc5, 1, 0]) } },
      "sound: blocks: block 0 slot 0: a Jupiter-8's program change is on MIDI channel 1, the upper patch, or 2, the lower",
    ],
    [bankMember("juno", new Uint8Array(17)), "sound: patches are whole patches of 18 bytes, not 17 bytes"],
    [bankMember("cs80", new Uint8Array(85 * 33)), "sound: patches are at most 32 patches, not 33"],
    [
      bankMember("juno", new Uint8Array(18)),
      "sound: patches: patch 0 byte 16 (range, waveforms and chorus) is 0x00: at most 0x7F, with exactly one of the range bits 0x01 (16'), 0x02 (8') and 0x04 (4')",
    ],
    [
      bankMember("jupiter8", Uint8Array.from([...packJupiter8Patch(jupiter8InitPatch), ...packJupiter8Patch(jupiter8InitPatch)]).fill(9, 43 + 38, 43 + 39)),
      "sound: patches: patch 1 byte 38 (ASSIGN MODE) is 9: at most 3",
    ],
  ];
  for (const [member, message] of cases) {
    assert.throws(() => soundFields(member), { name: "RangeError", message });
  }
  assert.equal(soundFields({ junoBank: { handle: 1, generation: 0, patches: new Uint8Array(32 * 18).fill(0b010) } }).kind, "juno_bank", "32 patches");
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
  const extra = {
    juno: { model: "106" },
    minimoog: {},
    prophet5: { model: "revisions_1_and_2" },
    jupiter8: { key_mode: "split", split_key: 0 },
    cs80: {},
  } as const;
  for (const synth of SYNTHS) {
    assert.equal(refusal(wire(synth, { ...blocks, ...extra[synth] })), null, synth);
    assert.equal(refusal(wire(`${synth}_live`, { slots: 16, bank: 255, ...extra[synth] })), null, synth);
    assert.equal(refusal(wire(`${synth}_blocks`, { slots: 2, first: 65_535, blocks: base64(SLOTS) })), null, synth);
    assert.equal(refusal(wire(`${synth}_bank`, { patches: base64(plain(synth)) })), null, synth);
    assert.deepEqual(refusal(wire(`${synth}_bank`, { patches: base64(new Uint8Array(SYNTH_PATCH_BYTES[synth] + 1)) })), ["patches", "wrong_length"], synth);
  }
  const refused: readonly (readonly [unknown, string, string])[] = [
    [wire("juno", { ...blocks, model: "61" }), "model", "not_listed"],
    [wire("jupiter8", { ...blocks, key_mode: "split", split_key: 128 }), "split_key", "out_of_range"],
    [wire("jupiter8_live", { slots: 1, bank: 0, key_mode: "layer", split_key: 1 }), "key_mode", "not_listed"],
    [wire("cs80", { ...blocks, slots: 17 }), "slots", "out_of_range"],
    [wire("cs80_blocks", { slots: 1, first: 0, blocks: base64(new Uint8Array(4 * 101)) }), "blocks", "too_long"],
    [wire("prophet5_blocks", { slots: 1, first: 0, blocks: base64([0, 0xa0, 1, 1]) }), "blocks", "outside_profile"],
    [wire("jupiter8_bank", { patches: base64(new Uint8Array(43).fill(255)) }), "patches", "outside_profile"],
    [wire("minimoog_bank", { patches: base64(new Uint8Array(36 * 33)) }), "patches", "too_long"],
  ];
  for (const [message, path, rule] of refused) {
    assert.deepEqual(refusal(message), [path, rule], JSON.stringify(message).slice(0, 200));
  }
});

test("a channel's tests read a synthesizer's sound and its bank from what was sent", () => {
  const patch = packJunoPatch({ ...junoInitPatch, vcfResonance: 90 });
  const player: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, screen("index"));
    },
    joined: (session, context): void => {
      context.sound({ session }, { junoBank: { handle: 200, generation: 1, patches: patch } });
      context.sound({ session }, { juno: { handle: 7, generation: 1, slots: 2, bank: 200, blocks: SLOTS, model: "60" } });
      context.sound({ session }, { play: { channel: 0, handle: 7, generation: 1 } });
    },
  };
  const harness = new Harness([player]);
  harness.join(1, 0x100);
  const sounds = harness.sounds(1);
  assert.deepEqual(
    sounds.map((sound) => sound["kind"]),
    ["juno_bank", "juno", "play"],
  );
  const [bank, juno] = sounds;
  assert.ok(bank !== undefined && juno !== undefined);
  assert.deepEqual(soundBytes(bank), patch);
  assert.deepEqual(soundBytes(juno), SLOTS);
  assert.deepEqual([juno["bank"], juno["model"]], [200, "60"]);
});

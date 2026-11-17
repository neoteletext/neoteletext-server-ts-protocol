// The instrument members of `context.sound` (REQ-6414; the server's
// REQ-6413): each written as the server reads it, each fault the server
// would refuse refused here as a RangeError that names it, the wire's own
// check giving the server's path and rule, and a channel's tests reading
// what was sent.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, type SoundMember, checkProgram, soundFields } from "../src/index.ts";
import { Harness, SERVER_LIMITS, soundBytes } from "../src/testing/index.ts";
import { screen } from "./recorder.ts";

const base64 = (bytes: Uint8Array | readonly number[]): string => Buffer.from(bytes).toString("base64");
/** One image of the synth6581's registers, and two blocks of two synth7 slots: notes, and an empty slot. */
const IMAGE = Uint8Array.from({ length: 25 }, (_, index) => 255 - index);
const SLOTS = Uint8Array.from([0, 0x90, 60, 100, 199, 0x80, 60, 0, 0, 0xc0, 31, 0, 0, 0, 0, 0]);
const PATCH = new Uint8Array(128).fill(127);

test("the synth6581 members are written as the server reads them, each name its own kind with no chip, a block of one image on PAL's clock unless said", () => {
  assert.deepEqual(soundFields({ synth6581: { handle: 5, generation: 2, images: IMAGE } }), {
    kind: "synth6581",
    handle: 5,
    generation: 2,
    images_per_block: 1,
    clock: "pal",
    images: base64(IMAGE),
  });
  const four = new Uint8Array(200).fill(9);
  assert.deepEqual(soundFields({ synth8580: { handle: 255, generation: 65_535, imagesPerBlock: 4, clock: "ntsc", images: four } }), {
    kind: "synth8580",
    handle: 255,
    generation: 65_535,
    images_per_block: 4,
    clock: "ntsc",
    images: base64(four),
  });
  assert.deepEqual(soundFields({ synth6581Live: { handle: 6, generation: 0, imagesPerBlock: 2, clock: "ntsc" } }), {
    kind: "synth6581_live",
    handle: 6,
    generation: 0,
    images_per_block: 2,
    clock: "ntsc",
  });
  assert.deepEqual(soundFields({ synth8580Live: { handle: 6, generation: 0 } }), {
    kind: "synth8580_live",
    handle: 6,
    generation: 0,
    images_per_block: 1,
    clock: "pal",
  });
  assert.equal(soundFields({ synth8580Blocks: { handle: 6, generation: 0, first: 0, images: IMAGE } }).kind, "synth8580_blocks");
  assert.deepEqual(soundFields({ synth6581Blocks: { handle: 6, generation: 0, first: 65_535, images: IMAGE } }), {
    kind: "synth6581_blocks",
    handle: 6,
    generation: 0,
    images_per_block: 1,
    first: 65_535,
    images: base64(IMAGE),
  });
});

test("the synth7 members and a bank are written as the server reads them", () => {
  assert.deepEqual(soundFields({ synth7: { handle: 7, generation: 1, slots: 2, bank: 200, blocks: SLOTS } }), {
    kind: "synth7",
    handle: 7,
    generation: 1,
    slots: 2,
    bank: 200,
    blocks: base64(SLOTS),
  });
  assert.deepEqual(soundFields({ synth7Live: { handle: 8, generation: 1, slots: 16, bank: 0 } }), {
    kind: "synth7_live",
    handle: 8,
    generation: 1,
    slots: 16,
    bank: 0,
  });
  assert.deepEqual(soundFields({ synth7Blocks: { handle: 8, generation: 1, slots: 4, first: 9, blocks: SLOTS } }), {
    kind: "synth7_blocks",
    handle: 8,
    generation: 1,
    slots: 4,
    first: 9,
    blocks: base64(SLOTS),
  });
  assert.deepEqual(soundFields({ synth7Bank: { handle: 200, generation: 3, patches: PATCH } }), {
    kind: "synth7_bank",
    handle: 200,
    generation: 3,
    patches: base64(PATCH),
  });
});

/** `SLOTS` with its second block's second slot `slot`. */
function withSlot(slot: readonly number[]): Uint8Array {
  const blocks = SLOTS.slice();
  blocks.set(slot, 12);
  return blocks;
}

test("a synth7 slot the codec does not take is refused, naming its block and slot, as the server does", () => {
  const bad = [
    [200, 0x90, 60, 100],
    [1, 0, 0, 0],
    [0, 0x70, 0, 0],
    [0, 0xa0, 60, 1],
    [0, 0xd0, 1, 0],
    [0, 0xf0, 0, 0],
    [0, 0x90, 128, 0],
    [0, 0x80, 0, 128],
    [0, 0xb0, 2, 0],
    [0, 0xb0, 7, 128],
    [0, 0xc0, 32, 0],
    [0, 0xc0, 0, 1],
    [0, 0xe0, 128, 0],
    [0, 0xe0, 0, 128],
  ];
  for (const slot of bad) {
    const blocks = withSlot(slot);
    assert.throws(() => soundFields({ synth7: { handle: 1, generation: 0, slots: 2, bank: 0, blocks } }), /sound: blocks: block 1 slot 1: /u, slot.join(" "));
    assert.throws(() => soundFields({ synth7Blocks: { handle: 1, generation: 0, slots: 2, first: 0, blocks } }), /block 1 slot 1: /u, slot.join(" "));
    const line = { type: "sound", connections: [1], kind: "synth7", handle: 1, generation: 0, slots: 2, bank: 0, blocks: base64(blocks) };
    const fault = checkProgram(line, SERVER_LIMITS);
    assert.deepEqual([fault?.path, fault?.rule], ["blocks", "outside_profile"], slot.join(" "));
    assert.match(fault?.detail ?? "", /^block 1 slot 1: /u);
  }
  for (const good of [
    [0, 0xb0, 1, 0],
    [0, 0xbf, 120, 127],
    [0, 0xb0, 121, 0],
    [0, 0xb0, 123, 0],
    [199, 0xef, 127, 127],
  ]) {
    assert.equal(soundFields({ synth7: { handle: 1, generation: 0, slots: 2, bank: 0, blocks: withSlot(good) } }).kind, "synth7", good.join(" "));
  }
});

test("an instrument member out of the server's bounds is a RangeError where it is made", () => {
  const synth6581 = { handle: 1, generation: 0, images: IMAGE };
  const synth7 = { handle: 1, generation: 0, slots: 1, bank: 0, blocks: SLOTS };
  const cases: readonly (readonly [SoundMember, RegExp])[] = [
    [{ synth6581: { ...synth6581, handle: 256 } }, /handle is 0 to 255/u],
    [{ synth6581: { ...synth6581, generation: 65_536 } }, /generation is 0 to 65535/u],
    [{ synth6581: { ...synth6581, images: new Uint8Array(0) } }, /whole blocks of 25 bytes, not 0 bytes/u],
    [{ synth6581: { ...synth6581, images: new Uint8Array(26) } }, /whole blocks of 25 bytes, not 26 bytes/u],
    [{ synth6581: { ...synth6581, imagesPerBlock: 2 } }, /whole blocks of 50 bytes, not 25 bytes/u],
    [{ synth6581: { ...synth6581, images: new Uint8Array(25 * 6_001) } }, /at most 6000 blocks, not 6001/u],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- values the types refuse, to see the checks refuse them at run time
    [{ synth6581: { ...synth6581, imagesPerBlock: 3 as 1 } }, /images_per_block is 1, 2 or 4, not 3/u],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
    [{ synth6581Live: { handle: 1, generation: 0, clock: "secam" as "pal" } }, /clock is one of pal, ntsc, not secam/u],
    [{ synth6581Blocks: { ...synth6581, first: 65_536 } }, /first is 0 to 65535/u],
    [{ synth6581Blocks: { ...synth6581, first: 0, images: new Uint8Array(25 * 101) } }, /at most 100 blocks, not 101/u],
    [{ synth7: { ...synth7, slots: 0 } }, /slots is 1 to 16, not 0/u],
    [{ synth7: { ...synth7, slots: 17 } }, /slots is 1 to 16, not 17/u],
    [{ synth7: { ...synth7, bank: 256 } }, /bank is 0 to 255/u],
    [{ synth7: { ...synth7, slots: 3 } }, /whole blocks of 12 bytes, not 16 bytes/u],
    [{ synth7: { ...synth7, blocks: new Uint8Array(0) } }, /whole blocks of 4 bytes, not 0 bytes/u],
    [{ synth7: { ...synth7, blocks: new Uint8Array(4 * 6_001) } }, /at most 6000 blocks/u],
    [{ synth7Live: { handle: 1, generation: 0, slots: 1.5, bank: 0 } }, /slots is 1 to 16/u],
    [{ synth7Blocks: { ...synth7, first: -1 } }, /first is 0 to 65535/u],
    [{ synth7Blocks: { ...synth7, first: 0, blocks: new Uint8Array(4 * 101) } }, /at most 100 blocks/u],
    [{ synth7Bank: { handle: 1, generation: 0, patches: new Uint8Array(0) } }, /whole patches of 128 bytes, not 0 bytes/u],
    [{ synth7Bank: { handle: 1, generation: 0, patches: new Uint8Array(127) } }, /whole patches of 128 bytes/u],
    [{ synth7Bank: { handle: 1, generation: 0, patches: new Uint8Array(128 * 33) } }, /at most 32 patches, not 33/u],
    [{ synth7Bank: { handle: 1, generation: 0, patches: new Uint8Array(256).fill(128, 133, 134) } }, /patch 1 byte 5 is 128: at most 127/u],
  ];
  for (const [member, why] of cases) {
    assert.throws(
      () => soundFields(member),
      (error) => error instanceof RangeError && why.test(error.message),
      String(why),
    );
  }
  assert.equal(soundFields({ synth6581: { ...synth6581, imagesPerBlock: 4, images: new Uint8Array(100 * 6_000) } }).kind, "synth6581", "two minutes are taken");
  assert.equal(soundFields({ synth7Bank: { handle: 1, generation: 0, patches: new Uint8Array(128 * 32) } }).kind, "synth7_bank");
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

test("a line of an instrument's sound is held to the server's schema and rules, with its paths and rules", () => {
  const synth6581 = { images_per_block: 2, clock: "pal", images: base64(new Uint8Array(50)) };
  const live = { images_per_block: 1, first: 0 };
  const synth7 = { slots: 1, bank: 0, blocks: base64(SLOTS) };
  assert.equal(refusal(wire("synth6581", synth6581)), null);
  assert.equal(refusal(wire("synth6581_live", { images_per_block: 4, clock: "ntsc" })), null);
  assert.equal(refusal(wire("synth8580", synth6581)), null);
  assert.equal(refusal(wire("synth8580_live", { images_per_block: 4, clock: "ntsc" })), null);
  assert.equal(refusal(wire("synth8580_blocks", { ...live, images: base64(new Uint8Array(25 * 100)) })), null);
  assert.equal(refusal(wire("synth6581_blocks", { ...live, images: base64(new Uint8Array(25 * 100)) })), null);
  assert.equal(refusal(wire("synth7", synth7)), null);
  assert.equal(refusal(wire("synth7_live", { slots: 16, bank: 255 })), null);
  assert.equal(refusal(wire("synth7_blocks", { slots: 4, first: 65_535, blocks: base64(SLOTS) })), null);
  assert.equal(refusal(wire("synth7_bank", { patches: base64(new Uint8Array(128 * 32)) })), null);
  const refused: readonly (readonly [unknown, string, string])[] = [
    [wire("synth6581", { ...synth6581, images: base64(new Uint8Array(25)) }), "images", "wrong_length"],
    [wire("synth6581", { ...synth6581, images: "" }), "images", "wrong_length"],
    [wire("synth6581", { ...synth6581, images: `${base64(new Uint8Array(50))} ` }), "images", "not_base64"],
    [wire("synth6581", { ...synth6581, images_per_block: 1, images: base64(new Uint8Array(25 * 6_001)) }), "images", "too_long"],
    [wire("synth6581", { ...synth6581, images_per_block: 3 }), "images_per_block", "not_listed"],
    [wire("synth6581", { ...synth6581, clock: "PAL" }), "clock", "not_listed"],
    [wire("synth6581_blocks", { ...live, images: base64(new Uint8Array(25 * 101)) }), "images", "too_long"],
    [wire("synth6581_blocks", { ...live, first: 65_536, images: base64(IMAGE) }), "first", "out_of_range"],
    [wire("synth7", { ...synth7, slots: 17 }), "slots", "out_of_range"],
    [wire("synth7", { ...synth7, slots: 0 }), "slots", "out_of_range"],
    [wire("synth7", { ...synth7, slots: 3 }), "blocks", "wrong_length"],
    [wire("synth7", { ...synth7, blocks: base64(new Uint8Array(4 * 6_001)) }), "blocks", "too_long"],
    [wire("synth7_blocks", { slots: 1, first: 0, blocks: base64(new Uint8Array(4 * 101)) }), "blocks", "too_long"],
    [wire("synth7_blocks", { slots: 1, first: 0, blocks: base64([0, 0xa0, 1, 1]) }), "blocks", "outside_profile"],
    [wire("synth7_bank", { patches: base64(new Uint8Array(127)) }), "patches", "wrong_length"],
    [wire("synth7_bank", { patches: base64(new Uint8Array(128 * 33)) }), "patches", "too_long"],
    [wire("synth7_bank", { patches: base64(new Uint8Array(128).fill(128, 5, 6)) }), "patches", "outside_profile"],
  ];
  for (const [message, path, rule] of refused) {
    assert.deepEqual(refusal(message), [path, rule], JSON.stringify(message).slice(0, 200));
  }
});

test("a channel's tests read an instrument's sound from what was sent", () => {
  const player: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, screen("index"));
    },
    joined: (session, context): void => {
      context.sound({ session }, { synth7Bank: { handle: 200, generation: 1, patches: PATCH } });
      context.sound({ session }, { synth7: { handle: 7, generation: 1, slots: 2, bank: 200, blocks: SLOTS } });
      context.sound({ session }, { synth6581: { handle: 5, generation: 1, images: IMAGE } });
      context.sound({ session }, { play: { channel: 0, handle: 7, generation: 1 } });
    },
  };
  const harness = new Harness([player]);
  harness.join(1, 0x100);
  const sounds = harness.sounds(1);
  assert.deepEqual(
    sounds.map((sound) => sound["kind"]),
    ["synth7_bank", "synth7", "synth6581", "play"],
  );
  const [bank, synth7, synth6581, play] = sounds;
  assert.ok(bank !== undefined && synth7 !== undefined && synth6581 !== undefined && play !== undefined);
  assert.deepEqual(soundBytes(bank), PATCH);
  assert.deepEqual(soundBytes(synth7), SLOTS);
  assert.deepEqual(soundBytes(synth6581), IMAGE);
  assert.equal(synth7["bank"], 200);
  assert.deepEqual([play["handle"], play["generation"]], [7, 1], "play names an instrument's sound as any other");
  assert.throws(() => soundBytes(play), TypeError, "a command carries no bytes");
});

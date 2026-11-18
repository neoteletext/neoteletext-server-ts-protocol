// One valid member of every sound kind the schema's copy gives (typescript.md
// TS-19's verification): built here by hand from the generated member types,
// so that a kind the schema adds or a field it renames fails to compile.

import type { SoundMember } from "../src/protocol.ts";

/** A handle and generation every member here has. */
const NAMED = { handle: 3, generation: 1 } as const;
/** The bank a sound of a family with banks names (MIDI-57). */
const BANK = 9;
/** A whole number of 16-bit samples: two. */
const SAMPLES = new Uint8Array([1, 0, 2, 0]);
/** One packet of a stored Opus sound's packets: a TOC byte of the profile, then padding. */
const PACKET_BYTES = 40;
const PACKETS = new Uint8Array(PACKET_BYTES).fill(15 << 3);
/** Samples in a 20 ms frame at 48 kHz (E.123). */
const FRAME_SAMPLES = 960;
/** A note on and a note off, on channel 1, as every MIDI family's events take them (SRV-10). */
const NOTES = [
  { event: "note_on", time_us: 0, channel: 1, key: 60, velocity: 100 },
  { event: "note_off", time_us: 100_000, channel: 1, key: 60, velocity: 64 },
] as const;
const LENGTH = { tail_us: 100_000 } as const;

/** The four kinds of a family of the MIDI synthesizers: a stored sound, a live one, its events and a bank, each of `bank` bytes. */
type MidiFamily = "synth7" | "synth106" | "synth60" | "synthd" | "synth53" | "synth52" | "synth51" | "synth80";

function family(name: MidiFamily, bank: Uint8Array): SoundMember[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a kind made of a template is no literal to the compiler: sound-calls.test.ts sends each, held to the schema
  return [
    { kind: name, ...NAMED, banks: [BANK], lift_banks: [], length: LENGTH, music: { form: "events", events: NOTES } },
    { kind: `${name}_live`, ...NAMED, banks: [BANK] },
    { kind: `${name}_events`, ...NAMED, until_us: 200_000, events: NOTES },
    { kind: `${name}_bank`, ...NAMED, bank: { form: "bytes", bytes: bank } },
  ] as SoundMember[];
}

/** Every kind of `sound`, one member each, in the schema's order. */
export const MEMBERS: readonly SoundMember[] = [
  { kind: "opus", ...NAMED, packet_bytes: PACKET_BYTES, samples: FRAME_SAMPLES, packets: PACKETS },
  { kind: "opus_live", ...NAMED, packet_bytes: PACKET_BYTES },
  { kind: "opus_packets", ...NAMED, packet_bytes: PACKET_BYTES, first: 0, packets: PACKETS },
  { kind: "object", ...NAMED, rate: 8_000, pcm: SAMPLES },
  { kind: "live", ...NAMED, rate: 8_000 },
  { kind: "blocks", ...NAMED, rate: 8_000, first: 0, pcm: SAMPLES },
  ...(["synth6581", "synth8580"] as const).flatMap((name): SoundMember[] => [
    {
      kind: name,
      ...NAMED,
      clock: "pal",
      length: LENGTH,
      music: { form: "events", events: [{ event: "register_update", time_us: 0, registers: { voice1_control: 0x41 } }] },
    },
    { kind: `${name}_live`, ...NAMED, clock: "ntsc" },
    { kind: `${name}_events`, ...NAMED, until_us: 20_001, events: [{ event: "register_update", time_us: 20_000, registers: { filter_mode_volume: 0x0f } }] },
  ]),
  ...family("synth7", new Uint8Array([0xf0, 0xf7])),
  ...family("synth106", new Uint8Array([0xf0, 0xf7])),
  ...family("synth60", new Uint8Array([0xf0, 0xf7])),
  ...family("synthd", new Uint8Array([0x00])),
  ...family("synth53", new Uint8Array([0xf0, 0xf7])),
  ...family("synth52", new Uint8Array([0xf0, 0xf7])),
  ...family("synth51", new Uint8Array([0xf0, 0xf7])),
  { kind: "synth8", ...NAMED, key_mode: "split", split_key: 60, banks: [BANK], lift_banks: [], length: LENGTH, music: { form: "events", events: NOTES } },
  { kind: "synth8_live", ...NAMED, key_mode: "whole", split_key: 0, banks: [BANK] },
  { kind: "synth8_events", ...NAMED, until_us: 200_000, events: NOTES },
  { kind: "synth8_bank", ...NAMED, bank: { form: "bytes", bytes: new Uint8Array([0xf0, 0xf7]) } },
  ...family("synth80", new Uint8Array([0x00])),
  { kind: "play", channel: 0, ...NAMED, gain: 100, fade_ms: 0, loop: false, after: false, duck: 0 },
  { kind: "stop", channel: 0, fade_ms: 0 },
  { kind: "gain", channel: 0, gain: 50, fade_ms: 10 },
];

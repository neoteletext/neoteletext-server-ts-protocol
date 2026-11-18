// typescript.md 4.1: a stored tune for synth6581, sent once to each
// connection that opens page 300 and played on audio channel 0 (TS-43).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Context } from "../../src/index.ts";
import type { SoundPlayMember, SoundSynth6581Member, Synth6581Event } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { expected, serving, soundLines } from "./shared.ts";

const TUNE_PAGE = 0x300;
const TUNE_HANDLE = 4;
/** One frame of a 50 Hz tune, in microseconds (MIDI-17's unit). */
const FRAME_US = 20_000;
/** C, E, G, C as frequency register values, low byte and high byte (4,291; 5,407; 6,430; 8,583). */
const NOTES = [
  [0xc3, 0x10],
  [0x1f, 0x15],
  [0x1e, 0x19],
  [0x87, 0x21],
] as const;
/** Voice 1's control register: pulse waveform (bit 6), gate (bit 0) open or closed. */
const PULSE_GATE_ON = 0x41;
const PULSE_GATE_OFF = 0x40;
/** Each note's frames, and the frames its gate is open (12 and 9). */
const NOTE_FRAMES = 12;
const GATE_FRAMES = 9;

function tune(): SoundSynth6581Member {
  const events: Synth6581Event[] = [
    {
      event: "register_update",
      time_us: 0,
      registers: {
        voice1_frequency_low: NOTES[0][0],
        voice1_frequency_high: NOTES[0][1],
        voice1_pulse_width_low: 0x00,
        voice1_pulse_width_high: 0x08,
        voice1_attack_decay: 0x09,
        voice1_sustain_release: 0xa0,
        voice2_frequency_low: 0,
        voice2_frequency_high: 0,
        voice2_pulse_width_low: 0,
        voice2_pulse_width_high: 0,
        voice2_attack_decay: 0,
        voice2_sustain_release: 0,
        voice3_frequency_low: 0,
        voice3_frequency_high: 0,
        voice3_pulse_width_low: 0,
        voice3_pulse_width_high: 0,
        voice3_attack_decay: 0,
        voice3_sustain_release: 0,
        filter_cutoff_low: 0x00,
        filter_cutoff_high: 0x80,
        filter_resonance_routing: 0x01,
        filter_mode_volume: 0x1f,
        voice1_control: PULSE_GATE_OFF,
        voice2_control: 0,
        voice3_control: 0,
      },
    },
  ];
  NOTES.forEach(([low, high], index) => {
    const start = index * NOTE_FRAMES * FRAME_US;
    events.push(
      { event: "register_update", time_us: start, registers: { voice1_frequency_low: low, voice1_frequency_high: high, voice1_control: PULSE_GATE_ON } },
      { event: "register_update", time_us: start + GATE_FRAMES * FRAME_US, registers: { voice1_control: PULSE_GATE_OFF } },
    );
  });
  return { kind: "synth6581", handle: TUNE_HANDLE, generation: 0, clock: "pal", length: { tail_us: 500_000 }, music: { form: "events", events } };
}

const tunePage = serving([TUNE_PAGE], {
  opened(connection: number, page: number, context: Context): void {
    if (page !== TUNE_PAGE) {
      return;
    }
    const play: SoundPlayMember = {
      kind: "play",
      channel: 0,
      handle: TUNE_HANDLE,
      generation: 0,
      gain: 80,
      fade_ms: 0,
      loop: false,
      after: false,
      duck: 0,
      page: "300",
    };
    context.sound({ connection }, tune());
    context.sound({ connection }, play);
  },
});

test("TS-43, 4.1: connection 1 opening page 300 is sent the stored tune and its play, the fixture's lines", () => {
  const harness = new Harness([tunePage]);
  harness.join(1, TUNE_PAGE);
  assert.deepEqual(soundLines(harness), expected("stored-tune"));
  assert.deepEqual(harness.errors, []);
});

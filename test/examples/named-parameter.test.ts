// typescript.md 4.7, synth8: in a live synth8 sound the viewer's mouse wheel
// moves the filter's cutoff by name (MIDI-18; SRV-22) (TS-43).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Context, Input } from "../../src/index.ts";
import type { SoundSynth8EventsMember } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { expected, serving, soundLines } from "./shared.ts";

const LIVE8 = 50;
/** The cutoff's lowest and highest values, the program's own choice of how far the wheel moves it. */
const LOWEST_CUTOFF = 0;
const HIGHEST_CUTOFF = 127;
const MIDDLE_CUTOFF = 64;
const MICROSECONDS_A_MILLISECOND = 1_000;
/** `until_us` is one microsecond past the event, so that the event is before it (SRV-74). */
const PAST_NOW_US = 1;
const WHEEL_PAGE = 0x340;
/** When the wheel turns (section 4.0), and by how much: up, so the cutoff rises. */
const TURN_AT_MS = 500;
const TURN_DY = -10;

const cutoffs = new Map<number, number>();
/** Each connection's live sound's start on the program's clock, set where the sound is announced. */
const startsMs = new Map<number, number>();

function wheel(connection: number, input: Input, context: Context): boolean {
  const startMs = startsMs.get(connection);
  if (input.kind !== "wheel" || startMs === undefined) {
    return false;
  }
  const cutoff = Math.min(HIGHEST_CUTOFF, Math.max(LOWEST_CUTOFF, (cutoffs.get(connection) ?? MIDDLE_CUTOFF) - input.dy));
  cutoffs.set(connection, cutoff);
  const time_us = (context.now() - startMs) * MICROSECONDS_A_MILLISECOND;
  const events: SoundSynth8EventsMember = {
    kind: "synth8_events",
    handle: LIVE8,
    generation: 0,
    until_us: time_us + PAST_NOW_US,
    events: [{ event: "parameter", time_us, channel: 1, set: { vcf_cutoff: cutoff } }],
  };
  context.sound({ connection }, events);
  return true;
}

test("TS-43, 4.7: the wheel turned by -10 at 500 ms sets the cutoff by name, the fixture's line", () => {
  const harness = new Harness([
    serving([WHEEL_PAGE], {
      opened(connection: number): void {
        // The live sound's start, its announcement left out of the example (section 4.0).
        startsMs.set(connection, 0);
      },
      input: (connection, _page, input, context): boolean => wheel(connection, input, context),
    }),
  ]);
  harness.join(1, WHEEL_PAGE);
  harness.runUntil(TURN_AT_MS);
  harness.wheel(1, TURN_DY, 0, 1);
  assert.deepEqual(soundLines(harness), expected("named-parameter"));
});

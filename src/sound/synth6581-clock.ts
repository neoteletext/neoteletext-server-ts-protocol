// The synth6581 chip's clock, and the frequency register's value for a pitch.
// The chip's oscillator adds its 16-bit frequency register to a 24-bit
// accumulator once every cycle of its clock, so a register value n sounds
// at n × clock / 2^24 hertz (MOS 6581 Sound Interface Device data sheet,
// "Freq Lo/Freq Hi (Registers 00, 01)"), and the same value is a different
// pitch on a PAL machine and an NTSC one.

import type { Synth6581Clock } from "./instrument-members.ts";

/** The clock of a PAL machine's synth6581, in hertz. */
export const SYNTH6581_PAL_CLOCK_HZ = 985_248;

/** The clock of an NTSC machine's synth6581, in hertz. */
export const SYNTH6581_NTSC_CLOCK_HZ = 1_022_727;

/** The oscillator's accumulator is 24 bits. */
const ACCUMULATOR = 2 ** 24;

/** The frequency register is 16 bits. */
export const SYNTH6581_LAST_FREQUENCY = 0xffff;

/** A clock's rate in hertz. */
export function synth6581ClockHz(clock: Synth6581Clock): number {
  return clock === "ntsc" ? SYNTH6581_NTSC_CLOCK_HZ : SYNTH6581_PAL_CLOCK_HZ;
}

/** The frequency register's value that sounds nearest `hertz` on `clock`, PAL's when absent: 0 to 65,535, a pitch above the register's range held at its top. */
export function synth6581Frequency(hertz: number, clock: Synth6581Clock = "pal"): number {
  if (!Number.isFinite(hertz) || hertz < 0) {
    throw new RangeError(`synth6581: a pitch is 0 hertz or more, not ${hertz}`);
  }
  return Math.min(SYNTH6581_LAST_FREQUENCY, Math.round((hertz * ACCUMULATOR) / synth6581ClockHz(clock)));
}

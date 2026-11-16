// The SID chip's clock, and the frequency register's value for a pitch.
// The chip's oscillator adds its 16-bit frequency register to a 24-bit
// accumulator once every cycle of its clock, so a register value n sounds
// at n × clock / 2^24 hertz (MOS 6581 Sound Interface Device data sheet,
// "Freq Lo/Freq Hi (Registers 00, 01)"), and the same value is a different
// pitch on a PAL machine and an NTSC one.

import type { SidClock } from "./instrument-members.ts";

/** The clock of a PAL Commodore 64's SID chip, in hertz. */
export const SID_PAL_CLOCK_HZ = 985_248;

/** The clock of an NTSC Commodore 64's SID chip, in hertz. */
export const SID_NTSC_CLOCK_HZ = 1_022_727;

/** The oscillator's accumulator is 24 bits. */
const ACCUMULATOR = 2 ** 24;

/** The frequency register is 16 bits. */
export const SID_LAST_FREQUENCY = 0xffff;

/** A clock's rate in hertz. */
export function sidClockHz(clock: SidClock): number {
  return clock === "ntsc" ? SID_NTSC_CLOCK_HZ : SID_PAL_CLOCK_HZ;
}

/** The frequency register's value that sounds nearest `hertz` on `clock`, PAL's when absent: 0 to 65,535, a pitch above the register's range held at its top. */
export function sidFrequency(hertz: number, clock: SidClock = "pal"): number {
  if (!Number.isFinite(hertz) || hertz < 0) {
    throw new RangeError(`sid: a pitch is 0 hertz or more, not ${hertz}`);
  }
  return Math.min(SID_LAST_FREQUENCY, Math.round((hertz * ACCUMULATOR) / sidClockHz(clock)));
}

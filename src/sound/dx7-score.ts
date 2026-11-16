// A DX7 sound's blocks built from timed events (REQ-6414 item 2): a
// program says when each note, program change and controller happens, in
// milliseconds from the sound's start, and the score places each in its
// 20 ms block with its time in tenths of a millisecond, in the fewest
// slots a block that hold the busiest block.

import { Controller, DX7_PARTS, type Dx7Slot, Midi, dx7SlotFault } from "./dx7-slot.ts";
import { DX7_BLOCK_TIMES, DX7_MOST_PATCHES, DX7_MOST_SLOTS, DX7_SLOT_BYTES, DX7_TIMES_A_MS, INSTRUMENT_BLOCK_MS, SEVEN_BITS } from "./instrument-profile.ts";
import { LAST_BLOCK } from "./profile.ts";

/** A MIDI message at a time: milliseconds from the sound's start, a status byte with its part in its low four bits, and two data bytes. */
export interface Dx7Event {
  readonly ms: number;
  readonly status: number;
  readonly data1: number;
  readonly data2: number;
}

/** A score as a sound's blocks. */
export interface Dx7ScoreBlocks {
  /** The slots of each block: the events of the busiest block, at least 1. */
  readonly slots: number;
  /** The blocks back to back, `slots` slots of 4 bytes each: what a `dx7` or `dx7Blocks` member carries. */
  readonly blocks: Uint8Array;
  /** How long the blocks play for, in milliseconds. */
  readonly lengthMs: number;
}

/** A pitch bend is 14 bits, 8,192 the centre: its low 7 bits are the first data byte. */
const LAST_BEND = 0x3fff;
const BEND_LOW_BITS = 7;
/** A sustain pedal is down at 64 and above (MIDI 1.0, controller 64); the score writes the two ends. */
const PEDAL_DOWN = 127;
/** The blocks a live sound numbers before its numbers come round again: the most a score holds, about 21 minutes. */
const MOST_SCORE_BLOCKS = LAST_BLOCK + 1;

/** An event placed: its time in tenths of a millisecond from the start, and its place among the events added, which orders events at one time. */
interface Placed {
  readonly tenths: number;
  readonly order: number;
  readonly slot: Dx7Slot;
}

function wholeIn(name: string, value: number, most: number): number {
  if (!Number.isInteger(value) || value < 0 || value > most) {
    throw new RangeError(`dx7: ${name} is 0 to ${most}, not ${value}`);
  }
  return value;
}

/** Timed events for a DX7, gathered in any order. A part is a MIDI channel, 0 to 15; each plays the patch its last program change chose from the sound's bank. Every method returns the score, so calls chain. */
export class Dx7Score {
  readonly #placed: Placed[] = [];

  constructor(events: readonly Dx7Event[] = []) {
    for (const event of events) {
      this.add(event);
    }
  }

  /** The events, in the order they were added. */
  get events(): readonly Dx7Event[] {
    return this.#placed.map(({ tenths, slot }) => ({ ms: tenths / DX7_TIMES_A_MS, status: slot.status, data1: slot.data1, data2: slot.data2 }));
  }

  /** Adds a message as its bytes: refused unless it is one the DX7 codec takes. */
  add(event: Dx7Event): this {
    if (!Number.isFinite(event.ms) || event.ms < 0) {
      throw new RangeError(`dx7: an event's time is 0 ms or more, not ${event.ms}`);
    }
    const tenths = Math.round(event.ms * DX7_TIMES_A_MS);
    if (tenths >= MOST_SCORE_BLOCKS * DX7_BLOCK_TIMES) {
      throw new RangeError(`dx7: an event at ${event.ms} ms is past the ${MOST_SCORE_BLOCKS} blocks a score holds`);
    }
    const slot = { time: tenths % DX7_BLOCK_TIMES, status: event.status, data1: event.data1, data2: event.data2 };
    const whole = [event.status, event.data1, event.data2].every((byte) => Number.isInteger(byte) && byte >= 0);
    const fault = whole && event.status >= Midi.NoteOff ? dx7SlotFault(slot) : "its bytes are a MIDI status byte and two data bytes";
    if (fault !== null) {
      throw new RangeError(`dx7: the event at ${event.ms} ms (status ${event.status}, data ${event.data1} and ${event.data2}): ${fault}`);
    }
    this.#placed.push({ tenths, order: this.#placed.length, slot });
    return this;
  }

  /** A key goes down on a part, with a velocity of 1 to 127 (0 is a note off, as MIDI has it). */
  noteOn(ms: number, part: number, key: number, velocity: number): this {
    return this.#message(ms, Midi.NoteOn, part, wholeIn("a key", key, SEVEN_BITS), wholeIn("a velocity", velocity, SEVEN_BITS));
  }

  /** A key comes up on a part. */
  noteOff(ms: number, part: number, key: number, velocity = 0): this {
    return this.#message(ms, Midi.NoteOff, part, wholeIn("a key", key, SEVEN_BITS), wholeIn("a velocity", velocity, SEVEN_BITS));
  }

  /** A key down at `ms` and up `lengthMs` later. */
  note(ms: number, part: number, key: number, velocity: number, lengthMs: number): this {
    return this.noteOn(ms, part, key, velocity).noteOff(ms + lengthMs, part, key);
  }

  /** A part changes to patch 0 to 31 of the sound's bank. */
  program(ms: number, part: number, patch: number): this {
    return this.#message(ms, Midi.ProgramChange, part, wholeIn("a patch", patch, DX7_MOST_PATCHES - 1), 0);
  }

  /** A part's pitch wheel: 0 to 16,383, 8,192 at rest. */
  pitchBend(ms: number, part: number, value: number): this {
    wholeIn("a pitch bend", value, LAST_BEND);
    return this.#message(ms, Midi.PitchBend, part, value & SEVEN_BITS, value >> BEND_LOW_BITS);
  }

  /** A part's modulation wheel, 0 to 127. */
  modWheel(ms: number, part: number, value: number): this {
    return this.#message(ms, Midi.ControlChange, part, Controller.ModWheel, wholeIn("a modulation wheel", value, SEVEN_BITS));
  }

  /** A part's volume, 0 to 127. */
  volume(ms: number, part: number, value: number): this {
    return this.#message(ms, Midi.ControlChange, part, Controller.Volume, wholeIn("a volume", value, SEVEN_BITS));
  }

  /** A part's sustain pedal, down or up. */
  sustain(ms: number, part: number, on: boolean): this {
    return this.#message(ms, Midi.ControlChange, part, Controller.Sustain, on ? PEDAL_DOWN : 0);
  }

  /** Every key of a part comes up. */
  allNotesOff(ms: number, part: number): this {
    return this.#message(ms, Midi.ControlChange, part, Controller.AllNotesOff, 0);
  }

  /** The score as blocks: each event in its block, a block's events in order of time (and, at one time, in the order they were added), with `tailMs` of empty blocks after the last event for its notes to die away in. Refused when a block would need more than 16 slots. */
  build(tailMs = 0): Dx7ScoreBlocks {
    if (!Number.isFinite(tailMs) || tailMs < 0) {
      throw new RangeError(`dx7: a tail is 0 ms or more, not ${tailMs}`);
    }
    const byBlock = new Map<number, Placed[]>();
    for (const placed of this.#placed) {
      const block = Math.floor(placed.tenths / DX7_BLOCK_TIMES);
      byBlock.set(block, [...(byBlock.get(block) ?? []), placed]);
    }
    const slots = Math.max(1, ...Array.from(byBlock.values(), (events) => events.length));
    if (slots > DX7_MOST_SLOTS) {
      const [block = 0] = Array.from(byBlock.entries()).find(([, events]) => events.length === slots) ?? [];
      throw new RangeError(`dx7: block ${block}, from ${block * INSTRUMENT_BLOCK_MS} ms, has ${slots} events: a block holds at most ${DX7_MOST_SLOTS}`);
    }
    const count = Math.min(MOST_SCORE_BLOCKS, Math.max(0, ...byBlock.keys()) + 1 + Math.ceil(tailMs / INSTRUMENT_BLOCK_MS));
    const blocks = new Uint8Array(count * slots * DX7_SLOT_BYTES);
    for (const [block, events] of byBlock) {
      const ordered = events.toSorted((one, other) => one.tenths - other.tenths || one.order - other.order);
      for (const [index, { slot }] of ordered.entries()) {
        blocks.set([slot.time, slot.status, slot.data1, slot.data2], (block * slots + index) * DX7_SLOT_BYTES);
      }
    }
    return { slots, blocks, lengthMs: count * INSTRUMENT_BLOCK_MS };
  }

  #message(ms: number, message: number, part: number, data1: number, data2: number): this {
    return this.add({ ms, status: message | wholeIn("a part", part, DX7_PARTS - 1), data1, data2 });
  }
}

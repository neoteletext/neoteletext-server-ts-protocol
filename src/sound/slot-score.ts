// The blocks of a sound of slots built from timed events (REQ-6414 item 2;
// DEC-6429): a program says when each note, program change and controller
// happens, in milliseconds from the sound's start, and the score places
// each in its 20 ms block with its time in tenths of a millisecond, in the
// fewest slots a block that hold the busiest block. The synth7's score and
// the analogue synthesizers' are this one, each holding its events to what
// its instrument's codec takes.

import { Controller, MIDI_PARTS, type Slot, Midi, instrumentSlotFault } from "./synth7-slot.ts";
import { INSTRUMENT_BLOCK_MS, MOST_PATCHES, MOST_SLOTS, SEVEN_BITS, SLOT_BLOCK_TIMES, SLOT_BYTES, SLOT_TIMES_A_MS, type Synth } from "./instrument-profile.ts";
import { LAST_BLOCK } from "./profile.ts";

/** A MIDI message at a time, for any instrument played by slots: milliseconds from the sound's start, a status byte with its part in its low four bits, and two data bytes. */
export interface SlotEvent {
  readonly ms: number;
  readonly status: number;
  readonly data1: number;
  readonly data2: number;
}

/** A score as a sound's blocks. */
export interface SlotScoreBlocks {
  /** The slots of each block: the events of the busiest block, at least 1. */
  readonly slots: number;
  /** The blocks back to back, `slots` slots of 4 bytes each: what a `synth7` or `synth7Blocks` member, or a synthesizer's, carries. */
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
  readonly slot: Slot;
}

/** Timed events for an instrument played by slots, gathered in any order. A part is a MIDI channel, 0 to 15; each plays the patch its last program change chose from the sound's bank. Every method returns the score, so calls chain. */
export class SlotScore {
  readonly instrument: Synth;
  readonly #placed: Placed[] = [];

  constructor(instrument: Synth, events: readonly SlotEvent[]) {
    this.instrument = instrument;
    for (const event of events) {
      this.add(event);
    }
  }

  /** `value`, once it is a whole number from 0 to `most`. */
  protected wholeIn(name: string, value: number, most: number): number {
    if (!Number.isInteger(value) || value < 0 || value > most) {
      throw new RangeError(`${this.instrument}: ${name} is 0 to ${most}, not ${value}`);
    }
    return value;
  }

  /** The events, in the order they were added. */
  get events(): readonly SlotEvent[] {
    return this.#placed.map(({ tenths, slot }) => ({ ms: tenths / SLOT_TIMES_A_MS, status: slot.status, data1: slot.data1, data2: slot.data2 }));
  }

  /** Adds a message as its bytes: refused unless it is one the instrument's codec takes. */
  add(event: SlotEvent): this {
    if (!Number.isFinite(event.ms) || event.ms < 0) {
      throw new RangeError(`${this.instrument}: an event's time is 0 ms or more, not ${event.ms}`);
    }
    const tenths = Math.round(event.ms * SLOT_TIMES_A_MS);
    if (tenths >= MOST_SCORE_BLOCKS * SLOT_BLOCK_TIMES) {
      throw new RangeError(`${this.instrument}: an event at ${event.ms} ms is past the ${MOST_SCORE_BLOCKS} blocks a score holds`);
    }
    const slot = { time: tenths % SLOT_BLOCK_TIMES, status: event.status, data1: event.data1, data2: event.data2 };
    const whole = [event.status, event.data1, event.data2].every((byte) => Number.isInteger(byte) && byte >= 0);
    const fault = whole && event.status >= Midi.NoteOff ? instrumentSlotFault(slot, this.instrument) : "its bytes are a MIDI status byte and two data bytes";
    if (fault !== null) {
      throw new RangeError(`${this.instrument}: the event at ${event.ms} ms (status ${event.status}, data ${event.data1} and ${event.data2}): ${fault}`);
    }
    this.#placed.push({ tenths, order: this.#placed.length, slot });
    return this;
  }

  /** A key goes down on a part, with a velocity of 1 to 127 (0 is a note off, as MIDI has it). */
  noteOn(ms: number, part: number, key: number, velocity: number): this {
    return this.message(ms, Midi.NoteOn, part, this.wholeIn("a key", key, SEVEN_BITS), this.wholeIn("a velocity", velocity, SEVEN_BITS));
  }

  /** A key comes up on a part. */
  noteOff(ms: number, part: number, key: number, velocity = 0): this {
    return this.message(ms, Midi.NoteOff, part, this.wholeIn("a key", key, SEVEN_BITS), this.wholeIn("a velocity", velocity, SEVEN_BITS));
  }

  /** A key down at `ms` and up `lengthMs` later. */
  note(ms: number, part: number, key: number, velocity: number, lengthMs: number): this {
    return this.noteOn(ms, part, key, velocity).noteOff(ms + lengthMs, part, key);
  }

  /** A part changes to patch 0 to 31 of the sound's bank. On the synth8, part 0 chooses the upper patch and part 1 the lower. */
  program(ms: number, part: number, patch: number): this {
    return this.message(ms, Midi.ProgramChange, part, this.wholeIn("a patch", patch, MOST_PATCHES - 1), 0);
  }

  /** A part's pitch wheel: 0 to 16,383, 8,192 at rest. */
  pitchBend(ms: number, part: number, value: number): this {
    this.wholeIn("a pitch bend", value, LAST_BEND);
    return this.message(ms, Midi.PitchBend, part, value & SEVEN_BITS, value >> BEND_LOW_BITS);
  }

  /** A part's modulation wheel, 0 to 127. */
  modWheel(ms: number, part: number, value: number): this {
    return this.message(ms, Midi.ControlChange, part, Controller.ModWheel, this.wholeIn("a modulation wheel", value, SEVEN_BITS));
  }

  /** A part's volume, 0 to 127. */
  volume(ms: number, part: number, value: number): this {
    return this.message(ms, Midi.ControlChange, part, Controller.Volume, this.wholeIn("a volume", value, SEVEN_BITS));
  }

  /** A part's sustain pedal, down or up. */
  sustain(ms: number, part: number, on: boolean): this {
    return this.message(ms, Midi.ControlChange, part, Controller.Sustain, on ? PEDAL_DOWN : 0);
  }

  /** Every key of a part comes up. */
  allNotesOff(ms: number, part: number): this {
    return this.message(ms, Midi.ControlChange, part, Controller.AllNotesOff, 0);
  }

  /** The score as blocks: each event in its block, a block's events in order of time (and, at one time, in the order they were added), with `tailMs` of empty blocks after the last event for its notes to die away in. Refused when a block would need more than 16 slots. */
  build(tailMs = 0): SlotScoreBlocks {
    if (!Number.isFinite(tailMs) || tailMs < 0) {
      throw new RangeError(`${this.instrument}: a tail is 0 ms or more, not ${tailMs}`);
    }
    const byBlock = new Map<number, Placed[]>();
    for (const placed of this.#placed) {
      const block = Math.floor(placed.tenths / SLOT_BLOCK_TIMES);
      byBlock.set(block, [...(byBlock.get(block) ?? []), placed]);
    }
    const slots = Math.max(1, ...Array.from(byBlock.values(), (events) => events.length));
    if (slots > MOST_SLOTS) {
      const [block = 0] = Array.from(byBlock.entries()).find(([, events]) => events.length === slots) ?? [];
      throw new RangeError(
        `${this.instrument}: block ${block}, from ${block * INSTRUMENT_BLOCK_MS} ms, has ${slots} events: a block holds at most ${MOST_SLOTS}`,
      );
    }
    const count = Math.min(MOST_SCORE_BLOCKS, Math.max(0, ...byBlock.keys()) + 1 + Math.ceil(tailMs / INSTRUMENT_BLOCK_MS));
    const blocks = new Uint8Array(count * slots * SLOT_BYTES);
    for (const [block, events] of byBlock) {
      const ordered = events.toSorted((one, other) => one.tenths - other.tenths || one.order - other.order);
      for (const [index, { slot }] of ordered.entries()) {
        blocks.set([slot.time, slot.status, slot.data1, slot.data2], (block * slots + index) * SLOT_BYTES);
      }
    }
    return { slots, blocks, lengthMs: count * INSTRUMENT_BLOCK_MS };
  }

  /** Adds a message of a kind to a part, 0 to 15. */
  protected message(ms: number, message: number, part: number, data1: number, data2: number): this {
    return this.add({ ms, status: message | this.wholeIn("a part", part, MIDI_PARTS - 1), data1, data2 });
  }
}

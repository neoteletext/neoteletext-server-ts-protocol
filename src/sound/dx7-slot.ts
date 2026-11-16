// One slot of a DX7 block (the engine's REQ-6411): a time within the
// block and a MIDI message of three bytes, or four zero bytes for none.
// The rule here is the server's (its protocol/check/instrument.rs,
// slot_fault), used both where a program makes a sound and where the kit
// checks a message before it is written, so the two cannot differ.

import { DX7_BLOCK_TIMES, DX7_MOST_PATCHES, DX7_SLOT_BYTES, SEVEN_BITS } from "./instrument-profile.ts";

/** A MIDI status byte's message is its high four bits; the low four are the MIDI channel, the part that plays it (MIDI 1.0 Detailed Specification, "Channel Voice Messages"). */
const MESSAGE_BITS = 0xf0;
/** The parts: MIDI's 16 channels, 0 to 15. */
export const DX7_PARTS = 16;

/** The MIDI messages the DX7 codec takes, as status bytes of part 0. */
export const Midi = {
  NoteOff: 0x80,
  NoteOn: 0x90,
  ControlChange: 0xb0,
  ProgramChange: 0xc0,
  PitchBend: 0xe0,
} as const;

/** MIDI's controller 120, All Sound Off (MIDI 1.0 Detailed Specification, "Channel Mode Messages"). */
const ALL_SOUND_OFF = 120;

/** The controllers the DX7 codec takes. */
export const Controller = {
  ModWheel: 1,
  Volume: 7,
  Sustain: 64,
  AllSoundOff: ALL_SOUND_OFF,
  ResetControllers: 121,
  AllNotesOff: 123,
} as const;

const CONTROLLERS: readonly number[] = Object.values(Controller);

/** A slot's four bytes. */
export interface Dx7Slot {
  /** Tenths of a millisecond within the block, 0 to 199. */
  readonly time: number;
  readonly status: number;
  readonly data1: number;
  readonly data2: number;
}

/** A status byte's message, without its part. */
export function messageOf(status: number): number {
  return status & MESSAGE_BITS;
}

/** A status byte's part, 0 to 15. */
export function partOf(status: number): number {
  return status & ~MESSAGE_BITS;
}

function isEmpty(slot: Dx7Slot): boolean {
  return slot.time === 0 && slot.status === 0 && slot.data1 === 0 && slot.data2 === 0;
}

function messageFault(slot: Dx7Slot): string | null {
  const sevenBits = slot.data1 <= SEVEN_BITS && slot.data2 <= SEVEN_BITS;
  switch (messageOf(slot.status)) {
    case Midi.NoteOff:
    case Midi.NoteOn: {
      return sevenBits ? null : "a note's key and velocity are 0 to 127";
    }
    case Midi.ControlChange: {
      if (!CONTROLLERS.includes(slot.data1)) {
        return `a control change is of one of the controllers ${CONTROLLERS.join(", ")}`;
      }
      return slot.data2 <= SEVEN_BITS ? null : "a controller's value is 0 to 127";
    }
    case Midi.ProgramChange: {
      if (slot.data1 >= DX7_MOST_PATCHES) {
        return "a program change chooses patch 0 to 31";
      }
      return slot.data2 === 0 ? null : "a program change's second data byte is 0";
    }
    case Midi.PitchBend: {
      return sevenBits ? null : "a pitch bend's two data bytes are 0 to 127";
    }
    default: {
      return "its status is a note off, note on, control change, program change or pitch bend";
    }
  }
}

/** Why a slot is not one the DX7 codec takes, in the server's words; null for an empty slot or a message it takes. */
export function dx7SlotFault(slot: Dx7Slot): string | null {
  if (isEmpty(slot)) {
    return null;
  }
  if (slot.time >= DX7_BLOCK_TIMES) {
    return "its time is 0 to 199, tenths of a millisecond within the block";
  }
  return messageFault(slot);
}

/** The slot at `index` of `bytes`, which holds whole slots. */
export function slotAt(bytes: Uint8Array, index: number): Dx7Slot {
  const [time = 0, status = 0, data1 = 0, data2 = 0] = bytes.subarray(index * DX7_SLOT_BYTES, (index + 1) * DX7_SLOT_BYTES);
  return { time, status, data1, data2 };
}

/** The first slot of `blocks` the codec does not take, as the server names it: its block, its slot in the block, and why; null when every slot is taken. `blocks` holds whole blocks of `slots` slots. */
export function dx7BlocksFault(blocks: Uint8Array, slots: number): string | null {
  for (let index = 0; index * DX7_SLOT_BYTES < blocks.length; index += 1) {
    const why = dx7SlotFault(slotAt(blocks, index));
    if (why !== null) {
      return `block ${Math.floor(index / slots)} slot ${index % slots}: ${why}`;
    }
  }
  return null;
}

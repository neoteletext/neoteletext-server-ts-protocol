// One slot of a block (the engine's REQ-6411; DEC-6429), which every
// synthesizer played by slots shares: a time within the block and a
// MIDI message of three bytes, or four zero bytes for none. The rule here
// is the server's (its protocol/check/instrument.rs, slot_fault), used
// both where a program makes a sound and where the kit checks a message
// before it is written, so the two cannot differ.

import { MOST_PATCHES, SEVEN_BITS, SLOT_BLOCK_TIMES, SLOT_BYTES, SYNTH_FAMILY, type Synth } from "./instrument-profile.ts";

/** A MIDI status byte's message is its high four bits; the low four are the MIDI channel, the part that plays it (MIDI 1.0 Detailed Specification, "Channel Voice Messages"). */
const MESSAGE_BITS = 0xf0;
/** The parts: MIDI's 16 channels, 0 to 15. */
export const MIDI_PARTS = 16;

/** The MIDI messages a codec of slots takes, as status bytes of part 0: the synth7's five, and the two kinds of pressure, which the synth80 alone takes. */
export const Midi = {
  NoteOff: 0x80,
  NoteOn: 0x90,
  KeyPressure: 0xa0,
  ControlChange: 0xb0,
  ProgramChange: 0xc0,
  ChannelPressure: 0xd0,
  PitchBend: 0xe0,
} as const;

/** MIDI's controller 120, All Sound Off (MIDI 1.0 Detailed Specification, "Channel Mode Messages"). */
const ALL_SOUND_OFF = 120;

/** The controllers the synth7 codec takes. */
export const Controller = {
  ModWheel: 1,
  Volume: 7,
  Sustain: 64,
  AllSoundOff: ALL_SOUND_OFF,
  ResetControllers: 121,
  AllNotesOff: 123,
} as const;

const CONTROLLERS: readonly number[] = Object.values(Controller);

/** Controllers as the server lists them in a refusal: "1, 7, 64, 120, 121 or 123". */
function listed(controllers: readonly number[]): string {
  return `${controllers.slice(0, -1).join(", ")} or ${controllers.at(-1)}`;
}

/** The controllers the synth8's codec takes beyond {@link Controller}: portamento time, the balance of its upper and lower patches, and portamento on or off (the engine's receiver, analogue.rs). */
export const Synth8Controller = {
  PortamentoTime: 5,
  Balance: 8,
  Portamento: 65,
} as const;

const SYNTH8_CONTROLLERS: readonly number[] = Object.values(Synth8Controller);
/** Every controller the synth8's codec takes, in order. */
const SYNTH8_ALL_CONTROLLERS: readonly number[] = [...CONTROLLERS, ...SYNTH8_CONTROLLERS].toSorted((one, other) => one - other);

/** The controllers the codec of synth106 and synth60 takes beyond {@link Controller}: MIDI's omni off, omni on, mono on and poly on, each of which is to a synth106 an all notes off (Roland's Juno-106 owner's manual, MIDI Implementation 2.1; the engine's receiver, analogue.rs). */
export const Synth106Controller = {
  OmniOff: 124,
  OmniOn: 125,
  MonoOn: 126,
  PolyOn: 127,
} as const;

const SYNTH106_CONTROLLERS: readonly number[] = Object.values(Synth106Controller);

/** The parts whose program changes the synth8 takes: part 0 chooses its upper patch and part 1 its lower. */
export const SYNTH8_PROGRAM_PARTS = 2;

/** A slot's four bytes. */
export interface Slot {
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

function isEmpty(slot: Slot): boolean {
  return slot.time === 0 && slot.status === 0 && slot.data1 === 0 && slot.data2 === 0;
}

function messageFault(slot: Slot): string | null {
  const sevenBits = slot.data1 <= SEVEN_BITS && slot.data2 <= SEVEN_BITS;
  switch (messageOf(slot.status)) {
    case Midi.NoteOff:
    case Midi.NoteOn: {
      return sevenBits ? null : "a note's key and velocity are 0 to 127";
    }
    case Midi.ControlChange: {
      if (!CONTROLLERS.includes(slot.data1)) {
        return `a control change is of controller ${listed(CONTROLLERS)}`;
      }
      return slot.data2 <= SEVEN_BITS ? null : "a controller's value is 0 to 127";
    }
    case Midi.ProgramChange: {
      if (slot.data1 >= MOST_PATCHES) {
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

/** The synth80's own messages: key pressure and channel pressure; null for any other message, which is the synth7's to judge. */
function synth80Fault(slot: Slot): string | null | undefined {
  const message = messageOf(slot.status);
  if (message === Midi.KeyPressure) {
    return slot.data1 <= SEVEN_BITS && slot.data2 <= SEVEN_BITS ? null : "a key pressure's key and pressure are 0 to 127";
  }
  if (message === Midi.ChannelPressure) {
    if (slot.data1 > SEVEN_BITS) {
      return "a channel pressure is 0 to 127";
    }
    return slot.data2 === 0 ? null : "a channel pressure's second data byte is 0";
  }
  if (message === Midi.ControlChange || message === Midi.ProgramChange || message === Midi.NoteOff || message === Midi.NoteOn || message === Midi.PitchBend) {
    return undefined;
  }
  return "its status is a note off, note on, key pressure, control change, program change, channel pressure or pitch bend";
}

/** The synth8's own rules: three more controllers, and program changes on its two parts only; undefined for what is the synth7's to judge. */
function synth8Fault(slot: Slot): string | null | undefined {
  const message = messageOf(slot.status);
  if (message === Midi.ControlChange && SYNTH8_CONTROLLERS.includes(slot.data1)) {
    return slot.data2 <= SEVEN_BITS ? null : "a controller's value is 0 to 127";
  }
  if (message === Midi.ControlChange && !CONTROLLERS.includes(slot.data1)) {
    return `a synth8's control change is of controller ${listed(SYNTH8_ALL_CONTROLLERS)}`;
  }
  if (message === Midi.ProgramChange && partOf(slot.status) >= SYNTH8_PROGRAM_PARTS) {
    return "a synth8's program change is on MIDI channel 1, the upper patch, or 2, the lower";
  }
  return undefined;
}

/** The synth106's and synth60's own rules: four more controllers; undefined for what is the synth7's to judge. */
function synth106Fault(slot: Slot, instrument: Synth): string | null | undefined {
  if (messageOf(slot.status) !== Midi.ControlChange) {
    return undefined;
  }
  if (SYNTH106_CONTROLLERS.includes(slot.data1)) {
    return slot.data2 <= SEVEN_BITS ? null : "a controller's value is 0 to 127";
  }
  return CONTROLLERS.includes(slot.data1)
    ? undefined
    : `a ${instrument}'s control change is of controller ${listed(CONTROLLERS)} to ${SYNTH106_CONTROLLERS.at(-1)}`;
}

/** Why a message is not one `instrument`'s codec takes; null when it takes it. */
function instrumentMessageFault(slot: Slot, instrument: Synth): string | null {
  let own: string | null | undefined = undefined;
  const family = SYNTH_FAMILY[instrument];
  if (family === "synth80") {
    own = synth80Fault(slot);
  } else if (family === "synth8") {
    own = synth8Fault(slot);
  } else if (family === "synth106") {
    own = synth106Fault(slot, instrument);
  }
  return own === undefined ? messageFault(slot) : own;
}

/** Why a slot is not one `instrument`'s codec takes, in the server's words; null for an empty slot or a message it takes. Every codec takes the synth7's messages; the synth80's also key and channel pressure, the synth106's also {@link Synth106Controller}, and the synth8's also {@link Synth8Controller}, with program changes on parts 0 and 1 only. */
export function instrumentSlotFault(slot: Slot, instrument: Synth): string | null {
  if (isEmpty(slot)) {
    return null;
  }
  if (slot.time >= SLOT_BLOCK_TIMES) {
    return "its time is 0 to 199, tenths of a millisecond within the block";
  }
  return instrumentMessageFault(slot, instrument);
}

/** Why a slot is not one the synth7 codec takes, in the server's words; null for an empty slot or a message it takes. */
export function synth7SlotFault(slot: Slot): string | null {
  return instrumentSlotFault(slot, "synth7");
}

/** The slot at `index` of `bytes`, which holds whole slots. */
export function slotAt(bytes: Uint8Array, index: number): Slot {
  const [time = 0, status = 0, data1 = 0, data2 = 0] = bytes.subarray(index * SLOT_BYTES, (index + 1) * SLOT_BYTES);
  return { time, status, data1, data2 };
}

/** The first slot of `blocks` that `instrument`'s codec does not take, as the server names it; null when every slot is taken. `blocks` holds whole blocks of `slots` slots. */
export function instrumentBlocksFault(blocks: Uint8Array, slots: number, instrument: Synth): string | null {
  for (let index = 0; index * SLOT_BYTES < blocks.length; index += 1) {
    const why = instrumentSlotFault(slotAt(blocks, index), instrument);
    if (why !== null) {
      return `block ${Math.floor(index / slots)} slot ${index % slots}: ${why}`;
    }
  }
  return null;
}

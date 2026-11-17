// One slot of a DX7 block (the engine's REQ-6411), which the analogue
// synthesizers' blocks share (DEC-6429): a time within the block and a
// MIDI message of three bytes, or four zero bytes for none. The rule here
// is the server's (its protocol/check/instrument.rs, slot_fault), used
// both where a program makes a sound and where the kit checks a message
// before it is written, so the two cannot differ.

import { DX7_BLOCK_TIMES, DX7_MOST_PATCHES, DX7_SLOT_BYTES, SEVEN_BITS, type Synth } from "./instrument-profile.ts";

/** A MIDI status byte's message is its high four bits; the low four are the MIDI channel, the part that plays it (MIDI 1.0 Detailed Specification, "Channel Voice Messages"). */
const MESSAGE_BITS = 0xf0;
/** The parts: MIDI's 16 channels, 0 to 15. */
export const DX7_PARTS = 16;

/** The MIDI messages a codec of slots takes, as status bytes of part 0: the DX7's five, and the two kinds of pressure, which the CS-80 alone takes. */
export const Midi = {
  NoteOff: 0x80,
  NoteOn: 0x90,
  KeyPressure: 0xa0,
  ControlChange: 0xb0,
  ProgramChange: 0xc0,
  ChannelPressure: 0xd0,
  PitchBend: 0xe0,
} as const;

/** What plays a block of slots: the DX7, or one of the analogue synthesizers. */
export type SlotInstrument = "dx7" | Synth;

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

/** The controllers the Jupiter-8's codec takes beyond {@link Controller}: portamento time, the balance of its upper and lower patches, and portamento on or off (the engine's receiver, analogue.rs). */
export const Jupiter8Controller = {
  PortamentoTime: 5,
  Balance: 8,
  Portamento: 65,
} as const;

const JUPITER8_CONTROLLERS: readonly number[] = Object.values(Jupiter8Controller);
/** Every controller the Jupiter-8's codec takes, in order. */
const JUPITER8_ALL_CONTROLLERS: readonly number[] = [...CONTROLLERS, ...JUPITER8_CONTROLLERS].toSorted((one, other) => one - other);

/** The controllers the Juno's codec takes beyond {@link Controller}: MIDI's omni off, omni on, mono on and poly on, each of which is to a Juno-106 an all notes off (Roland's Juno-106 owner's manual, MIDI Implementation 2.1; the engine's receiver, analogue.rs). */
export const JunoController = {
  OmniOff: 124,
  OmniOn: 125,
  MonoOn: 126,
  PolyOn: 127,
} as const;

const JUNO_CONTROLLERS: readonly number[] = Object.values(JunoController);
/** Every controller the Juno's codec takes, in order. */
const JUNO_ALL_CONTROLLERS: readonly number[] = [...CONTROLLERS, ...JUNO_CONTROLLERS].toSorted((one, other) => one - other);

/** The parts whose program changes the Jupiter-8 takes: part 0 chooses its upper patch and part 1 its lower. */
export const JUPITER8_PROGRAM_PARTS = 2;

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

/** The CS-80's own messages: key pressure and channel pressure; null for any other message, which is the DX7's to judge. */
function cs80Fault(slot: Dx7Slot): string | null | undefined {
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

/** The Jupiter-8's own rules: three more controllers, and program changes on its two parts only; undefined for what is the DX7's to judge. */
function jupiter8Fault(slot: Dx7Slot): string | null | undefined {
  const message = messageOf(slot.status);
  if (message === Midi.ControlChange && JUPITER8_CONTROLLERS.includes(slot.data1)) {
    return slot.data2 <= SEVEN_BITS ? null : "a controller's value is 0 to 127";
  }
  if (message === Midi.ControlChange && !CONTROLLERS.includes(slot.data1)) {
    return `a Jupiter-8's control change is of one of the controllers ${JUPITER8_ALL_CONTROLLERS.join(", ")}`;
  }
  if (message === Midi.ProgramChange && partOf(slot.status) >= JUPITER8_PROGRAM_PARTS) {
    return "a Jupiter-8's program change is on MIDI channel 1, the upper patch, or 2, the lower";
  }
  return undefined;
}

/** The Juno's own rules: four more controllers; undefined for what is the DX7's to judge. */
function junoFault(slot: Dx7Slot): string | null | undefined {
  if (messageOf(slot.status) !== Midi.ControlChange) {
    return undefined;
  }
  if (JUNO_CONTROLLERS.includes(slot.data1)) {
    return slot.data2 <= SEVEN_BITS ? null : "a controller's value is 0 to 127";
  }
  return CONTROLLERS.includes(slot.data1) ? undefined : `a Juno's control change is of one of the controllers ${JUNO_ALL_CONTROLLERS.join(", ")}`;
}

/** Why a message is not one `instrument`'s codec takes; null when it takes it. */
function instrumentMessageFault(slot: Dx7Slot, instrument: SlotInstrument): string | null {
  let own: string | null | undefined = undefined;
  if (instrument === "cs80") {
    own = cs80Fault(slot);
  } else if (instrument === "jupiter8") {
    own = jupiter8Fault(slot);
  } else if (instrument === "juno") {
    own = junoFault(slot);
  }
  return own === undefined ? messageFault(slot) : own;
}

/** Why a slot is not one `instrument`'s codec takes, in the server's words; null for an empty slot or a message it takes. Every codec takes the DX7's messages; the CS-80's also key and channel pressure, the Juno's also {@link JunoController}, and the Jupiter-8's also {@link Jupiter8Controller}, with program changes on parts 0 and 1 only. */
export function instrumentSlotFault(slot: Dx7Slot, instrument: SlotInstrument): string | null {
  if (isEmpty(slot)) {
    return null;
  }
  if (slot.time >= DX7_BLOCK_TIMES) {
    return "its time is 0 to 199, tenths of a millisecond within the block";
  }
  return instrumentMessageFault(slot, instrument);
}

/** Why a slot is not one the DX7 codec takes, in the server's words; null for an empty slot or a message it takes. */
export function dx7SlotFault(slot: Dx7Slot): string | null {
  return instrumentSlotFault(slot, "dx7");
}

/** The slot at `index` of `bytes`, which holds whole slots. */
export function slotAt(bytes: Uint8Array, index: number): Dx7Slot {
  const [time = 0, status = 0, data1 = 0, data2 = 0] = bytes.subarray(index * DX7_SLOT_BYTES, (index + 1) * DX7_SLOT_BYTES);
  return { time, status, data1, data2 };
}

/** The first slot of `blocks` that `instrument`'s codec does not take, as the server names it; null when every slot is taken. `blocks` holds whole blocks of `slots` slots. */
export function instrumentBlocksFault(blocks: Uint8Array, slots: number, instrument: SlotInstrument): string | null {
  for (let index = 0; index * DX7_SLOT_BYTES < blocks.length; index += 1) {
    const why = instrumentSlotFault(slotAt(blocks, index), instrument);
    if (why !== null) {
      return `block ${Math.floor(index / slots)} slot ${index % slots}: ${why}`;
    }
  }
  return null;
}

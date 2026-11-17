// One image of the synth6581 chip's 25 writable registers, built by name
// (REQ-6414 item 1). A synth6581 sound is a run of these, one for each step of
// its time; the receiver's chip is written with each in turn. The register
// map is the MOS 6581 Sound Interface Device data sheet's ("Register Map"):
// seven registers for each of the three voices, then the filter's four.

import type { Synth6581Clock } from "./instrument-members.ts";
import { SYNTH6581_IMAGE_BYTES } from "./instrument-profile.ts";
import { SYNTH6581_LAST_FREQUENCY, synth6581Frequency } from "./synth6581-clock.ts";

/** A voice of the chip, numbered as its data sheet numbers them. */
export type Synth6581Voice = 1 | 2 | 3;

/** A voice's control register, bit by bit; a bit not named is clear. */
export interface Synth6581Control {
  /** Starts the envelope's attack when set, and its release when cleared. */
  readonly gate?: boolean;
  /** Synchronises the oscillator with the voice before it (voice 3 before voice 1). */
  readonly sync?: boolean;
  /** Ring modulates the triangle with the voice before it. */
  readonly ring?: boolean;
  /** Holds the oscillator at zero. */
  readonly test?: boolean;
  readonly triangle?: boolean;
  readonly sawtooth?: boolean;
  readonly pulse?: boolean;
  readonly noise?: boolean;
}

/** A voice's envelope: each 0 to 15, a rate for attack, decay and release, a level for sustain. */
export interface Synth6581Envelope {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

/** The filter's outputs that are mixed in, and whether voice 3 is kept out of the mix. */
export interface Synth6581FilterMode {
  readonly lowPass?: boolean;
  readonly bandPass?: boolean;
  readonly highPass?: boolean;
  /** Voice 3 is not heard, unless it is routed through the filter: for using it only to modulate. */
  readonly voice3Off?: boolean;
}

/** Each voice's registers start at this many times its index. */
const VOICE_REGISTERS = 7;
/** A voice's registers, from its first. */
const FREQUENCY_LOW = 0;
const FREQUENCY_HIGH = 1;
const PULSE_LOW = 2;
const PULSE_HIGH = 3;
const CONTROL = 4;
const ATTACK_DECAY = 5;
const SUSTAIN_RELEASE = 6;
/** The filter's registers. */
const CUTOFF_LOW = 21;
const CUTOFF_HIGH = 22;
const RESONANCE_ROUTING = 23;
const MODE_VOLUME = 24;

/** The control register's bits. */
const GATE = 0x01;
const CONTROL_BITS: readonly (readonly [keyof Synth6581Control, number])[] = [
  ["gate", GATE],
  ["sync", 0x02],
  ["ring", 0x04],
  ["test", 0x08],
  ["triangle", 0x10],
  ["sawtooth", 0x20],
  ["pulse", 0x40],
  ["noise", 0x80],
];
/** The mode register's bits, above the volume. */
const MODE_BITS: readonly (readonly [keyof Synth6581FilterMode, number])[] = [
  ["lowPass", 0x10],
  ["bandPass", 0x20],
  ["highPass", 0x40],
  ["voice3Off", 0x80],
];
/** The routing register's bit for the external input, above the three voices'. */
const ROUTE_EXTERNAL = 0x08;

const BYTE = 0xff;
const BYTE_BITS = 8;
const NIBBLE = 0x0f;
const NIBBLE_BITS = 4;
/** The pulse width is 12 bits, its high 4 in their own register. */
const LAST_PULSE_WIDTH = 0x0fff;
/** The cutoff is 11 bits: its low 3 in one register, its high 8 in the next. */
const LAST_CUTOFF = 0x07ff;
const CUTOFF_LOW_BITS = 3;
const CUTOFF_LOW_MASK = 0x07;
const VOICES: readonly number[] = [1, 2, 3] satisfies Synth6581Voice[];

function wholeIn(name: string, value: number, most: number): number {
  if (!Number.isInteger(value) || value < 0 || value > most) {
    throw new RangeError(`synth6581: ${name} is 0 to ${most}, not ${value}`);
  }
  return value;
}

/** The first register of `voice`. */
function base(voice: Synth6581Voice): number {
  if (!VOICES.includes(voice)) {
    throw new RangeError(`synth6581: a voice is 1, 2 or 3, not ${String(voice)}`);
  }
  return (voice - 1) * VOICE_REGISTERS;
}

function bitsOf<T extends object>(flags: T, bits: readonly (readonly [keyof T, number])[]): number {
  let byte = 0;
  for (const [name, bit] of bits) {
    if (flags[name] === true) {
      byte |= bit;
    }
  }
  return byte;
}

/** The chip's 25 writable registers, set by name. Every setter returns the image, so settings chain; a new image is all zeros, or a copy of the one given. */
export class Synth6581Image {
  readonly #registers = new Uint8Array(SYNTH6581_IMAGE_BYTES);

  constructor(from?: Synth6581Image) {
    if (from !== undefined) {
      this.#registers.set(from.#registers);
    }
  }

  /** A voice's frequency register, 0 to 65,535 (`synth6581Frequency` gives the value of a pitch). */
  frequency(voice: Synth6581Voice, value: number): this {
    const at = base(voice);
    wholeIn("a frequency", value, SYNTH6581_LAST_FREQUENCY);
    return this.#set(at + FREQUENCY_LOW, value & BYTE).#set(at + FREQUENCY_HIGH, value >> BYTE_BITS);
  }

  /** A voice's frequency register for a pitch in hertz, on PAL's clock when none is named. */
  pitch(voice: Synth6581Voice, hertz: number, clock: Synth6581Clock = "pal"): this {
    return this.frequency(voice, synth6581Frequency(hertz, clock));
  }

  /** A voice's pulse width, 0 to 4,095: 2,048 is a square wave. */
  pulseWidth(voice: Synth6581Voice, value: number): this {
    const at = base(voice);
    wholeIn("a pulse width", value, LAST_PULSE_WIDTH);
    return this.#set(at + PULSE_LOW, value & BYTE).#set(at + PULSE_HIGH, value >> BYTE_BITS);
  }

  /** A voice's whole control register: the bits named are set, every other is clear. */
  control(voice: Synth6581Voice, control: Synth6581Control): this {
    return this.#set(base(voice) + CONTROL, bitsOf(control, CONTROL_BITS));
  }

  /** A voice's gate alone, its waveform and other control bits kept. */
  gate(voice: Synth6581Voice, on: boolean): this {
    const at = base(voice) + CONTROL;
    const kept = (this.#registers[at] ?? 0) & ~GATE;
    return this.#set(at, on ? kept | GATE : kept);
  }

  attack(voice: Synth6581Voice, value: number): this {
    return this.#high(base(voice) + ATTACK_DECAY, wholeIn("an attack", value, NIBBLE));
  }

  decay(voice: Synth6581Voice, value: number): this {
    return this.#low(base(voice) + ATTACK_DECAY, wholeIn("a decay", value, NIBBLE));
  }

  sustain(voice: Synth6581Voice, value: number): this {
    return this.#high(base(voice) + SUSTAIN_RELEASE, wholeIn("a sustain", value, NIBBLE));
  }

  release(voice: Synth6581Voice, value: number): this {
    return this.#low(base(voice) + SUSTAIN_RELEASE, wholeIn("a release", value, NIBBLE));
  }

  /** A voice's attack, decay, sustain and release together. */
  envelope(voice: Synth6581Voice, envelope: Synth6581Envelope): this {
    return this.attack(voice, envelope.attack).decay(voice, envelope.decay).sustain(voice, envelope.sustain).release(voice, envelope.release);
  }

  /** The filter's cutoff, 0 to 2,047. */
  cutoff(value: number): this {
    wholeIn("a cutoff", value, LAST_CUTOFF);
    return this.#set(CUTOFF_LOW, value & CUTOFF_LOW_MASK).#set(CUTOFF_HIGH, value >> CUTOFF_LOW_BITS);
  }

  /** The filter's resonance, 0 to 15. */
  resonance(value: number): this {
    return this.#high(RESONANCE_ROUTING, wholeIn("a resonance", value, NIBBLE));
  }

  /** The voices that go through the filter, and whether the external input does; every other goes straight to the mix. */
  route(voices: readonly Synth6581Voice[], external = false): this {
    let bits = external ? ROUTE_EXTERNAL : 0;
    for (const voice of voices) {
      bits |= 1 << (base(voice) / VOICE_REGISTERS);
    }
    return this.#low(RESONANCE_ROUTING, bits);
  }

  /** The filter's outputs that are mixed in, and voice 3's silence: what is named is set, every other is clear. */
  mode(mode: Synth6581FilterMode): this {
    const at = MODE_VOLUME;
    return this.#set(at, bitsOf(mode, MODE_BITS) | ((this.#registers[at] ?? 0) & NIBBLE));
  }

  /** The volume of the mix, 0 to 15. */
  volume(value: number): this {
    return this.#low(MODE_VOLUME, wholeIn("a volume", value, NIBBLE));
  }

  /** A register's value, by its address, 0 to 24. */
  register(address: number): number {
    return this.#registers[wholeIn("a register", address, SYNTH6581_IMAGE_BYTES - 1)] ?? 0;
  }

  /** A copy of the 25 registers, in address order: one image of a synth6581 sound. */
  bytes(): Uint8Array {
    return this.#registers.slice();
  }

  #set(address: number, value: number): this {
    this.#registers[address] = value;
    return this;
  }

  /** The high four bits of a register, its low four kept. */
  #high(address: number, value: number): this {
    return this.#set(address, (value << NIBBLE_BITS) | ((this.#registers[address] ?? 0) & NIBBLE));
  }

  /** The low four bits of a register, its high four kept. */
  #low(address: number, value: number): this {
    return this.#set(address, ((this.#registers[address] ?? 0) & ~NIBBLE & BYTE) | value);
  }
}

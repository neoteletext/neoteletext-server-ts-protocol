// A Standard MIDI File's bytes read in order, every read bounded by the
// file's end (Standard MIDI Files 1.0): a file is untrusted, so a length
// it states is never believed past the bytes that are there.

/** A variable-length quantity is at most four bytes of 7 bits, the top bit of each but the last set (Standard MIDI Files 1.0, "Conventions"). */
const QUANTITY_BYTES = 4;
const QUANTITY_BITS = 7;
const QUANTITY_MASK = 0x7f;
const QUANTITY_MORE = 0x80;
const BYTE_BITS = 8;

/** Bytes read from a place that moves on, to an end it never passes. */
export class MidiBytes {
  readonly #bytes: Uint8Array;
  #at: number;
  readonly #end: number;

  constructor(bytes: Uint8Array, at = 0, end = bytes.length) {
    this.#bytes = bytes;
    this.#at = at;
    this.#end = end;
  }

  /** Whether every byte has been read. */
  get done(): boolean {
    return this.#at >= this.#end;
  }

  /** The next byte, not yet read. */
  peek(): number {
    const byte = this.#at < this.#end ? this.#bytes[this.#at] : undefined;
    if (byte === undefined) {
      throw new RangeError(`midi file: it ends at byte ${this.#at}, part way through`);
    }
    return byte;
  }

  byte(): number {
    const byte = this.peek();
    this.#at += 1;
    return byte;
  }

  /** A big-endian number of `bytes` bytes. */
  number(bytes: number): number {
    let value = 0;
    for (let index = 0; index < bytes; index += 1) {
      value = value * (1 << BYTE_BITS) + this.byte();
    }
    return value;
  }

  /** A variable-length quantity. */
  quantity(): number {
    let value = 0;
    for (let index = 0; index < QUANTITY_BYTES; index += 1) {
      const byte = this.byte();
      value = (value << QUANTITY_BITS) | (byte & QUANTITY_MASK);
      if ((byte & QUANTITY_MORE) === 0) {
        return value;
      }
    }
    throw new RangeError(`midi file: a variable-length quantity before byte ${this.#at} is over ${QUANTITY_BYTES} bytes`);
  }

  /** The next `length` bytes as text, one character a byte. */
  text(length: number): string {
    const start = this.#at;
    this.take(length);
    return String.fromCodePoint(...this.#bytes.subarray(start, start + length));
  }

  /** A reader of the next `length` bytes, which this one passes over. */
  take(length: number): MidiBytes {
    if (length > this.#end - this.#at) {
      throw new RangeError(`midi file: ${length} bytes at byte ${this.#at} run past its end`);
    }
    const taken = new MidiBytes(this.#bytes, this.#at, this.#at + length);
    this.#at += length;
    return taken;
  }
}

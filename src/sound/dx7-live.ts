// A live DX7 sound's program changes, repeated (REQ-6414 item 5). A viewer
// who joins a live sound hears only the blocks sent from then on: a part's
// program change sent before they joined never reaches them, and the part
// would play with the wrong patch until its next one. So each part's last
// program change is written again, into a slot the block leaves empty, at
// least once a second.

import { DX7_PARTS, type Dx7Slot, Midi, dx7BlocksFault, messageOf, partOf, slotAt } from "./dx7-slot.ts";
import { DX7_MOST_SLOTS, DX7_SLOT_BYTES, INSTRUMENT_BLOCK_MS } from "./instrument-profile.ts";

/** A part's program is repeated once this many blocks have passed without it: half a second, so a block or two with no slot to spare still leaves it repeated within the second. */
export const DX7_PROGRAM_REPEAT_BLOCKS = 500 / INSTRUMENT_BLOCK_MS;

/** A part with no program change yet. */
const NO_PROGRAM = -1;

function isEmpty(slot: Dx7Slot): boolean {
  return slot.time === 0 && slot.status === 0 && slot.data1 === 0 && slot.data2 === 0;
}

/** Remembers each part's last program change in a live DX7 sound's blocks, and writes it again when half a second has passed without it. A live sound has one, which every block of the sound passes through, in order, before it is sent. */
export class Dx7ProgramRepeater {
  readonly slots: number;
  readonly #programs: number[] = Array.from({ length: DX7_PARTS }, () => NO_PROGRAM);
  /** The blocks since each part's program was last in a block. */
  readonly #since: number[] = Array.from({ length: DX7_PARTS }, () => 0);

  constructor(slots: number) {
    if (!Number.isInteger(slots) || slots < 1 || slots > DX7_MOST_SLOTS) {
      throw new RangeError(`dx7: a block has 1 to ${DX7_MOST_SLOTS} slots, not ${slots}`);
    }
    this.slots = slots;
  }

  /** The program each part last changed to, by part; -1 for a part that has not. */
  get programs(): readonly number[] {
    return [...this.#programs];
  }

  /** `blocks`, whole blocks about to be sent, with each due program change written into an empty slot of a block, at the block's start; a block with no empty slot is left as it is and the change waits for the next. What is given is not changed. */
  pass(blocks: Uint8Array): Uint8Array {
    const size = this.slots * DX7_SLOT_BYTES;
    if (blocks.length % size !== 0) {
      throw new RangeError(`dx7: blocks are whole blocks of ${size} bytes, not ${blocks.length} bytes`);
    }
    const fault = dx7BlocksFault(blocks, this.slots);
    if (fault !== null) {
      throw new RangeError(`dx7: ${fault}`);
    }
    const passed = new Uint8Array(blocks.length);
    for (let start = 0; start < blocks.length; start += size) {
      passed.set(this.#block(blocks.subarray(start, start + size)), start);
    }
    return passed;
  }

  /** One block, with the program changes that are due before its own slots. */
  #block(block: Uint8Array): number[] {
    const own = Array.from({ length: this.slots }, (_, index) => slotAt(block, index)).filter((slot) => !isEmpty(slot));
    for (const slot of own) {
      if (messageOf(slot.status) === Midi.ProgramChange) {
        this.#programs[partOf(slot.status)] = slot.data1;
        this.#since[partOf(slot.status)] = -1;
      }
    }
    const repeated: Dx7Slot[] = [];
    for (let part = 0; part < DX7_PARTS; part += 1) {
      const since = (this.#since[part] ?? 0) + 1;
      const program = this.#programs[part] ?? NO_PROGRAM;
      const due = program !== NO_PROGRAM && since >= DX7_PROGRAM_REPEAT_BLOCKS && own.length + repeated.length < this.slots;
      if (due) {
        repeated.push({ time: 0, status: Midi.ProgramChange | part, data1: program, data2: 0 });
      }
      this.#since[part] = due ? 0 : since;
    }
    return [...repeated, ...own].flatMap((slot) => [slot.time, slot.status, slot.data1, slot.data2]);
  }
}

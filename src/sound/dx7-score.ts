// A DX7 sound's blocks built from timed events (REQ-6414 item 2): the
// score of slots (slot-score.ts), its events held to what the DX7 codec
// takes.

import { type Dx7Event, SlotScore } from "./slot-score.ts";

export type { Dx7Event, Dx7ScoreBlocks } from "./slot-score.ts";

/** Timed events for a DX7, gathered in any order. A part is a MIDI channel, 0 to 15; each plays the patch its last program change chose from the sound's bank. Every method returns the score, so calls chain. */
export class Dx7Score extends SlotScore {
  constructor(events: readonly Dx7Event[] = []) {
    super("dx7", events);
  }
}

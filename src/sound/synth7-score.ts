// A synth7 sound's blocks built from timed events (REQ-6414 item 2): the
// score of slots (slot-score.ts), its events held to what the synth7 codec
// takes.

import { type SlotEvent, SlotScore } from "./slot-score.ts";

export type { SlotEvent, SlotScoreBlocks } from "./slot-score.ts";

/** Timed events for a synth7, gathered in any order. A part is a MIDI channel, 0 to 15; each plays the patch its last program change chose from the sound's bank. Every method returns the score, so calls chain. */
export class Synth7Score extends SlotScore {
  constructor(events: readonly SlotEvent[] = []) {
    super("synth7", events);
  }
}

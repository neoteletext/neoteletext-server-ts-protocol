// A live analogue synthesizer's program changes, repeated (DEC-6429): the
// repeater of program-repeater.ts, its blocks held to the synthesizer's
// codec.

import type { Synth } from "./instrument-profile.ts";
import { ProgramRepeater } from "./program-repeater.ts";

/** Remembers each part's last program change in a live synthesizer sound's blocks, and writes it again when half a second has passed without it. The Jupiter-8 takes program changes on parts 0 and 1 only, its upper and lower patches, so only theirs are ever repeated. */
export class SynthProgramRepeater extends ProgramRepeater {
  readonly synth: Synth;

  constructor(synth: Synth, slots: number) {
    super(synth, slots);
    this.synth = synth;
  }
}

// A live synth7 sound's program changes, repeated (REQ-6414 item 5): the
// repeater of program-repeater.ts, its blocks held to the synth7's codec.

import { ProgramRepeater } from "./program-repeater.ts";

export { PROGRAM_REPEAT_BLOCKS } from "./program-repeater.ts";

/** Remembers each part's last program change in a live synth7 sound's blocks, and writes it again when half a second has passed without it. A live sound has one, which every block of the sound passes through, in order, before it is sent. */
export class Synth7ProgramRepeater extends ProgramRepeater {
  constructor(slots: number) {
    super("synth7", slots);
  }
}

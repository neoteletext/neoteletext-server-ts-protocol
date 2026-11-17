// An analogue synthesizer's sound built from timed events (DEC-6429): the
// synth7's score of slots (slot-score.ts), its events held to what that
// synthesizer's codec takes, with the messages only some of them take:
// the synth80's key and channel pressure, and the synth8's portamento and
// the balance of its two patches.

import { Synth8Controller, Midi } from "./synth7-slot.ts";
import { SEVEN_BITS, type Synth } from "./instrument-profile.ts";
import { type SlotEvent, SlotScore } from "./slot-score.ts";

/** A controller switch is on at 64 and above (MIDI 1.0); the score writes the two ends. */
const SWITCH_ON = 127;

/** Timed events for one of the analogue synthesizers, gathered in any order: a synth7 score's, held to the synthesizer's codec. A part is a MIDI channel, 0 to 15; the synth8's part 0 chooses its upper patch and part 1 its lower, and every instrument hears every part as one keyboard. Every method returns the score, so calls chain. */
export class SynthScore extends SlotScore {
  readonly synth: Synth;

  constructor(synth: Synth, events: readonly SlotEvent[] = []) {
    super(synth, events);
    this.synth = synth;
  }

  /** How hard a held key is pressed, 0 to 127: the synth80's polyphonic aftertouch. */
  keyPressure(ms: number, part: number, key: number, pressure: number): this {
    return this.message(ms, Midi.KeyPressure, part, this.wholeIn("a key", key, SEVEN_BITS), this.wholeIn("a pressure", pressure, SEVEN_BITS));
  }

  /** How hard a part's keys are pressed, 0 to 127: the synth80's channel aftertouch. */
  channelPressure(ms: number, part: number, pressure: number): this {
    return this.message(ms, Midi.ChannelPressure, part, this.wholeIn("a pressure", pressure, SEVEN_BITS), 0);
  }

  /** The synth8's portamento time, 0 to 127. */
  portamentoTime(ms: number, part: number, value: number): this {
    return this.message(ms, Midi.ControlChange, part, Synth8Controller.PortamentoTime, this.wholeIn("a portamento time", value, SEVEN_BITS));
  }

  /** The synth8's balance of its lower and upper patches, 0 to 127. */
  balance(ms: number, part: number, value: number): this {
    return this.message(ms, Midi.ControlChange, part, Synth8Controller.Balance, this.wholeIn("a balance", value, SEVEN_BITS));
  }

  /** The synth8's portamento, on or off. */
  portamento(ms: number, part: number, on: boolean): this {
    return this.message(ms, Midi.ControlChange, part, Synth8Controller.Portamento, on ? SWITCH_ON : 0);
  }
}

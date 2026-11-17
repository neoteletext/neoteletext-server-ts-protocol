// The members of the synthesizers played by slots as the protocol writes
// them (DEC-6429, DEC-6461): a sound's handle, slots and bank, with a
// synth8's keyboard, blocks held to the synthesizer's codec, and a bank
// whose every patch its instrument reads.

import type {
  InstrumentMember,
  Synth8KeyMode,
  Synth8Live,
  Synth8Sound,
  SynthBank,
  SynthBlocks,
  SynthLive,
  SynthMember,
  SynthSound,
} from "./instrument-members.ts";
import {
  MOST_INSTRUMENT_BLOCKS,
  MOST_LIVE_INSTRUMENT_BLOCKS,
  MOST_PATCHES,
  MOST_SLOTS,
  SEVEN_BITS,
  SYNTHS,
  SYNTH_PATCH_BYTES,
  type Synth,
} from "./instrument-profile.ts";
import { handleFields, listed, slotBlocks, synthLiveFields, whole, wholeIn } from "./member-pieces.ts";
import { LAST_BLOCK } from "./profile.ts";
import { synthBankFault } from "./synth-patch-rules.ts";
import type { WireSynthSound } from "../wire/instrument-wire.ts";

/** A stored sound's fields but its kind and its own. */
function storedFields(synth: Synth, sound: SynthSound): ReturnType<typeof synthLiveFields> & { readonly blocks: string } {
  const fields = synthLiveFields(sound);
  return { ...fields, blocks: slotBlocks(sound.blocks, fields.slots, MOST_INSTRUMENT_BLOCKS, synth) };
}

function blocksFields(synth: Synth, blocks: SynthBlocks): Omit<Extract<WireSynthSound, { kind: "synth7_blocks" }>, "kind"> {
  const slots = wholeIn("slots", blocks.slots, 1, MOST_SLOTS);
  return {
    ...handleFields(blocks),
    slots,
    first: wholeIn("first", blocks.first, 0, LAST_BLOCK),
    blocks: slotBlocks(blocks.blocks, slots, MOST_LIVE_INSTRUMENT_BLOCKS, synth),
  };
}

function bankFields(synth: Synth, bank: SynthBank): Omit<Extract<WireSynthSound, { kind: "synth7_bank" }>, "kind"> {
  const patches = whole("patches", bank.patches, SYNTH_PATCH_BYTES[synth], MOST_PATCHES, "patches");
  const fault = synthBankFault(synth, bank.patches);
  if (fault !== null) {
    throw new RangeError(`sound: patches: ${fault}`);
  }
  return { ...handleFields(bank), patches };
}

const KEY_MODES: readonly string[] = ["whole", "dual", "split"] satisfies readonly Synth8KeyMode[];
/** The synth8's split key when a sound names none: middle C. */
const MIDDLE_C = 60;

function synth8Keys(live: Synth8Live): { readonly key_mode: Synth8KeyMode; readonly split_key: number } {
  return { key_mode: listed("key_mode", live.keyMode ?? "whole", KEY_MODES), split_key: wholeIn("split_key", live.splitKey ?? MIDDLE_C, 0, SEVEN_BITS) };
}

/** Every member a synthesizer played by slots may be, each absent but the one a member is. */
type AnySynthMember = { readonly [K in Synth]?: SynthSound | Synth8Sound } & { readonly [K in `${Synth}Live`]?: SynthLive | Synth8Live } & {
  readonly [K in `${Synth}Blocks`]?: SynthBlocks;
} & { readonly [K in `${Synth}Bank`]?: SynthBank };

/** One synthesizer's member as the protocol writes it; undefined when the member is another's. */
function fieldsOf(synth: Synth, member: AnySynthMember): WireSynthSound | undefined {
  const sound = member[synth];
  if (sound !== undefined) {
    return synth === "synth8" ? { kind: synth, ...storedFields(synth, sound), ...synth8Keys(sound) } : { kind: synth, ...storedFields(synth, sound) };
  }
  const live = member[`${synth}Live`];
  if (live !== undefined) {
    return synth === "synth8" ? { kind: `${synth}_live`, ...synthLiveFields(live), ...synth8Keys(live) } : { kind: `${synth}_live`, ...synthLiveFields(live) };
  }
  const blocks = member[`${synth}Blocks`];
  if (blocks !== undefined) {
    return { kind: `${synth}_blocks`, ...blocksFields(synth, blocks) };
  }
  const bank = member[`${synth}Bank`];
  return bank === undefined ? undefined : { kind: `${synth}_bank`, ...bankFields(synth, bank) };
}

/** A synthesizer's member as the protocol writes it. */
export function synthFields(member: SynthMember): WireSynthSound {
  for (const synth of SYNTHS) {
    const fields = fieldsOf(synth, member);
    if (fields !== undefined) {
      return fields;
    }
  }
  throw new RangeError("sound: a member is one of a synthesizer's sounds");
}

/** The keys of every synthesizer's members. */
export const SYNTH_KEYS: readonly string[] = SYNTHS.flatMap((synth) => [synth, `${synth}Live`, `${synth}Blocks`, `${synth}Bank`]);

/** Whether a member is a synthesizer's played by slots. */
export function isSynthMember(member: InstrumentMember): member is SynthMember {
  return SYNTH_KEYS.some((key) => key in member);
}

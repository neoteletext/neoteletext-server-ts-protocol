// The analogue synthesizers' members as the protocol writes them
// (DEC-6429; the server's 2df311a): a DX7 sound's fields with a Juno's or
// a Prophet-5's model or a Jupiter-8's keyboard, blocks held to the
// synthesizer's codec, and a bank whose every patch its instrument reads.

import type {
  Cs80Member,
  InstrumentMember,
  Jupiter8KeyMode,
  Jupiter8Live,
  Jupiter8Member,
  JunoLive,
  JunoMember,
  JunoModel,
  MinimoogMember,
  Prophet5Live,
  Prophet5Member,
  Prophet5Model,
  SynthBank,
  SynthBlocks,
  SynthMember,
  SynthSound,
} from "./instrument-members.ts";
import {
  DX7_MOST_PATCHES,
  DX7_MOST_SLOTS,
  MOST_INSTRUMENT_BLOCKS,
  MOST_LIVE_INSTRUMENT_BLOCKS,
  SEVEN_BITS,
  SYNTHS,
  SYNTH_PATCH_BYTES,
  type Synth,
} from "./instrument-profile.ts";
import { dx7LiveFields, handleFields, listed, slotBlocks, whole, wholeIn } from "./member-pieces.ts";
import { LAST_BLOCK } from "./profile.ts";
import { synthBankFault } from "./synth-patch-rules.ts";
import type { WireSynthSound } from "../wire/instrument-wire.ts";

/** A stored synthesizer sound's fields but its kind and its own. */
function storedFields(synth: Synth, sound: SynthSound): ReturnType<typeof dx7LiveFields> & { readonly blocks: string } {
  const fields = dx7LiveFields(sound);
  return { ...fields, blocks: slotBlocks(sound.blocks, fields.slots, MOST_INSTRUMENT_BLOCKS, synth) };
}

function blocksFields(synth: Synth, blocks: SynthBlocks): Omit<Extract<WireSynthSound, { kind: "juno_blocks" }>, "kind"> {
  const slots = wholeIn("slots", blocks.slots, 1, DX7_MOST_SLOTS);
  return {
    ...handleFields(blocks),
    slots,
    first: wholeIn("first", blocks.first, 0, LAST_BLOCK),
    blocks: slotBlocks(blocks.blocks, slots, MOST_LIVE_INSTRUMENT_BLOCKS, synth),
  };
}

function bankFields(synth: Synth, bank: SynthBank): Omit<Extract<WireSynthSound, { kind: "juno_bank" }>, "kind"> {
  const patches = whole("patches", bank.patches, SYNTH_PATCH_BYTES[synth], DX7_MOST_PATCHES, "patches");
  const fault = synthBankFault(synth, bank.patches);
  if (fault !== null) {
    throw new RangeError(`sound: patches: ${fault}`);
  }
  return { ...handleFields(bank), patches };
}

const JUNO_MODELS: readonly string[] = ["106", "60"] satisfies readonly JunoModel[];
const PROPHET5_MODELS: readonly string[] = ["revision_3", "revisions_1_and_2"] satisfies readonly Prophet5Model[];
const KEY_MODES: readonly string[] = ["whole", "dual", "split"] satisfies readonly Jupiter8KeyMode[];
/** The Jupiter-8's split key when a sound names none: middle C. */
const MIDDLE_C = 60;

function junoModel(live: JunoLive): { readonly model: JunoModel } {
  return { model: listed("model", live.model ?? "106", JUNO_MODELS) };
}

function prophet5Model(live: Prophet5Live): { readonly model: Prophet5Model } {
  return { model: listed("model", live.model ?? "revision_3", PROPHET5_MODELS) };
}

function jupiter8Keys(live: Jupiter8Live): { readonly key_mode: Jupiter8KeyMode; readonly split_key: number } {
  return { key_mode: listed("key_mode", live.keyMode ?? "whole", KEY_MODES), split_key: wholeIn("split_key", live.splitKey ?? MIDDLE_C, 0, SEVEN_BITS) };
}

function junoFields(member: JunoMember): WireSynthSound {
  if ("juno" in member) {
    return { kind: "juno", ...storedFields("juno", member.juno), ...junoModel(member.juno) };
  }
  if ("junoLive" in member) {
    return { kind: "juno_live", ...dx7LiveFields(member.junoLive), ...junoModel(member.junoLive) };
  }
  if ("junoBlocks" in member) {
    return { kind: "juno_blocks", ...blocksFields("juno", member.junoBlocks) };
  }
  return { kind: "juno_bank", ...bankFields("juno", member.junoBank) };
}

function minimoogFields(member: MinimoogMember): WireSynthSound {
  if ("minimoog" in member) {
    return { kind: "minimoog", ...storedFields("minimoog", member.minimoog) };
  }
  if ("minimoogLive" in member) {
    return { kind: "minimoog_live", ...dx7LiveFields(member.minimoogLive) };
  }
  if ("minimoogBlocks" in member) {
    return { kind: "minimoog_blocks", ...blocksFields("minimoog", member.minimoogBlocks) };
  }
  return { kind: "minimoog_bank", ...bankFields("minimoog", member.minimoogBank) };
}

function prophet5Fields(member: Prophet5Member): WireSynthSound {
  if ("prophet5" in member) {
    return { kind: "prophet5", ...storedFields("prophet5", member.prophet5), ...prophet5Model(member.prophet5) };
  }
  if ("prophet5Live" in member) {
    return { kind: "prophet5_live", ...dx7LiveFields(member.prophet5Live), ...prophet5Model(member.prophet5Live) };
  }
  if ("prophet5Blocks" in member) {
    return { kind: "prophet5_blocks", ...blocksFields("prophet5", member.prophet5Blocks) };
  }
  return { kind: "prophet5_bank", ...bankFields("prophet5", member.prophet5Bank) };
}

function jupiter8Fields(member: Jupiter8Member): WireSynthSound {
  if ("jupiter8" in member) {
    return { kind: "jupiter8", ...storedFields("jupiter8", member.jupiter8), ...jupiter8Keys(member.jupiter8) };
  }
  if ("jupiter8Live" in member) {
    return { kind: "jupiter8_live", ...dx7LiveFields(member.jupiter8Live), ...jupiter8Keys(member.jupiter8Live) };
  }
  if ("jupiter8Blocks" in member) {
    return { kind: "jupiter8_blocks", ...blocksFields("jupiter8", member.jupiter8Blocks) };
  }
  return { kind: "jupiter8_bank", ...bankFields("jupiter8", member.jupiter8Bank) };
}

function cs80Fields(member: Cs80Member): WireSynthSound {
  if ("cs80" in member) {
    return { kind: "cs80", ...storedFields("cs80", member.cs80) };
  }
  if ("cs80Live" in member) {
    return { kind: "cs80_live", ...dx7LiveFields(member.cs80Live) };
  }
  if ("cs80Blocks" in member) {
    return { kind: "cs80_blocks", ...blocksFields("cs80", member.cs80Blocks) };
  }
  return { kind: "cs80_bank", ...bankFields("cs80", member.cs80Bank) };
}

/** A synthesizer's member as the protocol writes it. */
export function synthFields(member: SynthMember): WireSynthSound {
  if ("juno" in member || "junoLive" in member || "junoBlocks" in member || "junoBank" in member) {
    return junoFields(member);
  }
  if ("minimoog" in member || "minimoogLive" in member || "minimoogBlocks" in member || "minimoogBank" in member) {
    return minimoogFields(member);
  }
  if ("prophet5" in member || "prophet5Live" in member || "prophet5Blocks" in member || "prophet5Bank" in member) {
    return prophet5Fields(member);
  }
  if ("jupiter8" in member || "jupiter8Live" in member || "jupiter8Blocks" in member || "jupiter8Bank" in member) {
    return jupiter8Fields(member);
  }
  return cs80Fields(member);
}

/** The keys of every synthesizer's members. */
export const SYNTH_KEYS: readonly string[] = SYNTHS.flatMap((synth) => [synth, `${synth}Live`, `${synth}Blocks`, `${synth}Bank`]);

/** Whether a member is an analogue synthesizer's. */
export function isSynthMember(member: InstrumentMember): member is SynthMember {
  return SYNTH_KEYS.some((key) => key in member);
}

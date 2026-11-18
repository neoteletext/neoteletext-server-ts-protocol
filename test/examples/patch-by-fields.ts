// typescript.md 4.3: a synth106 patch in the `fields` form (MIDI-14 form 1;
// SRV-30), used as the one patch of a bank and inline as the first event of
// a stored phrase; 4.2 imports it.

import type { SoundSynth106BankMember, SoundSynth106Member, Synth106PatchFields } from "../../src/protocol.ts";

export const BRASS_BANK = 5;

const BRASS: Omit<Synth106PatchFields, "form"> = {
  lfo_rate: 40,
  lfo_delay: 0,
  dco_lfo: 0,
  dco_pwm: 0,
  noise_level: 0,
  vcf_frequency: 52,
  vcf_resonance: 18,
  vcf_envelope: 70,
  vcf_lfo: 0,
  vcf_keyboard: 64,
  vca_level: 90,
  attack: 22,
  decay: 60,
  sustain: 80,
  release: 30,
  sub_level: 40,
  range: "feet_8",
  pulse: false,
  sawtooth: true,
  chorus: "one",
  pwm: "manual",
  envelope_polarity: "positive",
  vca: "envelope",
  hpf: 0,
};

export function brassBank(): SoundSynth106BankMember {
  return { kind: "synth106_bank", handle: BRASS_BANK, generation: 0, bank: { form: "patches", patches: [{ form: "fields", ...BRASS }] } };
}

export function brassPhrase(): SoundSynth106Member {
  return {
    kind: "synth106",
    handle: 7,
    generation: 0,
    banks: [BRASS_BANK],
    lift_banks: [],
    length: { tail_us: 800_000 },
    music: {
      form: "events",
      events: [
        { event: "patch", time_us: 0, channel: 1, patch: { form: "fields", ...BRASS } },
        { event: "note_on", time_us: 0, channel: 1, key: 60, velocity: 96 },
        { event: "note_off", time_us: 400_000, channel: 1, key: 60, velocity: 64 },
      ],
    },
  };
}

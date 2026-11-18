// Member types are what a program builds (typescript.md TS-11, TS-21): the
// type check refuses a member that names its own `type` or `connections`,
// and a bytes field given as text.

import type { SoundPlayMember, SoundSynth7BankMember } from "../../src/protocol.ts";

const PLAY = { kind: "play", channel: 0, handle: 1, generation: 0, gain: 100, fade_ms: 0, loop: false, after: false, duck: 0 } as const;

export const members: readonly unknown[] = [
  PLAY satisfies SoundPlayMember,
  // @ts-expect-error -- the kit adds `connections` (TS-11)
  { ...PLAY, connections: [1] } satisfies SoundPlayMember,
  // @ts-expect-error -- the kit adds `type` (TS-11)
  { ...PLAY, type: "sound" } satisfies SoundPlayMember,
  // @ts-expect-error -- a bytes field is a Uint8Array, never base64 text (TS-21)
  { kind: "synth7_bank", handle: 1, generation: 0, bank: { form: "bytes", bytes: "8A==" } } satisfies SoundSynth7BankMember,
];

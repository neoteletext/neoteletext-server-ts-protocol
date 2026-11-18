// neoteletext-server-ts-protocol/protocol: program protocol 14's types, every
// message of both directions and every type they use, generated from the
// server's schema (schema/protocol-14.json) by scripts/types.ts under their
// generated names (typescript.md TS-8 to TS-15, TS-27). A program builds a
// sound as one of the member types (`SoundSynth7BankMember`, `SoundPlayMember`,
// any of `SoundMember`) and sends it with `context.sound`.

export type * from "./wire/generated/protocol.js";

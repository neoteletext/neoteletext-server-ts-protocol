// neoteletext-server-ts-protocol/protocol: program protocol 15's types, every
// message of both directions and every type they use, generated from the
// server's schema (schema/protocol-15.json) by scripts/types.ts under their
// generated names (typescript.md TS-8 to TS-15, TS-27). A program builds a
// sound as one of the member types (`SoundSynth7BankMember`, `SoundPlayMember`,
// any of `SoundMember`) and sends it with `context.sound`.

export type * from "./wire/generated/protocol.js";
// The names page-rules.md RULE-55 gives two of them, which the schema names
// for the server's types: a table's group and its sequence.
export type { GroupDeclaration as RuleGroup, SequenceDeclaration as RuleSequence } from "./wire/generated/protocol.js";

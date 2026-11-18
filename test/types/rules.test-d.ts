// A rule table is what the schema's types say (page-rules.md RULE-35,
// RULE-55): the type check refuses a table, a rule, a trigger, an action or
// a value the schema has no shape for, and a member that names what the kit
// fills.

import type { AnimationOp, ProgramMessageRulesMember, RuleAction, RuleCondition, RuleTable, RuleTrigger, RuleValue } from "../../src/protocol.ts";

const SEND = { action: "send" } as const;

export const tables: readonly unknown[] = [
  { rules: [{ name: "typed", on: { event: "text" }, do: [SEND] }] } satisfies RuleTable,
  // @ts-expect-error -- a table has its rules, even when it has none (RULE-35)
  {} satisfies RuleTable,
  // @ts-expect-error -- a rule has a trigger
  { rules: [{ name: "typed", do: [SEND] }] } satisfies RuleTable,
  // @ts-expect-error -- a `becomes` trigger carries its condition
  { event: "becomes" } satisfies RuleTrigger,
  // @ts-expect-error -- no trigger is a double click (RULE-9)
  { event: "double_click", target: "page" } satisfies RuleTrigger,
  // @ts-expect-error -- a `midi` action carries its message
  { action: "midi", channel: 0 } satisfies RuleAction,
  // @ts-expect-error -- `reset` is an animation operation of a program, not a rule's action (ANIM-21)
  { action: "reset", target: { object: 1 } } satisfies RuleAction,
  { action: "reset", target: { object: 1 } } satisfies AnimationOp,
  // @ts-expect-error -- a rule's own actions on sound and variables are no animation operation
  { action: "set", variable: "octave", value: 4 } satisfies AnimationOp,
  // @ts-expect-error -- a comparison is of a value with a constant, never with another value (RULE-18)
  { read: { of: "keys_down" }, op: "==", value: { of: "keys_down" } } satisfies RuleCondition,
  // @ts-expect-error -- a sound's value names its property
  { of: "sound", channel: 0 } satisfies RuleValue,
  { page: "101", table: null } satisfies ProgramMessageRulesMember,
  // @ts-expect-error -- the kit adds `connections` (TS-11)
  { page: "101", table: null, connections: "all" } satisfies ProgramMessageRulesMember,
];

// A rule table is what the schema's types say (page-rules.md RULE-35,
// RULE-55): the type check refuses a table, a rule, a trigger, a command or
// a value the schema has no shape for, what the second form withdrew, and a
// member that names what the kit fills.

import { modes, row } from "../../src/index.ts";
import type {
  Amount,
  AnimationOp,
  ProgramMessageRulesMember,
  RuleCommand,
  RuleCondition,
  RuleGroup,
  RuleRow,
  RuleSequence,
  RuleTable,
  RuleTarget,
  RuleTrigger,
  RuleValue,
} from "../../src/protocol.ts";

const REPORT = { type: "report" } as const;

export const tables: readonly unknown[] = [
  { rules: [{ name: "typed", on: { event: "text" }, do: [REPORT] }] } satisfies RuleTable,
  // @ts-expect-error -- a table has its rules, even when it has none (RULE-35)
  {} satisfies RuleTable,
  // @ts-expect-error -- a rule has a trigger
  { rules: [{ name: "typed", do: [REPORT] }] } satisfies RuleTable,
  // @ts-expect-error -- the sixteen variables are fixed: a table declares none (DEC-6587 item 4)
  { rules: [], variables: [] } satisfies RuleTable,
  // @ts-expect-error -- no trigger is a double click (RULE-9)
  { event: "double_click", target: "page" } satisfies RuleTrigger,
  // @ts-expect-error -- `double` is withdrawn (DEC-6635 item 7)
  { event: "double", keys: "any", ticks: 20 } satisfies RuleTrigger,
  { event: "key", keys: [{ physical: "a" }], by_row: true } satisfies RuleTrigger,
  { event: "cue", channel: 1, number: 1 } satisfies RuleTrigger,
  // @ts-expect-error -- a rule's command is a protocol message, never the first form's action (DEC-6587 item 1)
  { action: "send" } satisfies RuleCommand,
  // @ts-expect-error -- a `local_midi` command carries its message
  { type: "local_midi", channel: 0 } satisfies RuleCommand,
  // @ts-expect-error -- a group runs commands; a rule table is no command of a group (RULE-119)
  { type: "rules", table: null } satisfies RuleCommand,
  { action: "reset", target: { object: 1 } } satisfies AnimationOp,
  { action: "move", target: { object: row(41) }, x: { plus: 8, variable: "v0" }, y: 0, relative: true } satisfies AnimationOp,
  // @ts-expect-error -- a target's number is never a variable (RULE-106)
  { object: { plus: 1, variable: "v0" } } satisfies RuleTarget,
  // @ts-expect-error -- a comparison is of a value with a constant, never with another value (RULE-18)
  { read: { of: "keys_down" }, op: "==", value: { of: "keys_down" } } satisfies RuleCondition,
  modes("v3", ["play", "help"]).in("help") satisfies RuleCondition,
  modes("v3", ["play", "help"]).enter("play") satisfies RuleCommand,
  // @ts-expect-error -- a mode set's modes are its names
  modes("v3", ["play", "help"]).in("menu"),
  // @ts-expect-error -- a sound's value names its property
  { of: "sound", channel: 0 } satisfies RuleValue,
  // @ts-expect-error -- a row is one parameter, never the first form's object of four (DEC-6635 item 8)
  { p0: 60, p1: 1 } satisfies RuleRow,
  { name: "flash", commands: [REPORT] } satisfies RuleGroup,
  { name: "pulse", length: 30, repeat: 0, steps: [{ tick: 0, run: "flash" }] } satisfies RuleSequence,
  { plus: 0, fired: "p" } satisfies Amount,
  { page: "101", sub: "0001", table: null } satisfies ProgramMessageRulesMember,
  // @ts-expect-error -- a page's table names its sub-code (DEC-6599)
  { page: "101", table: null } satisfies ProgramMessageRulesMember,
  // @ts-expect-error -- the kit adds `connections` (TS-11)
  { page: "101", sub: "0001", table: null, connections: "all" } satisfies ProgramMessageRulesMember,
];

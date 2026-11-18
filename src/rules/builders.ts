// Small builders of a rule table's pieces (page-rules.md RULE-55): each only
// constructs the object the schema's type gives, and checks nothing. A
// table is otherwise written as the typed object of RULE-35. What each
// answers is stated in kit-calls.tsv, so that the Python kit's builders
// answer the same.

import type {
  FiredName,
  KeyName,
  LocalMidiEventNoteOff,
  LocalMidiEventNoteOn,
  RuleCommandLocalMidi,
  RuleKey,
  RuleValueSound,
  RuleValueTimer,
  TimerRef,
  VariableName,
} from "../wire/generated/protocol.js";

/** The key that carries `character` on a United States layout, whatever the viewer's layout (RULE-10): a musical keyboard's keys. */
export function physicalKey(character: string): RuleKey {
  return { physical: character };
}

/** The key the viewer's layout gives `character` without Shift (RULE-10). */
export function characterKey(character: string): RuleKey {
  return { char: character };
}

/** A functional key by its name (RULE-10; DOC-1936). */
export function namedKey(name: KeyName): RuleKey {
  return { name };
}

/** The output level of audio channel `channel`, 0 to 255, over the last tick (RULE-27, RULE-32): the value a meter's `becomes` rules read. */
export function level(channel: number): RuleValueSound {
  return { of: "sound", channel, property: "level" };
}

/** A variable's value, `v0` to `v15`, for a condition or a report to read (RULE-24). */
export function variable<Variable extends VariableName>(name: Variable): { readonly of: "variable"; readonly variable: Variable } {
  return { of: "variable", variable: name };
}

/** An amount (RULE-106): `amount` added to a variable's value, in a field of a group's command. */
export function plus<Variable extends VariableName>(amount: number, name: Variable): { readonly plus: number; readonly variable: Variable } {
  return { plus: amount, variable: name };
}

/** The firing row's one parameter `p`, with `amount` added (RULE-105, DEC-6635 item 8): an amount, a condition's value or a target's number. */
export function row(amount = 0): { readonly plus: number; readonly row: "p" } {
  return { plus: amount, row: "p" };
}

/** A value of the firing (RULE-116), `key`, `target`, `row`, `cue` or `p`, with `amount` added: an amount, or a target's number in an operation. */
export function fired<Property extends FiredName>(property: Property, amount = 0): { readonly plus: number; readonly fired: Property } {
  return { plus: amount, fired: property };
}

/** A timer's phase in a period of `period` ticks (RULE-25, DEC-6635 item 6): 0 at its start and at each expiry of `every period`, so a condition can ask for a beat. */
export function phase(timer: TimerRef, period: number): RuleValueTimer {
  return { of: "timer", timer, property: "phase", period };
}

/** A group's `local_midi` command that starts note `key` on part `part` of the local sound on audio channel `channel` (RULE-21). */
export function noteOn(channel: number, part: number, key: LocalMidiEventNoteOn["key"], velocity: LocalMidiEventNoteOn["velocity"]): RuleCommandLocalMidi {
  return { type: "local_midi", channel, message: { event: "note_on", channel: part, key, velocity } };
}

/** A group's `local_midi` command that ends note `key` on part `part` of the local sound on audio channel `channel` (RULE-21). */
export function noteOff(channel: number, part: number, key: LocalMidiEventNoteOff["key"], velocity: LocalMidiEventNoteOff["velocity"]): RuleCommandLocalMidi {
  return { type: "local_midi", channel, message: { event: "note_off", channel: part, key, velocity } };
}

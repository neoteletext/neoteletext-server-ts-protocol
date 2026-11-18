// A page's modes (page-rules.md RULE-110): a mode is a value of one
// variable that rules test in their conditions, since nothing else switches
// a rule on or off. The mode set only builds the condition and the command
// (RULE-55); the server and the receiver do the rest.

import type { RuleCondition, VariableName } from "../wire/generated/protocol.js";

/** The condition that a mode set's variable holds a mode's number (RULE-18's comparison). */
interface InMode<Variable extends VariableName> {
  readonly read: { readonly of: "variable"; readonly variable: Variable };
  readonly op: "==";
  readonly value: number;
}

/** The command that puts a mode set's variable to a mode's number (RULE-99). */
interface EnterMode<Variable extends VariableName> {
  readonly type: "variable";
  readonly op: "set";
  readonly variable: Variable;
  readonly value: number;
}

/** A page's modes, each a number of one variable, from 0 in the order named. */
export class Modes<Variable extends VariableName, Name extends string> {
  readonly #variable: Variable;
  readonly #names: readonly Name[];

  constructor(name: Variable, names: readonly Name[]) {
    this.#variable = name;
    this.#names = names;
  }

  /** The mode's number: its place among the names. */
  #number(mode: Name): number {
    const place = this.#names.indexOf(mode);
    if (place === -1) {
      throw new RangeError(`modes of ${this.#variable}: no mode ${JSON.stringify(mode)} among ${this.#names.join(", ")}`);
    }
    return place;
  }

  /** The condition that the page is in `mode`, joined by `and` with `condition` when one is given: a rule's `when`. */
  in(mode: Name, condition?: RuleCondition): InMode<Variable> | { readonly and: readonly [InMode<Variable>, RuleCondition] } {
    const held: InMode<Variable> = { read: { of: "variable", variable: this.#variable }, op: "==", value: this.#number(mode) };
    return condition === undefined ? held : { and: [held, condition] };
  }

  /** The command that puts the page in `mode`, seen by the conditions of later handlings and never by the one that runs it (RULE-6). */
  enter(mode: Name): EnterMode<Variable> {
    return { type: "variable", op: "set", variable: this.#variable, value: this.#number(mode) };
  }
}

/** The modes `names` of the variable `name`, numbered from 0 (RULE-110): `modes("v1", ["play", "arpeggio"])`. */
export function modes<Variable extends VariableName, const Name extends string>(name: Variable, names: readonly Name[]): Modes<Variable, Name> {
  return new Modes(name, names);
}

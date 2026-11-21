// What each connection holds, as the NeoTeletext server keeps it (DOC-1944,
// DOC-6600; the server's REQ-5548 and DEC-7065): a key, a button or a
// contact whose press a rule reported and whose release the table of the
// page it was pressed on asks for, with a `key_up` trigger whose key set
// includes the key or a `release` trigger that names the button. When the
// connection's selection changes, or the connection ends, the server gives
// the program a release of each, marked lost and named as its press was. A
// press on a page whose table asks for no release of it is not held, so
// nothing is given for it.
//
// A page whose program gave no table has the server's default table
// (page-rules.md RULE-53), as every input the harness names a rule for
// assumes: it asks for every key's and every button's release.

import type { Input, InputSource } from "../input/input.ts";
import { isCharacterKey } from "../input/keys.ts";
import type { RuleKey, RuleTable, RuleTrigger } from "../wire/generated/protocol.js";

/** The button a table's triggers know a touch contact as (the schema's `ButtonChoice`). */
const CONTACT_BUTTON = 0;

/** The cell the server gives a lost release of a button or a contact when the connection sent no pointer input. */
const NO_CELL: Cell = { column: 0, row: 0 };

/** A cell of the page: where the pointer was last. */
interface Cell {
  readonly column: number;
  readonly row: number;
}

/** A key, a button or a contact that went down. */
type Pressed =
  | { readonly kind: "key"; readonly key: string; readonly base: string | undefined }
  | { readonly kind: "button"; readonly button: number }
  | { readonly kind: "contact"; readonly contact: number };

/** Something held: what went down, the page it went down on, and the rule that reported its press. */
interface HeldPress {
  readonly pressed: Pressed;
  readonly page: number;
  readonly source: InputSource;
}

/** A release the server gives for something held: the page that held it and the input, marked lost. */
export interface LostRelease {
  readonly page: number;
  readonly input: Input;
}

/** What one connection holds, the table in force on its page, and where its pointer was last. */
interface Holding {
  /** The table its program gave its page since it selected it; with none, the default table. */
  table: RuleTable | undefined;
  held: HeldPress[];
  cell: Cell;
}

/** A table's triggers, of every rule. */
function triggersOf(table: RuleTable): readonly RuleTrigger[] {
  return table.rules.flatMap((rule) => ("event" in rule.on ? [rule.on] : rule.on));
}

/** Whether `named`, a key of a key set, names the key of a key event (page-rules.md RULE-10): a physical key is the event's `base` when it has one, else its key when that is a character (DOC-1937). */
function namesKey(named: RuleKey, key: string, base: string | undefined): boolean {
  if ("char" in named) {
    return named.char === key;
  }
  if ("name" in named) {
    return named.name === key;
  }
  return named.physical === (base ?? (isCharacterKey(key) ? key : undefined));
}

/** Whether `trigger` asks for the release of `pressed`: a `key_up` whose key set includes the key, or a `release` that names the button, whatever the rule's condition and commands. */
function asksReleaseOf(trigger: RuleTrigger, pressed: Pressed): boolean {
  if (pressed.kind === "key") {
    return trigger.event === "key_up" && (trigger.keys === "any" || trigger.keys.some((named) => namesKey(named, pressed.key, pressed.base)));
  }
  const button = pressed.kind === "button" ? pressed.button : CONTACT_BUTTON;
  return trigger.event === "release" && (trigger.button === undefined || trigger.button === "any" || trigger.button === button);
}

/** What `input` presses, if it is a press. */
function pressOf(input: Input): Pressed | undefined {
  if (input.kind === "key" && input.action === "press") {
    return { kind: "key", key: input.key, base: input.base };
  }
  if (input.kind === "mouse" && input.action === "press") {
    return { kind: "button", button: input.button };
  }
  if (input.kind === "touch" && input.action === "press") {
    return { kind: "contact", contact: input.contact };
  }
  return undefined;
}

/** Whether `input` lets go of `pressed`: its release, real or lost; a contact's gone; a pointer's gone for every button; the keyboard's loss for everything. */
function letsGo(input: Input, pressed: Pressed): boolean {
  if (input.kind === "blur") {
    return true;
  }
  if (input.kind === "key") {
    return input.action === "release" && pressed.kind === "key" && pressed.key === input.key;
  }
  if (input.kind === "mouse") {
    return pressed.kind === "button" && (input.action === "gone" || (input.action === "release" && pressed.button === input.button));
  }
  if (input.kind === "touch") {
    return (input.action === "release" || input.action === "gone") && pressed.kind === "contact" && pressed.contact === input.contact;
  }
  return false;
}

/** The rule that reported `input`, as the input names it: only what it carries. */
function sourceOf(input: Input): InputSource {
  return {
    ...(input.rule === undefined ? {} : { rule: input.rule }),
    ...(input.ruleRow === undefined ? {} : { ruleRow: input.ruleRow }),
    ...(input.tick === undefined ? {} : { tick: input.tick }),
    ...(input.target === undefined ? {} : { target: input.target }),
  };
}

/** The release of `held` the server gives, marked lost, at `cell` for a button or a contact (DOC-1969). */
function lostRelease(held: HeldPress, cell: Cell): Input {
  const { pressed, source } = held;
  if (pressed.kind === "key") {
    return { ...source, kind: "key", action: "release", key: pressed.key, lost: true };
  }
  if (pressed.kind === "button") {
    return { ...source, kind: "mouse", action: "release", button: pressed.button, ...cell, lost: true };
  }
  return { ...source, kind: "touch", action: "release", contact: pressed.contact, ...cell, lost: true };
}

/** Whether two presses are of the same key, button or contact. */
function same(one: Pressed, other: Pressed): boolean {
  if (one.kind === "key") {
    return other.kind === "key" && one.key === other.key;
  }
  if (one.kind === "button") {
    return other.kind === "button" && one.button === other.button;
  }
  return other.kind === "contact" && one.contact === other.contact;
}

/** What every connection holds. */
export class HeldInput {
  readonly #connections = new Map<number, Holding>();

  #of(connection: number): Holding {
    let holding = this.#connections.get(connection);
    if (holding === undefined) {
      holding = { table: undefined, held: [], cell: NO_CELL };
      this.#connections.set(connection, holding);
    }
    return holding;
  }

  /** The program gave the connection's page `table`, or with null took its own away, which puts the default back. */
  table(connection: number, table: RuleTable | null): void {
    this.#of(connection).table = table ?? undefined;
  }

  /** The channel was given `input` from `connection` on `page`, named with the rule that reported it: a press whose release the page's table asks for is held, and what the input lets go of is held no longer. */
  took(connection: number, page: number, input: Input): void {
    const holding = this.#of(connection);
    if (input.kind === "mouse" || input.kind === "touch" || input.kind === "wheel") {
      holding.cell = { column: input.column, row: input.row };
    }
    holding.held = holding.held.filter((held) => !letsGo(input, held.pressed));
    const pressed = pressOf(input);
    if (pressed === undefined) {
      return;
    }
    const { table } = holding;
    if (table !== undefined && !triggersOf(table).some((trigger) => asksReleaseOf(trigger, pressed))) {
      return;
    }
    holding.held = [...holding.held.filter((held) => !same(held.pressed, pressed)), { pressed, page, source: sourceOf(input) }];
  }

  /** The connection's selection changed: the releases the server gives for what it held, which it holds no longer, and its page's table is the default until its program gives one. */
  selectionChanged(connection: number): LostRelease[] {
    const holding = this.#of(connection);
    const lost = holding.held.map((held) => ({ page: held.page, input: lostRelease(held, holding.cell) }));
    holding.held = [];
    holding.table = undefined;
    return lost;
  }

  /** The connection ended: the releases the server gives for what it held, and nothing is kept of it. */
  ended(connection: number): LostRelease[] {
    const lost = this.selectionChanged(connection);
    this.#connections.delete(connection);
    return lost;
  }

  /** The server restarted: no connection is left. */
  clear(): void {
    this.#connections.clear();
  }
}

// A key's code, as a page's rule table reads the key that fired a rule
// (page-rules.md RULE-116, the value `fired` `key`): a condition's `in_set`
// and a comparison's `value` take numbers alone, so a program that asks
// "is the key that fired one of these" writes each key's code, which is
// this function's answer and never a figure of the program's own.

import { FUNCTIONAL_KEY_NAMES } from "./functional-keys.ts";
import type { RuleKey } from "../wire/generated/protocol.js";

/** Each functional key's code by its name: its place in the engine's table (DOC-1936). */
const CODES: ReadonlyMap<string, number> = new Map([...FUNCTIONAL_KEY_NAMES.entries()].filter(([, name]) => name !== "").map(([code, name]) => [name, code]));

/**
 * The code of `key` as the value `fired` `key` gives it (RULE-116, RULE-10):
 * a named key's functional code in the engine's table (DOC-1936), and a
 * character key's Unicode scalar value. `undefined` for a physical key,
 * whose code is the character the viewer's layout gives it, which a page
 * cannot know; for a name the table lacks; and for a `char` that is not one
 * character. It checks nothing else: a letter is given in lower case, as
 * the server asks of a key set (RULE-10).
 *
 * The two kinds share one range of numbers, and the value does not say
 * which kind fired: `ColorF0Red`'s code is also the scalar value of `\`,
 * and each of `F12` to `F35`, the keypad's keys, the located modifiers
 * `ShiftLeft` to `MetaRight` (codes 80 to 91, the values of `P` to `[`) and
 * the keys from `ColorF0Red` to `AudioVolumeDown` has a printable
 * character's value. A condition that must tell them apart also tests
 * something else.
 */
export function keyCode(key: RuleKey): number | undefined {
  if ("name" in key) {
    return CODES.get(key.name);
  }
  if ("char" in key) {
    const [character, ...more] = Array.from(key.char);
    return more.length === 0 ? character?.codePointAt(0) : undefined;
  }
  return undefined;
}

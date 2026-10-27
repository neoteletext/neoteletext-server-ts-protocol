// What an input typed. Typing comes two ways (INPUT.md sections 5.3 and
// 6.3): a key's press carries the text it produced, and raw text carries
// what no key did; a paste is data, never typing.

import type { Input } from "./input.ts";
import type { KeyAction } from "./keys.ts";

/** Control characters, C0, DEL and C1 (Unicode's `Cc`): never text (INPUT.md section 5.3). */
export const CONTROL_CHARACTER = /\p{Cc}/u;

/** The text a key's press or repeat produced, if it typed any: a release types nothing, and a key whose text is a control character (Enter, Tab) is a key, not typing. */
export function keyText(action: KeyAction, text: string | undefined): string | undefined {
  return action === "release" || text === undefined || text.length === 0 || CONTROL_CHARACTER.test(text) ? undefined : text;
}

/**
 * The text this input typed, if any. Typing comes two ways (INPUT.md
 * sections 5.3 and 6.3): a key's press or repeat carries the text it
 * produced, and raw text carries what no key did, an input method's or a
 * phone's. A paste is data, never typing.
 */
export function typed(input: Input): string | undefined {
  if (input.kind === "text") {
    return input.text;
  }
  return input.kind === "key" ? keyText(input.action, input.text) : undefined;
}

/** The character this input typed, if it typed exactly one: from raw text or a key's press or repeat; a key that produced no text (Control and a letter) types nothing. */
export function character(input: Input): string | undefined {
  const text = typed(input);
  const characters = text === undefined ? [] : Array.from(text);
  return characters.length === 1 ? characters[0] : undefined;
}

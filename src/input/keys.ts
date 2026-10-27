// Keys as the server names them: W3C `KeyboardEvent.key` names (INPUT.md
// section 5.6).

import type { Input } from "./input.ts";

/** Key names: W3C `KeyboardEvent.key` names, as INPUT.md section 5.6 names the functional keys. */
export const Key = {
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Enter: "Enter",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  Red: "ColorF0Red",
  Green: "ColorF1Green",
  Yellow: "ColorF2Yellow",
  Blue: "ColorF3Blue",
} as const;

export type KeyAction = "press" | "repeat" | "release";

/** What the pointer did at a control: came onto it or went off it. */
export type HoverAction = "enter" | "leave";

/** Whether `key` names a character key: one character, the layout's, rather than a functional key's name. */
export function isCharacterKey(key: string): boolean {
  return Array.from(key).length === 1;
}

/** Whether this is a press (or a repeat) of `key`. */
export function pressed(input: Input, key: string): boolean {
  return input.kind === "key" && (input.action === "press" || input.action === "repeat") && input.key === key;
}

export function released(input: Input, key: string): boolean {
  return input.kind === "key" && input.action === "release" && input.key === key;
}

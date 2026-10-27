// What a viewer did, as the server sends it (docs/applications.md section 2;
// INPUT.md).

import type { HoverAction, KeyAction } from "./keys.ts";

/** One thing the viewer did on the page open with the keys. */
export type Input =
  /** Text typed: whole characters. */
  | { readonly kind: "text"; readonly text: string }
  /** A key pressed, repeating or released: every one is sent, with the `text` it produced and its `base` when that differs (INPUT.md sections 5.5 and 6.3). */
  | { readonly kind: "key"; readonly action: KeyAction; readonly key: string; readonly text?: string; readonly base?: string }
  /** A mouse button pressed or released on a cell. */
  | { readonly kind: "mouse"; readonly action: "press" | "release"; readonly button: number; readonly column: number; readonly row: number }
  /** The pointer moved over the page, a button held or not (INPUT.md section 6.3); `buttons` are those held, a bit each ({@link Held}). */
  | { readonly kind: "mouse"; readonly action: "move"; readonly buttons: number; readonly column: number; readonly row: number }
  /** The wheel turned over a cell, in 1/120ths of a line, positive right and down. */
  | { readonly kind: "wheel"; readonly dx: number; readonly dy: number; readonly column: number; readonly row: number }
  /** The pointer entered a control of the page or left it (INPUT.md section 5.4, HOVER): `column` and `row` are the control's first cell, its top-left, as the page declared it; a move from one control to the next is a leave, then an enter. */
  | { readonly kind: "hover"; readonly action: HoverAction; readonly column: number; readonly row: number }
  /** A paste: data, never keystrokes. */
  | { readonly kind: "paste"; readonly text: string }
  /** The keys came to the page. */
  | { readonly kind: "focus" }
  /** The keys left it: release what is held. */
  | { readonly kind: "blur" };

/** The mouse's buttons (INPUT.md section 5.4). */
export const Button = { Left: 0, Middle: 1, Right: 2 } as const;

/** The buttons a move says are held, a bit each (docs/applications.md section 2). */
export const Held = { Left: 1 << Button.Left, Middle: 1 << Button.Middle, Right: 1 << Button.Right } as const;

/** Whether this is the main button pressed: a click. */
export function clicked(input: Input): boolean {
  return input.kind === "mouse" && input.action === "press" && input.button === Button.Left;
}

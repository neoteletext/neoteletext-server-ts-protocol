// What a viewer did, as the server sends it (docs/applications.md section 2;
// DOC-1969).

import type { HoverAction, KeyAction } from "./keys.ts";

/** What comes with the pointer: the `mods` held, when any is, as {@link Mods} bits, and the dot of the page image under it, `px` across and `py` down, when the receiver knows it. */
export interface Pointed {
  readonly mods?: number;
  readonly px?: number;
  readonly py?: number;
}

/**
 * One thing the viewer did on the page on screen. A release with `lost` is
 * one the page lost: the key or button did not come up, because the viewer
 * moved away, the keys left the page or the connection went (REQ-207). It
 * is no click.
 */
export type Input =
  /** Text typed: whole characters. */
  | { readonly kind: "text"; readonly text: string }
  /** A key pressed, repeating or released: every one is sent, with the `text` it produced, its `base` when that differs, and the `mods` held (DOC-1935). */
  | {
      readonly kind: "key";
      readonly action: KeyAction;
      readonly key: string;
      readonly mods?: number;
      readonly text?: string;
      readonly base?: string;
      readonly lost?: true;
    }
  /** A mouse button pressed or released on a cell, with what comes with the pointer. */
  | ({
      readonly kind: "mouse";
      readonly action: "press" | "release";
      readonly button: number;
      readonly column: number;
      readonly row: number;
      readonly lost?: true;
    } & Pointed)
  /** The pointer moved over the page, a button held or not (DOC-1945); `buttons` are those held, a bit each ({@link Held}). */
  | ({ readonly kind: "mouse"; readonly action: "move"; readonly buttons: number; readonly column: number; readonly row: number } & Pointed)
  /** The wheel turned over a cell, in 1/120ths of a line, positive right and down. */
  | ({ readonly kind: "wheel"; readonly dx: number; readonly dy: number; readonly column: number; readonly row: number } & Pointed)
  /** The pointer entered a control of the page or left it (DOC-1940): `column` and `row` are the control's first cell, its top-left, as the page declared it; a move from one control to the next is a leave, then an enter. */
  | { readonly kind: "hover"; readonly action: HoverAction; readonly column: number; readonly row: number }
  /** An input method's text as it stands while it is being composed, `cursor` code points in; empty when composing ended (DOC-1969). What it commits comes as `text`. */
  | { readonly kind: "compose"; readonly cursor: number; readonly text: string }
  /** A paste: data, never keystrokes. */
  | { readonly kind: "paste"; readonly text: string }
  /** The page has the keyboard's focus. */
  | { readonly kind: "focus" }
  /** The page lost the keyboard's focus; it stays selected and is still kept up to date. */
  | { readonly kind: "blur" };

/** The modifier keys, a bit each, as DOC-1935 numbers them: Control-C comes as the key `c` with {@link Mods.Control} in `mods`. */
export const Mods = { Shift: 1, Alt: 2, Control: 4, Super: 8, Hyper: 16, Meta: 32, CapsLock: 64, NumLock: 128 } as const;

/** The mouse's buttons (DOC-1938). */
export const Button = { Left: 0, Middle: 1, Right: 2 } as const;

/** The buttons a move says are held, a bit each (docs/applications.md section 2). */
export const Held = { Left: 1 << Button.Left, Middle: 1 << Button.Middle, Right: 1 << Button.Right } as const;

/** Whether this is the main button pressed: a click. */
export function clicked(input: Input): boolean {
  return input.kind === "mouse" && input.action === "press" && input.button === Button.Left;
}

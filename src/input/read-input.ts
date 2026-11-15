// An input event as the server writes it, which the schema has checked
// (validate.ts), as the kit's own Input.

import { Button, Held, type Input, type Pointed } from "./input.ts";
import type { WireButtons, WireInputEvent } from "../wire/server-wire.ts";

/** The modifiers held, when any is. */
function modsOf(mods: number): { readonly mods?: number } {
  return mods === 0 ? {} : { mods };
}

/** The modifiers held and the dot under the pointer, each when there is one. */
function pointedOf(event: { readonly mods: number; readonly px?: number | null | undefined; readonly py?: number | null | undefined }): Pointed {
  const { px, py } = event;
  return { ...modsOf(event.mods), ...(px === null || px === undefined ? {} : { px }), ...(py === null || py === undefined ? {} : { py }) };
}

/** The buttons a move says are held, as bits ({@link Held}). */
function heldOf(buttons: WireButtons | null | undefined): number {
  if (buttons === null || buttons === undefined) {
    return 0;
  }
  return (buttons.left ? Held.Left : 0) | (buttons.middle ? Held.Middle : 0) | (buttons.right ? Held.Right : 0);
}

/** An event as the kit's Input; `lost` marks a release the page lost. */
export function readInput(event: WireInputEvent, lost: boolean): Input {
  const marked = lost ? ({ lost: true } as const) : {};
  if (event.kind === "key") {
    const { action, key } = event;
    const text = event.text ?? undefined;
    const base = event.base ?? undefined;
    return { kind: "key", action, key, ...modsOf(event.mods), ...(text === undefined ? {} : { text }), ...(base === undefined ? {} : { base }), ...marked };
  }
  if (event.kind === "mouse") {
    const { column, row } = event;
    if (event.action === "move") {
      return { kind: "mouse", action: "move", buttons: heldOf(event.buttons), column, row, ...pointedOf(event) };
    }
    if (event.action === "gone") {
      return { kind: "mouse", action: "gone", column, row, ...pointedOf(event) };
    }
    return { kind: "mouse", action: event.action, button: event.button ?? Button.Left, column, row, ...pointedOf(event), ...marked };
  }
  if (event.kind === "touch") {
    const { action, contact, column, row } = event;
    return { kind: "touch", action, contact, column, row, ...pointedOf({ mods: 0, px: event.px, py: event.py }), ...(action === "release" ? marked : {}) };
  }
  if (event.kind === "wheel") {
    return { kind: "wheel", dx: event.dx, dy: event.dy, column: event.column, row: event.row, ...pointedOf(event) };
  }
  if (event.kind === "hover") {
    return { kind: "hover", action: event.action, column: event.column, row: event.row };
  }
  if (event.kind === "pick") {
    const { drawing, x, y, commits } = event;
    return { kind: "pick", drawing, x, y, pictureX: event.picture_x, pictureY: event.picture_y, commits };
  }
  if (event.kind === "drawing_hover") {
    return { kind: "drawingHover", drawing: event.drawing, leave: event.leave, commits: event.commits };
  }
  if (event.kind === "compose") {
    return { kind: "compose", cursor: event.cursor, text: event.text };
  }
  if (event.kind === "text" || event.kind === "paste") {
    return { kind: event.kind, text: event.text };
  }
  return { kind: event.kind };
}

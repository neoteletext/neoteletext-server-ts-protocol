// An input event as the server writes it, which the schema has checked
// (validate.ts), as the kit's own Input.

import { Button, Held, type Input } from "./input.ts";
import type { WireButtons, WireInputEvent } from "../wire/protocol.ts";

/** The buttons a move says are held, as bits ({@link Held}). */
function heldOf(buttons: WireButtons | null | undefined): number {
  if (buttons === null || buttons === undefined) {
    return 0;
  }
  return (buttons.left ? Held.Left : 0) | (buttons.middle ? Held.Middle : 0) | (buttons.right ? Held.Right : 0);
}

/** An event as the kit's Input. */
export function readInput(event: WireInputEvent): Input {
  if (event.kind === "key") {
    const { action, key } = event;
    const text = event.text ?? undefined;
    const base = event.base ?? undefined;
    return { kind: "key", action, key, ...(text === undefined ? {} : { text }), ...(base === undefined ? {} : { base }) };
  }
  if (event.kind === "mouse") {
    const { column, row } = event;
    if (event.action === "move") {
      return { kind: "mouse", action: "move", buttons: heldOf(event.buttons), column, row };
    }
    return { kind: "mouse", action: event.action, button: event.button ?? Button.Left, column, row };
  }
  if (event.kind === "wheel") {
    return { kind: "wheel", dx: event.dx, dy: event.dy, column: event.column, row: event.row };
  }
  if (event.kind === "hover") {
    return { kind: "hover", action: event.action, column: event.column, row: event.row };
  }
  if (event.kind === "text" || event.kind === "paste") {
    return { kind: event.kind, text: event.text };
  }
  return { kind: event.kind };
}

// The rule the server's default table would send an input by (page-rules.md
// RULE-53): the names a channel with `default_rules: send_all` sees in its
// inputs' `rule`, which the harness gives an input a test sends without
// naming one.

import type { Input } from "../input/input.ts";

/** The pointer's inputs: a button or a contact down, up, or anything else, which the default table's `move` rule sends. */
function pointerRule(action: "press" | "release" | "move" | "gone"): string {
  return action === "press" || action === "release" ? action : "move";
}

/** The default table's rule for `input`, by its kind (RULE-53). A `pick` follows the pointer input before it and carries that input's rule (RULE-37), which a test names; unnamed, it is a press's. */
export function defaultRule(input: Input): string {
  if (input.kind === "key") {
    return input.action === "release" ? "keys_up" : "keys";
  }
  if (input.kind === "text" || input.kind === "compose" || input.kind === "paste") {
    return "text";
  }
  if (input.kind === "mouse" || input.kind === "touch") {
    return pointerRule(input.action);
  }
  if (input.kind === "pick") {
    return "press";
  }
  if (input.kind === "hover") {
    return input.action === "enter" ? "hover_in" : "hover_out";
  }
  if (input.kind === "drawingHover") {
    return input.leave ? "drawing_out" : "drawing_in";
  }
  // The wheel and the keyboard's focus: the default table names each rule for its event.
  return input.kind;
}

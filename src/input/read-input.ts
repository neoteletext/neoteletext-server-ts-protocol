// An input event as the server writes it, checked field by field and
// bounded, since what the server sends is read like any other input.

import { Button, Held, type Input } from "./input.ts";
import { type Fields, isFields } from "../wire/fields.ts";
import { LONGEST_LINE } from "../wire/limits.ts";

/** The highest button number INPUT.md section 5.4 sends. */
const LAST_BUTTON = Button.Right;

const ALL_HELD = Held.Left | Held.Middle | Held.Right;

/** The longest text one event may carry: the server's line. */
const LONGEST_TEXT = LONGEST_LINE;

/** The longest key name INPUT.md section 5.6 has ("BrowserFavorites" and the like), with room. */
const LONGEST_KEY_NAME = 64;

/** The largest cell coordinate: a page is 40 by 25, and INPUT.md bounds a position by a 32-bit field. */
const LARGEST_COORDINATE = 0xffff_ffff;

/** The largest wheel turn either way in one event (INPUT.md section 5.4: a signed 32-bit count). */
const LARGEST_TURN = 0x7fff_ffff;

function text(fields: Fields, name: string, longest: number): string | undefined {
  const value = fields[name];
  return typeof value === "string" && value.length <= longest ? value : undefined;
}

function whole(fields: Fields, name: string, least: number, most: number): number | undefined {
  const value = fields[name];
  return typeof value === "number" && Number.isInteger(value) && value >= least && value <= most ? value : undefined;
}

/** A text or a paste: the text, bounded by the server's line. */
function readText(fields: Fields, kind: "text" | "paste"): Input | string {
  const typed = text(fields, "text", LONGEST_TEXT);
  return typed === undefined ? `event: ${kind} needs text` : { kind, text: typed };
}

/** A key: its action and name, and the text it produced and its base key where the server sends them. */
function readKey(fields: Fields): Input | string {
  const action = fields["action"];
  const key = text(fields, "key", LONGEST_KEY_NAME);
  if ((action !== "press" && action !== "repeat" && action !== "release") || key === undefined || key.length === 0) {
    return "event: a key needs an action and a key";
  }
  const typed = fields["text"] === undefined ? undefined : text(fields, "text", LONGEST_TEXT);
  const base = fields["base"] === undefined ? undefined : text(fields, "base", LONGEST_KEY_NAME);
  if ((fields["text"] !== undefined && typed === undefined) || (fields["base"] !== undefined && base === undefined)) {
    return "event: a key's text and base are text";
  }
  return { kind: "key", action, key, ...(typed === undefined ? {} : { text: typed }), ...(base === undefined ? {} : { base }) };
}

/** A mouse button's press or release on a cell, or the pointer's move with the buttons held. */
function readMouse(fields: Fields): Input | string {
  const action = fields["action"];
  const column = whole(fields, "column", 0, LARGEST_COORDINATE);
  const row = whole(fields, "row", 0, LARGEST_COORDINATE);
  if (column === undefined || row === undefined) {
    return "event: a mouse event needs a column and a row";
  }
  if (action === "move") {
    const buttons = whole(fields, "buttons", 0, ALL_HELD);
    return buttons === undefined ? "event: a move needs the buttons held" : { kind: "mouse", action, buttons, column, row };
  }
  const button = whole(fields, "button", 0, LAST_BUTTON);
  if ((action !== "press" && action !== "release") || button === undefined) {
    return "event: a mouse event needs an action, press, release or move, and a press or release a button";
  }
  return { kind: "mouse", action, button, column, row };
}

function readWheel(fields: Fields): Input | string {
  const dx = whole(fields, "dx", -LARGEST_TURN, LARGEST_TURN);
  const dy = whole(fields, "dy", -LARGEST_TURN, LARGEST_TURN);
  const column = whole(fields, "column", 0, LARGEST_COORDINATE);
  const row = whole(fields, "row", 0, LARGEST_COORDINATE);
  if (dx === undefined || dy === undefined || column === undefined || row === undefined) {
    return "event: a wheel event needs dx, dy, column and row";
  }
  return { kind: "wheel", dx, dy, column, row };
}

function readHover(fields: Fields): Input | string {
  const action = fields["action"];
  const column = whole(fields, "column", 0, LARGEST_COORDINATE);
  const row = whole(fields, "row", 0, LARGEST_COORDINATE);
  if ((action !== "enter" && action !== "leave") || column === undefined || row === undefined) {
    return "event: a hover needs an action, enter or leave, a column and a row";
  }
  return { kind: "hover", action, column, row };
}

/** An event as the server writes it, checked; or why it is not one. */
export function readInput(value: unknown): Input | string {
  if (!isFields(value)) {
    return "event: an object is needed";
  }
  const kind = value["kind"];
  switch (kind) {
    case "text":
    case "paste": {
      return readText(value, kind);
    }
    case "key": {
      return readKey(value);
    }
    case "mouse": {
      return readMouse(value);
    }
    case "wheel": {
      return readWheel(value);
    }
    case "hover": {
      return readHover(value);
    }
    case "focus":
    case "blur": {
      return { kind };
    }
    default: {
      return `event: unknown kind ${JSON.stringify(kind) ?? "undefined"}`;
    }
  }
}

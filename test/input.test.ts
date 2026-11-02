import assert from "node:assert/strict";
import { test } from "node:test";

import { Button, character, clicked, decimalDigit, Held, type Input, Key, pressed, readMessage, released, typed } from "../src/index.ts";

/** An input event as the server's line carries it, read whole. */
function read(event: unknown): Input | string {
  const message = readMessage(JSON.stringify({ type: "input", connection: 1, page: "100", sub: "0000", lost: false, event }));
  if (typeof message === "string") {
    return message;
  }
  return message.type === "input" ? message.input : "not input";
}

test("every kind of event the server writes is read", () => {
  assert.deepEqual(read({ kind: "text", text: "hi" }), { kind: "text", text: "hi" });
  assert.deepEqual(read({ kind: "paste", text: "data" }), { kind: "paste", text: "data" });
  assert.deepEqual(read({ kind: "key", action: "press", key: "ArrowUp", text: null, base: null }), { kind: "key", action: "press", key: "ArrowUp" });
  assert.deepEqual(read({ kind: "key", action: "repeat", key: "a", text: "A", base: "a" }), { kind: "key", action: "repeat", key: "a", text: "A", base: "a" });
  assert.deepEqual(read({ kind: "mouse", action: "press", button: 2, buttons: null, column: 39, row: 24 }), {
    kind: "mouse",
    action: "press",
    button: 2,
    column: 39,
    row: 24,
  });
  assert.deepEqual(read({ kind: "mouse", action: "move", button: null, buttons: { left: true, middle: false, right: true }, column: 39, row: 12 }), {
    kind: "mouse",
    action: "move",
    buttons: Held.Left | Held.Right,
    column: 39,
    row: 12,
  });
  assert.deepEqual(read({ kind: "wheel", dx: 0, dy: -120, column: 1, row: 2 }), { kind: "wheel", dx: 0, dy: -120, column: 1, row: 2 });
  assert.deepEqual(read({ kind: "hover", action: "enter", column: 2, row: 20 }), { kind: "hover", action: "enter", column: 2, row: 20 });
  assert.deepEqual(read({ kind: "focus" }), { kind: "focus" });
  assert.deepEqual(read({ kind: "blur" }), { kind: "blur" });
});

test("an event that is not whole is refused by the schema, with the path and the rule", () => {
  for (const bad of [
    null,
    { kind: "text" },
    { kind: "text", text: 7 },
    { kind: "key", action: "hold", key: "a" },
    { kind: "key", action: "press", key: "" },
    { kind: "key", action: "press", key: "NoSuchKey" },
    { kind: "mouse", action: "press", button: 3, column: 0, row: 0 },
    { kind: "mouse", action: "press", button: 0, column: 40, row: 0 },
    { kind: "wheel", dx: 0.5, dy: 0, column: 0, row: 0 },
    { kind: "hover", column: 0, row: 1 },
    { kind: "telepathy" },
  ]) {
    assert.match(JSON.stringify(read(bad)), /event/u, JSON.stringify(bad));
  }
});

test("presses, releases and characters are as the runtime's Input reads them", () => {
  const press: Input = { kind: "key", action: "press", key: Key.Enter };
  const repeat: Input = { kind: "key", action: "repeat", key: Key.Enter };
  const release: Input = { kind: "key", action: "release", key: Key.Enter };
  assert.ok(pressed(press, Key.Enter) && pressed(repeat, Key.Enter) && !pressed(release, Key.Enter));
  assert.ok(released(release, Key.Enter) && !released(press, Key.Enter));
  assert.equal(character({ kind: "text", text: "é" }), "é");
  assert.equal(character({ kind: "text", text: "\u{1F600}" }), "\u{1F600}", "one character, two UTF-16 units");
  assert.equal(character({ kind: "text", text: "ab" }), undefined);
  assert.equal(character({ kind: "key", action: "press", key: "a", text: "A" }), "A", "the text the press produced");
  assert.equal(character({ kind: "key", action: "repeat", key: "a", text: "a" }), "a", "a repeat types again");
  assert.equal(character({ kind: "key", action: "press", key: "a" }), undefined, "a key that produced no text (Control and a letter) types nothing");
  assert.equal(character({ kind: "key", action: "release", key: "a", text: "a" }), undefined, "a release types nothing");
  assert.equal(character({ kind: "key", action: "press", key: "Numpad5", text: "5" }), "5", "a functional key's text is typed: the keypad");
  assert.equal(character({ kind: "key", action: "press", key: Key.Enter, text: "\r" }), undefined, "a control character is the key's, not text");
  assert.equal(character({ kind: "key", action: "press", key: Key.F1 }), undefined, "a functional key types nothing");
  assert.equal(character({ kind: "paste", text: "a" }), undefined);
});

test("typing comes from a key's press or repeat with its text, and from raw text, never a paste (DOC-1930 and DOC-1935)", () => {
  assert.equal(typed({ kind: "key", action: "press", key: "e", text: "\u00E9" }), "\u00E9", "a dead key's composed character");
  assert.equal(typed({ kind: "key", action: "press", key: "e", text: "\u00B4e" }), "\u00B4e", "a dead key that did not compose: both characters");
  assert.equal(typed({ kind: "text", text: "\u4F60\u597D" }), "\u4F60\u597D", "an input method's committed text");
  assert.equal(typed({ kind: "key", action: "release", key: "e", text: "e" }), undefined);
  assert.equal(typed({ kind: "key", action: "press", key: "Dead" }), undefined, "the dead key itself");
  assert.equal(typed({ kind: "paste", text: "a" }), undefined);
});

test("the decimal digits of every script are 0 to 9 (DOC-1937)", () => {
  assert.equal(decimalDigit("7"), 7);
  assert.equal(decimalDigit("0"), 0);
  assert.equal(decimalDigit("٣"), 3, "Arabic-Indic");
  assert.equal(decimalDigit("۵"), 5, "extended Arabic-Indic");
  assert.equal(decimalDigit("३"), 3, "Devanagari");
  assert.equal(decimalDigit("๙"), 9, "Thai");
  assert.equal(decimalDigit("９"), 9, "full width");
  assert.equal(decimalDigit("\u{1D7D7}"), 9, "the first of the touching mathematical runs");
  assert.equal(decimalDigit("\u{1D7FF}"), 9, "the last of them");
  assert.equal(decimalDigit("\u{116E3}"), 9, "the second of two touching runs");
  for (const notADigit of ["a", "/", ":", "½", "Ⅳ", "²", "ٟ", "\u0000"]) {
    assert.equal(decimalDigit(notADigit), undefined, notADigit);
  }
});

test("a click is the main button pressed, and only that", () => {
  assert.ok(clicked({ kind: "mouse", action: "press", button: Button.Left, column: 0, row: 0 }));
  assert.ok(!clicked({ kind: "mouse", action: "release", button: Button.Left, column: 0, row: 0 }));
  assert.ok(!clicked({ kind: "mouse", action: "press", button: Button.Right, column: 0, row: 0 }));
  assert.ok(!clicked({ kind: "mouse", action: "move", buttons: Held.Left, column: 0, row: 0 }));
  assert.ok(!clicked({ kind: "key", action: "press", key: Key.Enter }));
});

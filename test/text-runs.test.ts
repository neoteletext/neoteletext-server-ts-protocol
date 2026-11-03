// Text on a screen as runs for the server to encode (REQ-2214), and the
// header, which is the program's own codes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { cellsOf, Colour, LANGUAGE_TAGS, Screen, textColour } from "../src/index.ts";
import { SERVER_LANGUAGES } from "../src/testing/index.ts";

test("REQ-2214: text is a run in its language for the server to encode, over codes that read back where they are ASCII", () => {
  const screen = new Screen();
  screen.language("en");
  screen.text(1, 0, "#1 £5 [x]");
  screen.coloured(2, 0, Colour.Yellow, "Привет", "ru");
  const content = screen.content();
  assert.equal(content.language, "en");
  assert.equal(content.character_set, undefined, "a page with a language names no character set");
  assert.deepEqual(content.text, [
    { row: 1, column: 0, text: "#1 £5 [x]" },
    { row: 2, column: 1, text: "Привет", language: "ru" },
  ]);
  assert.equal(screen.rowText(1).trimEnd(), "#1  5 [x]", "a character that is not ASCII is a space under its run");
  assert.equal(screen.at(2, 0), textColour(Colour.Yellow));
  assert.throws(() => screen.toTti(0x100, 0), /server to encode/u, "TTI holds codes only");
});

test("a character with its combining marks takes one cell, and a control is a space", () => {
  const screen = new Screen();
  screen.text(3, 0, "e\u0301a\u0007b");
  screen.text(4, 0, "กี่");
  assert.deepEqual(screen.content().text, [
    { row: 3, column: 0, text: "éa b" },
    { row: 4, column: 0, text: "กี่" },
  ]);
  assert.equal(cellsOf("กี่"), 1, "Thai marks go to the mark rows");
});

test("what is written over a run cuts it, and a right-to-left run covered anywhere goes whole", () => {
  const screen = new Screen();
  screen.text(5, 0, "abcdefgh");
  screen.codes(5, 3, [textColour(Colour.Red)]);
  screen.text(6, 0, "שלום עולם", "he");
  screen.code(6, 2, textColour(Colour.Red));
  screen.text(7, 0, "one");
  screen.text(7, 2, "XY");
  assert.deepEqual(screen.content().text, [
    { row: 5, column: 0, text: "abc" },
    { row: 5, column: 4, text: "efgh" },
    { row: 7, column: 0, text: "onXY" },
  ]);
  assert.equal(screen.rowText(6).trim(), String.fromCodePoint(textColour(Colour.Red)), "the Hebrew run's cells are spaces");
});

test("runs of a row and language that only spaces part go as one, at most 40 characters", () => {
  const screen = new Screen();
  screen.text(8, 0, "left");
  screen.text(8, 10, "right");
  screen.text(8, 20, "Мир", "ru");
  screen.text(9, 0, "a".repeat(30));
  screen.text(9, 30, "b".repeat(10));
  screen.text(10, 0, "x");
  screen.code(10, 1, textColour(Colour.Red));
  screen.text(10, 2, "y");
  assert.deepEqual(screen.content().text, [
    { row: 8, column: 0, text: "left      right" },
    { row: 8, column: 20, text: "Мир", language: "ru" },
    { row: 9, column: 0, text: `${"a".repeat(30)}${"b".repeat(10)}` },
    { row: 10, column: 0, text: "x" },
    { row: 10, column: 2, text: "y" },
  ]);
});

test("a run of more than 40 characters is cut between cells, a right-to-left one from the right", () => {
  const marked = "x\u0301".repeat(30);
  const screen = new Screen();
  screen.text(11, 0, marked);
  const runs = screen.content().text ?? [];
  assert.deepEqual(
    runs.map(({ column, text: written }) => [column, Array.from(written).length]),
    [
      [0, 40],
      [20, 20],
    ],
  );
  const arabic = "\u0628\u064E".repeat(30);
  const right = new Screen();
  right.text(12, 0, arabic, "ar");
  assert.deepEqual(
    (right.content().text ?? []).map(({ column, text: written }) => [column, Array.from(written).length]),
    [
      [10, 40],
      [0, 20],
    ],
    "the text's start takes the rightmost cells",
  );
});

test("more than 64 runs is refused when the page is made", () => {
  const screen = new Screen();
  for (let row = 1; row <= 22; row += 1) {
    for (const column of [0, 10, 20]) {
      screen.coloured(row, column, Colour.White, "x");
    }
  }
  assert.throws(() => screen.content(), /at most 64 runs/u);
});

test("the header is the program's own codes: letters, digits and the signs every national option shares", () => {
  const screen = new Screen();
  screen.header("NeoTeletext 100 3 Nov");
  assert.equal(screen.rowText(0).trimEnd(), "        NeoTeletext 100 3 Nov");
  assert.equal(screen.content().text, undefined, "the header is no run");
  for (const sign of ["#", "£", "["]) {
    assert.throws(() => {
      screen.header(sign);
    }, /server does not encode/u);
  }
});

test("REQ-2215: the kit's languages' tags are the schema's, in its order, and the server's start lists each", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "schema", "protocol-8.json"), "utf8");
  // The schema's $defs/LanguageTag, read as text so the test assumes nothing of its shape but the list.
  const found = /"LanguageTag": \{[^}]*?"enum": (\[[^\]]*\])/su.exec(text)?.[1];
  assert.ok(found !== undefined, "the schema lists the tags");
  const listed: unknown = JSON.parse(found);
  assert.deepEqual([...LANGUAGE_TAGS], listed);
  assert.deepEqual(
    SERVER_LANGUAGES.map(({ tag }) => tag),
    listed,
  );
});

test("a space needs no run: runs either side of one join over it, but a right-to-left run keeps its spaces", () => {
  const screen = new Screen();
  screen.text(3, 0, "  ");
  screen.text(4, 0, " a b ");
  screen.text(5, 0, "שלום עולם", "he");
  assert.deepEqual(screen.content().text, [
    { row: 4, column: 1, text: "a b" },
    { row: 5, column: 0, text: "שלום עולם", language: "he" },
  ]);
});

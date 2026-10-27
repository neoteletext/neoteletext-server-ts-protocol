// Page selection on a channel: digits and colour keys on the pages that
// do not take them, and clicks on prompts and page numbers.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, Button, Colour, Held, Key, type PageEntry } from "../src/index.ts";
import { Harness, shows } from "../src/testing/index.ts";
import { Recorder, screen } from "./recorder.ts";

test("digits and colour keys navigate on a page that does not use them, and reach one that does", () => {
  const index = new Recorder([
    { page: 0x100, title: "Index" },
    { page: 0x101, title: "News" },
  ]);
  const games = new Recorder([{ page: 0x200, title: "Games", ownsDigits: true }]);
  const harness = new Harness([index, games]);
  harness.join(1, 0x100);
  harness.typeText(1, "200");
  assert.deepEqual(harness.gotos(1), [0x200]);
  harness.press(1, Key.F2);
  assert.deepEqual(harness.gotos(1), [0x200, 0x101], "green follows the page's green link");
  assert.ok(
    index.heard.every((line) => !line.startsWith("input")),
    "navigation took them",
  );
  harness.typeText(1, "x");
  assert.equal(index.heard.at(-1), `input 1 100 {"kind":"text","text":"x"}`);

  harness.open(1, 0x200);
  harness.typeText(1, "101");
  assert.equal(games.heard.at(-1), `input 1 200 {"kind":"text","text":"101"}`, "the page's own digits");
  assert.deepEqual(harness.gotos(1), [0x200, 0x101]);
});

test("colour keys follow the links of the copy the viewer sees", () => {
  const own: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, screen("shared", [0x101, null, null, null]));
    },
    opened: (session, page, context) => {
      context.publish(session, page, screen("own", [0x102, null, null, null]));
    },
  };
  const harness = new Harness([own]);
  harness.join(1, 0x100);
  harness.join(2, 0x100);
  harness.press(1, Key.Red);
  assert.deepEqual(harness.gotos(1), [0x102]);
  assert.ok(shows(harness.own(1, 0x100), "own"));
  assert.ok(shows(harness.shared(0x100), "shared"));
  harness.close(1);
  harness.join(1, 0x100);
  assert.ok(shows(harness.own(1, 0x100), "own"));
});

test("a released copy leaves the viewer the channel's, its links with it", () => {
  const greeting: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index", section: "Front" }],
    start: (context): void => {
      context.publish("channel", 0x100, screen("shared", [0x101, null, null, null]));
    },
    opened: (session, page, context) => {
      context.publish(session, page, screen("hello", [0x102, null, null, null]));
    },
    input: (session, page, _input, context) => {
      context.release(session, page);
      context.release(session, page);
    },
  };
  const harness = new Harness([greeting]);
  assert.deepEqual(harness.sent[0], { type: "pages", pages: [{ page: "100", title: "Index", section: "Front" }] }, "the section is declared");
  harness.join(1, 0x100);
  assert.ok(shows(harness.own(1, 0x100), "hello"));
  harness.typeText(1, "x");
  assert.equal(harness.sent.filter((message) => message["type"] === "release").length, 1, "released once: then it has no copy of its own");
  assert.equal(harness.ownPages(1, 0x100), undefined);
  assert.ok(shows(harness.seen(1, 0x100).rows, "shared"));
  harness.press(1, Key.Red);
  assert.deepEqual(harness.gotos(1), [0x101], "red follows the channel's link now");
});

test("a click the page does not take follows the prompt or page number it is on", () => {
  const taken: string[] = [];
  const front: Application = {
    pages: (): PageEntry[] => [
      { page: 0x100, title: "Index" },
      { page: 0x200, title: "Two" },
    ],
    start: (context): void => {
      const drawn = screen("See 200 here", [0x200, 0x101, null, null]);
      drawn.coloured(24, 0, Colour.Red, "Two");
      drawn.coloured(24, 10, Colour.Green, "News");
      context.publish("channel", 0x100, drawn);
      context.publishTti("channel", 0x200, "PN,20000\nOL,3,Back to 100\n");
    },
    // The page takes a click on row 1's first cell, and nothing else.
    input: (_session, _page, input) => {
      const mine = input.kind === "mouse" && input.row === 1 && input.column === 0;
      if (mine) {
        taken.push(input.action);
      }
      return mine;
    },
  };
  const harness = new Harness([front]);
  harness.join(1, 0x100);
  harness.clickLeft(1, 6, 1);
  harness.clickLeft(1, 12, 24);
  harness.clickLeft(1, 0, 1);
  harness.click(1, Button.Right, 6, 1);
  harness.move(1, Held.Left, 6, 1);
  assert.deepEqual(harness.gotos(1), [0x200, 0x101], "the number, then the green prompt; never the page's own click, a right click or a move");
  assert.deepEqual(taken, ["press", "release"]);
  harness.open(1, 0x200);
  harness.clickLeft(1, 9, 3);
  assert.deepEqual(harness.gotos(1).slice(2), [0x100], "a page published from TTI, its rows read back");
});

test("a page published from TTI keeps its Fastext links for the coloured keys", () => {
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: 0x601, title: "Picture" }],
      start: (context): void => {
        context.publishTti("channel", 0x601, "PN,60101\nOL,1,x\nFL,602,8FF,8FF,600,8FF,100\nOL,26,@ABC\n");
      },
    },
  ]);
  harness.join(1, 0x601);
  harness.press(1, Key.Red);
  harness.press(1, Key.Blue);
  assert.deepEqual(harness.gotos(1), [0x602, 0x600]);
  assert.deepEqual(harness.errors, []);
});

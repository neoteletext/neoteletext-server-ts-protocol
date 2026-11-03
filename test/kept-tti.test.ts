// The testing entry's keptTti, which the component library and the
// channels read a page's rows, cursor and controls through, as item 5 of
// the to-do TODO-1539 asks: the TTI it writes reads back as the copy the
// viewer sees, its own while it has one.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, readTtiPages, Screen } from "../src/index.ts";
import { Harness, keptTti } from "../src/testing/index.ts";

/** A cursor row and column, and the block flag of the CU line (DOC-1954). */
const ROW = 5;
const COLUMN = 7;
const BLOCK = 4;

function drawn(text: string, cursor: boolean): Screen {
  const screen = new Screen();
  screen.text(1, 0, text);
  if (cursor) {
    screen.cursor(ROW, COLUMN, BLOCK);
  }
  return screen;
}

test("keptTti writes the copy a viewer sees as TTI that reads back to it, the session's own while it has one", () => {
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, drawn("shared", false));
    },
    opened: (session, page, context): void => {
      if (session === 1) {
        context.publish(session, page, drawn("mine", true));
      }
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  harness.join(2, 0x100);
  const mine = readTtiPages(keptTti(harness, 0x100) ?? "");
  const shared = readTtiPages(keptTti(harness, 0x100, 2) ?? "");
  assert.deepEqual(
    mine.map(({ content }) => content.rows),
    harness.channel.copy(1, 0x100)?.map(({ content }) => content.rows),
  );
  assert.deepEqual(mine[0]?.content.cursor, { row: ROW, column: COLUMN, block: true });
  assert.deepEqual(
    shared.map(({ content }) => content.rows),
    harness.channel.copy("channel", 0x100)?.map(({ content }) => content.rows),
  );
  assert.equal(keptTti(harness, 0x200), undefined, "a page nobody published has none");
});

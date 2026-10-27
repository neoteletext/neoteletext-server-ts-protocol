// The program's side of the protocol: each line it writes, checked as
// the server checks it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { App, Colour, LONGEST_TITLE, Screen } from "../src/index.ts";
import { type Fields, isFields } from "../src/wire/fields.ts";

/** A line the program wrote, as the object it must be. */
function parseObject(line: string): Fields {
  const value: unknown = JSON.parse(line);
  assert.ok(isFields(value), line);
  return value;
}

function written(): { app: App; lines: Fields[] } {
  const lines: Fields[] = [];
  return {
    app: new App((line) => {
      lines.push(parseObject(line));
    }),
    lines,
  };
}

test("the first line declares the pages, once, as the server reads them", () => {
  const { app, lines } = written();
  app.declare([
    { page: 0x100, title: "Index" },
    { page: 0x1a0, title: "Hexadecimal" },
  ]);
  assert.deepEqual(lines, [
    {
      type: "pages",
      pages: [
        { page: "100", title: "Index" },
        { page: "1A0", title: "Hexadecimal" },
      ],
    },
  ]);
  assert.throws(() => {
    app.declare([]);
  }, /once/u);
  assert.ok(app.serves(0x1a0) && !app.serves(0x101));
});

test("pages the server would refuse are refused at the declaration", () => {
  for (const pages of [
    [{ page: 0x900, title: "" }],
    [{ page: 0x0ff, title: "" }],
    [
      { page: 0x100, title: "" },
      { page: 0x100, title: "" },
    ],
    [{ page: 0x100, title: "x".repeat(LONGEST_TITLE + 1) }],
    [{ page: 0x100, title: "tab\there" }],
    [{ page: 0x100, title: "", section: "x".repeat(LONGEST_TITLE + 1) }],
    [{ page: 0x100, title: "", section: "new\nline" }],
    Array.from({ length: 801 }, (_, index) => ({ page: 0x100 + index, title: "" })),
  ]) {
    assert.throws(() => {
      written().app.declare(pages);
    }, RangeError);
  }
  const titled = written();
  titled.app.declare([{ page: 0x100, title: "é".repeat(32) }]);
  assert.equal(titled.lines.length, 1, "32 characters, however many bytes");
});

test("a page that starts a section names it in the declaration", () => {
  const { app, lines } = written();
  app.declare([
    { page: 0x100, title: "Index" },
    { page: 0x200, title: "Retrocomputing", section: "Retrocomputing" },
  ]);
  assert.deepEqual(lines, [
    {
      type: "pages",
      pages: [
        { page: "100", title: "Index" },
        { page: "200", title: "Retrocomputing", section: "Retrocomputing" },
      ],
    },
  ]);
});

test("a page is retitled once for each new title, and a session's own copy released", () => {
  const { app, lines } = written();
  app.declare([{ page: 0x201, title: "Story" }]);
  app.title(0x201, "A Robot Arm From Bits Of Wo...");
  app.title(0x201, "A Robot Arm From Bits Of Wo...");
  assert.equal(app.titleOf(0x201), "A Robot Arm From Bits Of Wo...");
  app.release(7, 0x201);
  assert.deepEqual(lines.slice(1), [
    { type: "title", page: "201", title: "A Robot Arm From Bits Of Wo..." },
    { type: "release", session: 7, page: "201" },
  ]);
  assert.throws(() => {
    app.title(0x202, "Other");
  }, /not declared/u);
  assert.throws(() => {
    app.title(0x201, "x".repeat(LONGEST_TITLE + 1));
  }, RangeError);
  assert.throws(() => {
    app.title(0x201, "tab\there");
  }, RangeError);
  assert.throws(() => {
    app.release(7, 0x202);
  }, RangeError);
  assert.throws(() => {
    app.release(-1, 0x201);
  }, RangeError);
});

test("publish writes TTI for the declared page and owner", () => {
  const { app, lines } = written();
  app.declare([{ page: 0x101, title: "News" }]);
  const screen = new Screen();
  screen.coloured(1, 0, Colour.Red, "Hi");
  app.publish("channel", 0x101, screen);
  app.publish(7, 0x101, [
    { screen, subpage: 1 },
    { screen, subpage: 2 },
  ]);
  const [, shared, own] = lines;
  assert.equal(shared?.["owner"], "channel");
  assert.equal(shared?.["page"], "101");
  assert.ok(String(shared?.["tti"]).startsWith("PN,10100\nSC,0000\nOL,0,\nOL,1,\u001BAHi\n"));
  assert.equal(own?.["owner"], 7);
  assert.match(String(own?.["tti"]), /^PN,10101\n[^]*PN,10102\n/u);
  assert.throws(() => {
    app.publish("channel", 0x102, screen);
  }, /not declared/u);
  assert.throws(() => {
    app.publish(-1, 0x101, screen);
  }, RangeError);
  assert.throws(() => {
    app.publish("channel", 0x101, []);
  }, RangeError);
  assert.throws(() => {
    app.publish(
      "channel",
      0x101,
      Array.from({ length: 65 }, (_, subpage) => ({ screen, subpage })),
    );
  }, RangeError);
  assert.throws(() => {
    app.publish("channel", 0x101, [{ screen, subpage: 100 }]);
  }, RangeError);
});

test("an escaped control code survives the JSON line", () => {
  const raw: string[] = [];
  const direct = new App((line) => {
    raw.push(line);
  });
  direct.declare([{ page: 0x100, title: "" }]);
  const screen = new Screen();
  screen.coloured(1, 0, Colour.Green, "x");
  direct.publish("channel", 0x100, screen);
  assert.ok(raw[1]?.includes("\\u001bBx") === true, "ESC is written as \\u001b, so the line has no raw control character");
});

test("goto, sound and log write their lines", () => {
  const { app, lines } = written();
  app.goto(7, 0x300);
  app.sound({ session: 7 }, { play: { channel: 1, handle: 20, generation: 1 } });
  app.sound({ page: 0x501 }, { stop: { channel: 3 } });
  app.log("fetched 7 posts");
  assert.deepEqual(lines, [
    { type: "goto", session: 7, page: "300" },
    { type: "sound", to: { session: 7 }, play: { channel: 1, handle: 20, generation: 1 } },
    { type: "sound", to: { page: "501" }, stop: { channel: 3 } },
    { type: "log", text: "fetched 7 posts" },
  ]);
  assert.throws(() => {
    app.goto(7, 0x900);
  }, RangeError);
  assert.throws(() => {
    app.sound({ page: 0x50 }, { stop: { channel: 0 } });
  }, RangeError);
});

test("TTI written elsewhere is published as it is, if it is ASCII and whole", () => {
  const { app, lines } = written();
  app.declare([{ page: 0x601, title: "Picture" }]);
  const picture = "DE,Picture\nPN,10000\nSC,0000\nPS,8000\nOL,1,\u001BBx\nPN,10001\nOL,1,y\n";
  app.publishTti("channel", 0x601, picture);
  assert.deepEqual(lines[1], { type: "publish", page: "601", owner: "channel", tti: picture });
  assert.throws(
    () => {
      app.publishTti("channel", 0x601, "PN,10000\nOL,1,\u008Dx\n");
    },
    /ASCII/u,
    "the 8-bit form of a control code",
  );
  assert.throws(() => {
    app.publishTti("channel", 0x601, "OL,1,x\n");
  }, /PN/u);
  assert.throws(() => {
    app.publishTti("channel", 0x601, "PN,10000\n".repeat(65));
  }, /PN/u);
  assert.throws(() => {
    app.publishTti("channel", 0x602, picture);
  }, /not declared/u);
});

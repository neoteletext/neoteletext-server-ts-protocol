// The program's side of the protocol: each line it writes, checked as
// the server checks it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { App, Colour, type Limits, Screen } from "../src/index.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";
import { type Fields, isFields } from "../src/wire/fields.ts";

const LONGEST_TITLE = SERVER_LIMITS.budgets.titleCharacters;

/** A line the program wrote, as the object it must be. */
function parseObject(line: string): Fields {
  const value: unknown = JSON.parse(line);
  assert.ok(isFields(value), line);
  return value;
}

/** A program's App, started with `limits` unless `started` is false, and the lines it writes. */
function written(limits: Limits = SERVER_LIMITS, started = true): { app: App; lines: Fields[] } {
  const lines: Fields[] = [];
  const app = new App((line) => {
    lines.push(parseObject(line));
  });
  if (started) {
    app.started(limits);
  }
  return { app, lines };
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

test("pages the server would refuse for their form are refused at the declaration; their count and lengths are the server's to judge, before start", () => {
  for (const pages of [
    [{ page: 0x900, title: "" }],
    [{ page: 0x0ff, title: "" }],
    [
      { page: 0x100, title: "" },
      { page: 0x100, title: "" },
    ],
    [{ page: 0x100, title: "tab\there" }],
    [{ page: 0x100, title: "", section: "new\nline" }],
  ]) {
    assert.throws(() => {
      written(SERVER_LIMITS, false).app.declare(pages);
    }, RangeError);
  }
  const titled = written(SERVER_LIMITS, false);
  titled.app.declare([{ page: 0x100, title: "é".repeat(LONGEST_TITLE + 1) }]);
  assert.equal(titled.lines.length, 1, "a declaration comes before start, which says how long a title may be");
  const many = written(SERVER_LIMITS, false);
  many.app.declare(
    Array.from({ length: SERVER_LIMITS.standard.pages + 1 }, (_, index) => ({ page: 0x100 + index, title: "" })).filter(({ page }) => page <= 0x8ff),
  );
  assert.equal(many.lines.length, 1, "the count is the server's to judge");
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
  app.publish(7, 0x101, [{ screen }, { screen, subcode: 0x0777 }]);
  const [, shared, own] = lines;
  assert.equal(shared?.["owner"], "channel");
  assert.equal(shared?.["page"], "101");
  assert.ok(String(shared?.["tti"]).startsWith("PN,10100\nOL,0,\nOL,1,\u001BAHi\n"), "the server numbers a whole page: no SC line");
  assert.equal(own?.["owner"], 7);
  assert.equal(shared?.["keep"], undefined);
  assert.match(String(own?.["tti"]), /^PN,10100\n[^]*PN,10100\n/u);
  assert.ok(!String(own?.["tti"]).includes("SC,"), "a sub-code given to a whole page is not written");
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
      Array.from({ length: SERVER_LIMITS.standard.numberedSubpages + 1 }, () => ({ screen })),
    );
  }, RangeError);
});

test("a put names each sub-page by its sub-code and keeps the page's others; a remove names those that end", () => {
  const { app, lines } = written();
  app.declare([{ page: 0x101, title: "News" }]);
  const screen = new Screen();
  app.put("channel", 0x101, [
    { screen, subcode: 0x0100 },
    { screen, subcode: 0x3f7e },
  ]);
  app.remove("channel", 0x101, [0x0002, 0x0a10]);
  const [, put, removed] = lines;
  assert.equal(put?.["keep"], true);
  assert.match(String(put?.["tti"]), /^PN,10100\nSC,0100\n[^]*PN,10100\nSC,3F7E\n/u);
  assert.deepEqual(removed, { type: "remove", page: "101", owner: "channel", subpages: ["0002", "0A10"] });
  for (const subpages of [
    [],
    [{ screen }],
    [
      { screen, subcode: 1 },
      { screen, subcode: 1 },
    ],
    [{ screen, subcode: 0x10000 }],
  ]) {
    assert.throws(() => {
      app.put("channel", 0x101, subpages);
    }, RangeError);
  }
  assert.throws(() => {
    app.remove("channel", 0x101, []);
  }, RangeError);
  assert.throws(() => {
    app.remove("channel", 0x102, [1]);
  }, /not declared/u);
});

test("the bounds a program keeps to are those start gave, never the kit's own (the server's requirement 3.3)", () => {
  const small: Limits = {
    standard: { ...SERVER_LIMITS.standard, subpages: 3, numberedSubpages: 2 },
    budgets: { ...SERVER_LIMITS.budgets, titleCharacters: 4 },
  };
  const { app } = written(small);
  app.declare([{ page: 0x101, title: "News" }]);
  const screen = new Screen();
  app.publish("channel", 0x101, [{ screen }, { screen }]);
  assert.throws(() => {
    app.publish("channel", 0x101, [{ screen }, { screen }, { screen }]);
  }, RangeError);
  app.put(
    "channel",
    0x101,
    [1, 2, 3].map((subcode) => ({ screen, subcode })),
  );
  assert.throws(() => {
    app.put(
      "channel",
      0x101,
      [1, 2, 3, 4].map((subcode) => ({ screen, subcode })),
    );
  }, RangeError);
  app.title(0x101, "Four");
  assert.throws(() => {
    app.title(0x101, "Fives");
  }, RangeError);
  assert.throws(() => {
    written(SERVER_LIMITS, false).app.limits();
  }, /start/u);
});

test("the kit's source writes none of the standard's figures, nor names the limits it once held", () => {
  const figures = [SERVER_LIMITS.standard.pages, SERVER_LIMITS.standard.keyablePages, SERVER_LIMITS.standard.subpages, SERVER_LIMITS.standard.numberedSubpages];
  const source = join(import.meta.dirname, "..", "src");
  const files = readdirSync(source, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts") && !file.startsWith("testing"));
  for (const file of files) {
    const text = readFileSync(join(source, file), "utf8");
    for (const figure of figures) {
      assert.doesNotMatch(text, new RegExp(`(?<![\\w.])${figure}(?![\\w.])`, "u"), `${file} writes ${figure}`);
    }
    assert.doesNotMatch(text, /MOST_(SUBPAGES|PAGES)|LONGEST_TITLE/u, file);
  }
});

test("an escaped control code survives the JSON line", () => {
  const raw: string[] = [];
  const direct = new App((line) => {
    raw.push(line);
  });
  direct.declare([{ page: 0x100, title: "" }]);
  direct.started(SERVER_LIMITS);
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
    app.publishTti("channel", 0x601, "PN,10000\n".repeat(SERVER_LIMITS.standard.numberedSubpages + 1));
  }, /PN/u);
  assert.throws(() => {
    app.publishTti("channel", 0x602, picture);
  }, /not declared/u);
});

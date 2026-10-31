// A channel's applications in one program: their pages, sessions, wakes,
// figures and failures.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, Random } from "../src/index.ts";
import { Harness, shows } from "../src/testing/index.ts";
import { Recorder, screen } from "./recorder.ts";

test("the first application to name a page serves it; every application hears a session begin, only the owner its pages", () => {
  const first = new Recorder([
    { page: 0x100, title: "Index" },
    { page: 0x101, title: "News" },
  ]);
  const second = new Recorder([
    { page: 0x101, title: "Also news" },
    { page: 0x200, title: "Games", ownsDigits: true },
  ]);
  const harness = new Harness([first, second]);
  harness.join(1, 0x101);
  const reply = harness.sent.find((message) => message["type"] === "reply");
  assert.deepEqual(reply?.["magazines"], [
    {
      magazine: 1,
      name: "Magazine 1",
      pages: [
        { page: "100", title: "Index", section: null, subpages: 1 },
        { page: "101", title: "News", section: null, subpages: 1 },
      ],
    },
    { magazine: 2, name: "Magazine 2", pages: [{ page: "200", title: "Games", section: null, subpages: 1 }] },
  ]);
  assert.deepEqual(first.heard, ["joined 1", "opened 1 101"]);
  assert.deepEqual(second.heard, ["joined 1"], "every application hears a session begin, only the owner the page");
  harness.open(1, 0x200);
  assert.deepEqual(first.heard.slice(2), ["left 1 101"]);
  assert.deepEqual(second.heard.slice(1), ["opened 1 200"]);
});

test("a page retitled sends the index once, and the index lists it so", () => {
  const story: Application = {
    pages: (): PageEntry[] => [{ page: 0x201, title: "Story" }],
    start: (context): void => {
      context.publish("channel", 0x201, screen("story"));
    },
    input: (_session, _page, _input, context): void => {
      context.title(0x201, "Robot arm");
      context.title(0x201, "Robot arm");
    },
  };
  const harness = new Harness([story]);
  harness.join(1, 0x201);
  harness.typeText(1, "x");
  assert.equal(harness.sent.filter((message) => message["type"] === "index").length, 1);
  assert.equal(harness.title(0x201), "Robot arm");
  assert.equal(harness.title(0x202), undefined);
});

test("the server's figures reach every application, which may name the channel's pages", () => {
  const shown: string[] = [];
  const figures = (name: string): Application => ({
    pages: (): PageEntry[] => [{ page: name === "one" ? 0x100 : 0x150, title: name }],
    start: () => {},
    stats: (stats, context) => {
      shown.push(`${name} ${String(stats.channel["viewers"])} ${context.titleOf(0x150) ?? "none"} ${context.titleOf(0x151) ?? "none"}`);
    },
  });
  const harness = new Harness([figures("one"), figures("two")]);
  harness.stats({ server: {}, channel: { viewers: 4 } });
  assert.deepEqual(shown, ["one 4 two none", "two 4 two none"]);
});

test("each application wakes when it asked, the earliest asked for winning", () => {
  const woken: string[] = [];
  const clock = (name: string, first: number, every: number): Application => ({
    pages: (): PageEntry[] => [],
    start: (context): void => {
      context.wakeAt(first + 50);
      context.wakeAt(first);
    },
    wake: (context): void => {
      woken.push(`${name} ${context.now()}`);
      context.wakeIn(every);
    },
  });
  const harness = new Harness([clock("a", 100, 100), clock("b", 150, 1_000)]);
  assert.equal(harness.channel.nextWake(), 100);
  harness.advance(99);
  assert.deepEqual(woken, []);
  harness.advance(1);
  assert.deepEqual(woken, ["a 100"], "only the application due");
  harness.runUntil(450);
  assert.deepEqual(woken, ["a 100", "b 150", "a 200", "a 300", "a 400"]);
  assert.equal(harness.now, 450);
  assert.equal(harness.channel.nextWake(), 500);
});

test("the real time is the server's, from start", () => {
  let seen = 0;
  const harness = new Harness(
    [
      {
        pages: (): PageEntry[] => [],
        start: (context): void => {
          context.wakeIn(1_000);
        },
        wake: (context): void => {
          seen = context.epochMs();
        },
      },
    ],
    { epochMs: 1_792_886_400_000 },
  );
  harness.advance(1_000);
  assert.equal(seen, 1_792_886_401_000);
});

test("a session ends once, when the server says it closed", () => {
  const recorder = new Recorder([{ page: 0x100, title: "Index" }]);
  const harness = new Harness([recorder]);
  harness.join(9, 0x100);
  harness.typeText(9, "x");
  assert.deepEqual(recorder.heard.slice(0, 3), ["joined 9", "opened 9 100", `input 9 100 {"kind":"text","text":"x"}`]);
  harness.close(9);
  harness.channel.closed(9);
  harness.channel.closed(10);
  assert.deepEqual(recorder.heard.slice(3), ["left 9 100", "ended 9"]);
});

test("an application that fails is reported, and the channel goes on", () => {
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
      start: (context): void => {
        context.publish("channel", 0x100, screen("up"));
      },
      input: (): never => {
        throw new Error("broken");
      },
      opened: (_session, _page, context): void => {
        context.publish("channel", 0x101, screen("undeclared"));
      },
    },
  ]);
  harness.join(1, 0x100);
  harness.typeText(1, "x");
  assert.equal(harness.errors.length, 2);
  assert.match(harness.errors[0] ?? "", /no application serves 101/u);
  assert.match(harness.errors[1] ?? "", /broken/u);
  assert.ok(shows(harness.shared(0x100), "up"));
  harness.channel.input(1, 0x150, 0, { kind: "focus" });
  assert.equal(harness.errors.length, 2, "input on a page no application serves is not a fault: the keys still select pages");
});

test("random numbers are the runtime's xorshift64*", () => {
  const random = new Random(7n);
  assert.deepEqual([random.next(), random.next(), random.next()], [3_522_932_607, 3_986_975_863, 383_753_578]);
  assert.equal(new Random(0n).next(), new Random(1n).next(), "a zero seed is made odd, as the runtime's is");
  assert.equal(random.below(0), 0);
  for (let draw = 0; draw < 1_000; draw += 1) {
    assert.ok(random.below(3) < 3);
  }
});

test("an application hears the query of the address its viewer opened, as it came, before the page opens", () => {
  const heard: string[] = [];
  const application: Application = {
    pages: () => [{ page: 0x100, title: "Index" }],
    start: (context) => {
      context.publish("channel", 0x100, screen("Index"));
    },
    query: (session, query) => {
      heard.push(`query ${session} ${query}`);
    },
    opened: (session) => {
      heard.push(`opened ${session}`);
    },
  };
  const harness = new Harness([application]);
  harness.channel.connected(1, 1, null, [], "id=7&b=%20x");
  harness.channel.connected(2, 2, null, [], null);
  assert.deepEqual(heard, ["query 1 id=7&b=%20x", "opened 1", "opened 2"]);
});

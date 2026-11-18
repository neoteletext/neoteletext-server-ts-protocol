// The animation calls (animation.md ANIM-17, ANIM-19): each writes the
// message of ANIM-21 as the document's example has it, for a page and its
// sub-code (DEC-6599), and checks nothing beyond the schema (DEC-6462).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type Audience, type Context, type PageEntry, Screen, TextNotWritableError, Timeline } from "../../src/index.ts";
import type { NaplpsObject, Sprite } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";

const PAGE = 0x150;
const SPRITES_PAGE = 0x160;
const NAPLPS_PAGE = 0x170;
const SUB = 1;
const EVERYONE: Audience = { connections: "all" };

/** A harness whose channel does `send` when connection 1 types. */
function sending(send: (context: Context) => void): Harness {
  const application: Application = {
    pages: (): PageEntry[] => [PAGE, SPRITES_PAGE, NAPLPS_PAGE].map((page) => ({ page, title: "Page" })),
    start: (context): void => {
      context.publish("channel", PAGE, new Screen());
    },
    input: (_connection, _page, _input, context): void => {
      send(context);
    },
  };
  const harness = new Harness([application]);
  harness.join(1, PAGE);
  return harness;
}

/** The lines the channel wrote since it joined, but the pages', each as its text. */
function lines(harness: Harness): string[] {
  return harness.sent.filter((line) => !["reply", "page", "index", "subpages"].includes(String(line["type"]))).map((line) => JSON.stringify(line));
}

/** ANIM-21's example sprite. */
const SPRITE: Sprite = {
  number: 1,
  shown: true,
  detectable: false,
  layer: 2,
  order: 0,
  column: 10,
  row: 5,
  width: 4,
  height: 3,
  frames: [
    { source: "local", kind: "passive", number: 0 },
    { source: "local", kind: "passive", number: 1 },
  ],
};
/** ANIM-21's two example objects: a macro and a region. */
const OBJECTS: NaplpsObject[] = [
  {
    number: 1,
    kind: "macro",
    shown: true,
    detectable: true,
    layer: 2,
    order: 0,
    x: 300,
    y: 200,
    width: 64,
    height: 64,
    origin_x: 0,
    origin_y: 416,
    frames: [32, 33],
    cover: null,
    hover: 34,
    pressed: null,
    alternative: null,
  },
  {
    number: 2,
    kind: "region",
    shown: true,
    detectable: true,
    layer: 1,
    order: 0,
    x: 0,
    y: 440,
    width: 640,
    height: 40,
    origin_x: 0,
    origin_y: 0,
    frames: [],
    cover: 0,
    hover: null,
    pressed: null,
    alternative: null,
  },
];

test("ANIM-19, ANIM-21: animate, sprites and naplpsObjects write the document's examples, field for field", () => {
  const harness = sending((context) => {
    context.animate(EVERYONE, PAGE, SUB, [
      { action: "move", target: { object: 10 }, x: 120, y: 80, relative: false },
      { action: "cycle", target: { object: 10 }, first: 0, last: 3, period: 6, once: false },
      { action: "hide", target: { object: 20 } },
      { action: "reset", target: { object: 21 } },
    ]);
    context.sprites(EVERYONE, SPRITES_PAGE, SUB, [SPRITE]);
    context.naplpsObjects(EVERYONE, NAPLPS_PAGE, SUB, OBJECTS);
  });
  harness.typeText(1, "x");
  assert.deepEqual(lines(harness), [
    '{"type":"animate","connections":"all","page":"150","sub":"0001","ops":[{"action":"move","target":{"object":10},"x":120,"y":80,"relative":false},{"action":"cycle","target":{"object":10},"first":0,"last":3,"period":6,"once":false},{"action":"hide","target":{"object":20}},{"action":"reset","target":{"object":21}}]}',
    '{"type":"sprites","connections":"all","page":"160","sub":"0001","sprites":[{"number":1,"shown":true,"detectable":false,"layer":2,"order":0,"column":10,"row":5,"width":4,"height":3,"frames":[{"source":"local","kind":"passive","number":0},{"source":"local","kind":"passive","number":1}]}]}',
    '{"type":"naplps_objects","connections":"all","page":"170","sub":"0001","objects":[{"number":1,"kind":"macro","shown":true,"detectable":true,"layer":2,"order":0,"x":300,"y":200,"width":64,"height":64,"origin_x":0,"origin_y":416,"frames":[32,33],"cover":null,"hover":34,"pressed":null,"alternative":null},{"number":2,"kind":"region","shown":true,"detectable":true,"layer":1,"order":0,"x":0,"y":440,"width":640,"height":40,"origin_x":0,"origin_y":0,"frames":[],"cover":0,"hover":null,"pressed":null,"alternative":null}]}',
  ]);
});

test("ANIM-19, ANIM-21: spriteSheet writes a sub-page's bytes as base64, text a byte a character, and restart only when asked", () => {
  // A character above 127 is its one byte of Latin-1, never two of UTF-8: "é" is E9.
  const text = "D(B41)T'\u00E9'";
  const harness = sending((context) => {
    context.spriteSheet(EVERYONE, PAGE, SUB, "regis", text, true);
    context.spriteSheet(EVERYONE, PAGE, SUB, "naplps", new Uint8Array([0x0e, 0x24]));
  });
  harness.typeText(1, "x");
  const bytes = Buffer.from(Array.from({ length: text.length }, (_, place) => text.codePointAt(place) ?? 0));
  assert.equal(bytes.length, text.length);
  assert.equal(bytes.at(-2), 0xe9);
  assert.deepEqual(lines(harness), [
    `{"type":"sprite_sheet","connections":"all","page":"150","sub":"0001","kind":"regis","data":"${bytes.toString("base64")}","restart":true}`,
    '{"type":"sprite_sheet","connections":"all","page":"150","sub":"0001","kind":"naplps","data":"DiQ=","restart":false}',
  ]);
});

test("ANIM-19, DEC-6650: spriteSheet refuses a character above 255, naming its place, and sends nothing", () => {
  const thrown: unknown[] = [];
  const harness = sending((context) => {
    try {
      context.spriteSheet(EVERYONE, PAGE, SUB, "regis", "D(B41)T'\u0100'", true);
    } catch (error) {
      thrown.push(error);
    }
  });
  harness.typeText(1, "x");
  assert.deepEqual(lines(harness), []);
  const [error] = thrown;
  assert.ok(error instanceof TextNotWritableError);
  assert.deepEqual([error.index, error.character], [8, "\u0100"]);
  assert.match(error.message, /^spriteSheet: .*U\+0100/u);
});

test("ANIM-17: objectPage writes the object page's sub-page by its objects, for the page whose sprites use it", () => {
  const objects = [
    { kind: "passive", index: 0, triplets: [{ address: 40, mode: 4, data: 0 }] },
    { kind: "active", index: 31, triplets: [] },
  ] as const;
  const harness = sending((context) => {
    context.objectPage(EVERYONE, SPRITES_PAGE, SUB, { page: 0x1c0, s1: 2, global: false, last: true, objects });
  });
  harness.typeText(1, "x");
  const line = harness.sent.find((message) => message["type"] === "object_page");
  assert.equal(
    JSON.stringify(line),
    JSON.stringify({
      type: "object_page",
      connections: "all",
      page: "160",
      sub: "0001",
      object: { page: "1C0", s1: 2, global: false, last: true, objects },
    }),
    "every field, in the schema's order",
  );
  assert.deepEqual(harness.errors, []);
});

test("ANIM-2, ANIM-19: frame writes the begin, what its body sends, and the end, and ends the frame when the body throws", () => {
  let thrown: unknown;
  const harness = sending((context) => {
    context.frame(EVERYONE, PAGE, SUB, () => {
      context.animate(EVERYONE, PAGE, SUB, [{ action: "show", target: { object: 10 } }]);
    });
    try {
      context.frame({ connection: 1 }, PAGE, SUB, () => {
        throw new Error("the body failed");
      });
    } catch (error) {
      thrown = error;
    }
  });
  harness.typeText(1, "x");
  assert.deepEqual(lines(harness), [
    '{"type":"frame","connections":"all","page":"150","sub":"0001","mark":"begin"}',
    '{"type":"animate","connections":"all","page":"150","sub":"0001","ops":[{"action":"show","target":{"object":10}}]}',
    '{"type":"frame","connections":"all","page":"150","sub":"0001","mark":"end"}',
    '{"type":"frame","connections":[1],"page":"150","sub":"0001","mark":"begin"}',
    '{"type":"frame","connections":[1],"page":"150","sub":"0001","mark":"end"}',
  ]);
  assert.match(String(thrown), /the body failed/u, "and the body's failure is the caller's");
});

/** ANIM-21's example timeline as its line, with the identifier `id`. */
function walkLine(id: number): string {
  return `{"type":"timeline","connections":"all","page":"150","sub":"0001","id":${id},"loop_ticks":null,"steps":[{"tick":0,"ops":[{"action":"show","target":{"object":10}}]},{"tick":30,"ops":[{"action":"move","target":{"object":10},"x":8,"y":0,"relative":true}]}]}`;
}

test("ANIM-19, ANIM-21: playTimeline writes the document's timeline and answers its id, counting one when none is given; stopTimeline names it", () => {
  const ids: number[] = [];
  const harness = sending((context) => {
    const walk = new Timeline();
    walk.at(0).show(10);
    walk.at(30).move(10, 8, 0, true);
    ids.push(
      context.playTimeline(EVERYONE, PAGE, SUB, walk),
      context.playTimeline(EVERYONE, PAGE, SUB, walk, 9),
      context.playTimeline(EVERYONE, PAGE, SUB, walk),
    );
    context.stopTimeline(EVERYONE, PAGE, SUB, 1);
  });
  harness.typeText(1, "x");
  assert.deepEqual(ids, [1, 9, 2], "an id given is used and not counted");
  assert.deepEqual(lines(harness), [walkLine(1), walkLine(9), walkLine(2), '{"type":"timeline_stop","connections":"all","page":"150","sub":"0001","id":1}']);
});

test("ANIM-19, DEC-6462: the kit holds animation to the schema and to nothing else", () => {
  const thrown: unknown[] = [];
  const harness = sending((context) => {
    // The server refuses an operation on "any" (invalid_animation) and a frame's end with no begin (frame_order): the schema cannot state either, so the kit sends them.
    context.animate(EVERYONE, PAGE, SUB, [{ action: "show", target: { object: "any" } }]);
    for (const send of [
      (): void => {
        context.animate(EVERYONE, PAGE, SUB, []);
      },
      (): void => {
        context.playTimeline(EVERYONE, PAGE, SUB, new Timeline());
      },
      (): void => {
        context.stopTimeline(EVERYONE, PAGE, SUB, 0);
      },
    ]) {
      try {
        send();
      } catch (error) {
        thrown.push(error);
      }
    }
  });
  harness.typeText(1, "x");
  assert.equal(lines(harness).length, 1);
  assert.deepEqual(
    thrown.map((error) => (error instanceof Error ? error.message.replace(/ \(.*$/u, "") : error)),
    ["animate: ops: too_short", "timeline: steps: too_short", "timeline_stop: id: out_of_range"],
  );
});

test("ANIM-19: the harness gives the animate messages the server would send as it plays each timeline written, once through", () => {
  const harness = sending((context) => {
    const blink = new Timeline({ loopTicks: 60 });
    blink.at(0).show(7);
    blink.then(30).hide(7);
    context.playTimeline({ connection: 1 }, PAGE, SUB, blink, 4);
    context.playTimeline({ connection: 2 }, PAGE, SUB, blink, 5);
  });
  harness.join(2, PAGE);
  harness.typeText(1, "x");
  assert.deepEqual(harness.timelineSends(1), [
    { id: 4, tick: 0, message: { type: "animate", connections: [1], page: "150", sub: "0001", ops: [{ action: "show", target: { object: 7 } }] } },
    { id: 4, tick: 30, message: { type: "animate", connections: [1], page: "150", sub: "0001", ops: [{ action: "hide", target: { object: 7 } }] } },
  ]);
  assert.deepEqual(
    harness.timelineSends(2).map(({ id }) => id),
    [5, 5],
  );
});

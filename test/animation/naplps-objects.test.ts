// The NAPLPS objects call's labels, title and one object redefined
// (animation.md ANIM-11; DEC-6638 items 3 and 6; TODO-6695): the lines the
// kit writes, which the Python kit's test holds to the same text (DEC-6462).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type Audience, type Context, type PageEntry, Screen } from "../../src/index.ts";
import type { NaplpsObject } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";

const PAGE = 0x170;
const SUB = 1;
const EVERYONE: Audience = { connections: "all" };

/** A harness whose channel does `send` when connection 1 types. */
function sending(send: (context: Context) => void): Harness {
  const application: Application = {
    pages: (): PageEntry[] => [{ page: PAGE, title: "Page" }],
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

/** The `naplps_objects` lines the channel wrote, each as its text. */
function lines(harness: Harness): string[] {
  return harness.sent.filter((line) => line["type"] === "naplps_objects").map((line) => JSON.stringify(line));
}

/** The shared wire vectors' macro object 301, at (`x`, 50), labelled Play. */
function labelled(x: number): NaplpsObject {
  return {
    number: 301,
    kind: "macro",
    shown: true,
    detectable: true,
    layer: 2,
    order: 0,
    x,
    y: 50,
    width: 64,
    height: 32,
    origin_x: 0,
    origin_y: 0,
    frames: [32],
    pressed: 33,
    label: "Play",
  };
}

/** That object as the line writes it. */
function written(x: number): string {
  return `{"number":301,"kind":"macro","shown":true,"detectable":true,"layer":2,"order":0,"x":${String(x)},"y":50,"width":64,"height":32,"origin_x":0,"origin_y":0,"frames":[32],"pressed":33,"label":"Play"}`;
}

test("ANIM-11, TODO-6695: naplpsObjects takes labels, the picture's title and one object redefined, each written only when given", () => {
  const harness = sending((context) => {
    context.naplpsObjects(EVERYONE, PAGE, SUB, { objects: [labelled(100)], title: "Jukebox" });
    context.naplpsObjects(EVERYONE, PAGE, SUB, { objects: [labelled(200)], one: true });
    context.naplpsObjects(EVERYONE, PAGE, SUB, { objects: [], title: null, one: false });
    context.naplpsObjects(EVERYONE, PAGE, SUB, [labelled(100)]);
  });
  harness.typeText(1, "x");
  assert.deepEqual(lines(harness), [
    `{"type":"naplps_objects","connections":"all","page":"170","sub":"0001","objects":[${written(100)}],"title":"Jukebox"}`,
    `{"type":"naplps_objects","connections":"all","page":"170","sub":"0001","objects":[${written(200)}],"one":true}`,
    '{"type":"naplps_objects","connections":"all","page":"170","sub":"0001","objects":[]}',
    `{"type":"naplps_objects","connections":"all","page":"170","sub":"0001","objects":[${written(100)}]}`,
  ]);
});

test("ANIM-11, TODO-6695: a label past 64 characters, or a title with a control character, is refused by the schema and not sent", () => {
  const thrown: unknown[] = [];
  const harness = sending((context) => {
    for (const objects of [{ objects: [{ ...labelled(100), label: "x".repeat(65) }] }, { objects: [], title: "Juke\nbox" }, { objects: [], title: "" }]) {
      try {
        context.naplpsObjects(EVERYONE, PAGE, SUB, objects);
      } catch (error) {
        thrown.push(error);
      }
    }
  });
  harness.typeText(1, "x");
  assert.equal(thrown.length, 3);
  assert.deepEqual(lines(harness), []);
});

// The messages of a page's rule table and of animation (page-rules.md
// RULE-35, RULE-55; animation.md ANIM-17, ANIM-19, ANIM-21), each built as
// the schema's type gives it and sent to the connections an application
// names. Each names a page by its number and sub-code together, since a
// sub-page is a page of its own (RULE-112, DEC-6599).
// Nothing here checks a table, an operation or a sprite: the schema holds
// each line and every other rule is the server's (DEC-6462).

import type { Host, NaplpsObjectSet } from "./context.ts";
import type { NaplpsObject } from "../wire/generated/protocol.js";
import type { Sender } from "./sender.ts";
import { textBytes } from "./text-bytes.ts";
import { subText } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";

/** What a context reaches of rules and animation. */
export type AnimationHost = Pick<
  Host,
  "rules" | "frame" | "animate" | "sprites" | "naplpsObjects" | "spriteSheet" | "objectPage" | "playTimeline" | "stopTimeline"
>;

/** A timeline's first identifier: the schema's `timeline.id` is 1 to 65,535 (ANIM-21). */
const FIRST_TIMELINE = 1;
/** A timeline's last identifier. */
const LAST_TIMELINE = 65_535;

/**
 * A `naplps_objects` message's own fields (ANIM-11): a list is the objects alone; a set adds the title or one, each
 * written after the objects only when given, in the order the Python kit writes them, so that both write one line
 * (DEC-6462).
 */
function naplpsFields(given: readonly NaplpsObject[] | NaplpsObjectSet): NaplpsObjectSet {
  const set: NaplpsObjectSet = "objects" in given ? given : { objects: given };
  const title = set.title === undefined || set.title === null ? {} : { title: set.title };
  return { objects: set.objects, ...title, ...(set.one === true ? { one: true } : {}) };
}

/** The calls of rules and animation, writing through `sender`. */
export function animationCalls(sender: Sender): AnimationHost {
  // The identifier given a timeline played without one: they go round, and the kit keeps no list of the timelines playing, which is the server's.
  let nextTimeline = FIRST_TIMELINE;
  return {
    rules: (to, page, sub, table): void => {
      sender.toAudience(to, (named) => ({ type: "rules", connections: named, page: pageText(page), sub: subText(sub), table }));
    },
    frame: (to, page, sub, mark): void => {
      sender.toAudience(to, (named) => ({ type: "frame", connections: named, page: pageText(page), sub: subText(sub), mark }));
    },
    animate: (to, page, sub, ops): void => {
      sender.toAudience(to, (named) => ({ type: "animate", connections: named, page: pageText(page), sub: subText(sub), ops }));
    },
    sprites: (to, page, sub, sprites): void => {
      sender.toAudience(to, (named) => ({ type: "sprites", connections: named, page: pageText(page), sub: subText(sub), sprites }));
    },
    naplpsObjects: (to, page, sub, given): void => {
      sender.toAudience(to, (named) => ({ type: "naplps_objects", connections: named, page: pageText(page), sub: subText(sub), ...naplpsFields(given) }));
    },
    spriteSheet: (to, page, sub, kind, data, restart): void => {
      const bytes = textBytes("spriteSheet", data);
      sender.toAudience(to, (named) => ({ type: "sprite_sheet", connections: named, page: pageText(page), sub: subText(sub), kind, data: bytes, restart }));
    },
    objectPage: (to, page, sub, object): void => {
      // The schema's order, so that both kits write one line (DEC-6462).
      const encoded = { page: pageText(object.page), s1: object.s1, global: object.global, last: object.last, objects: object.objects };
      sender.toAudience(to, (named) => ({ type: "object_page", connections: named, page: pageText(page), sub: subText(sub), object: encoded }));
    },
    playTimeline: (to, page, sub, timeline, given): number => {
      const id = given ?? nextTimeline;
      if (given === null) {
        nextTimeline = id === LAST_TIMELINE ? FIRST_TIMELINE : id + 1;
      }
      const { loopTicks, steps } = timeline;
      sender.toAudience(to, (named) => ({ type: "timeline", connections: named, page: pageText(page), sub: subText(sub), id, loop_ticks: loopTicks, steps }));
      return id;
    },
    stopTimeline: (to, page, sub, id): void => {
      sender.toAudience(to, (named) => ({ type: "timeline_stop", connections: named, page: pageText(page), sub: subText(sub), id }));
    },
  };
}

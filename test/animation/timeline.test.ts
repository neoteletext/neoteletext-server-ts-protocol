// The timeline builder (animation.md ANIM-19): it only gathers steps, sorted
// by tick with the steps of one tick joined, and `playTimeline` writes the
// `timeline` message the shared fixture gives for each
// (test/fixtures/timelines.jsonl, which both kits build; python.md PY-80).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type PageEntry, Screen, Timeline, type TimelineStep } from "../../src/index.ts";
import type { LookName } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { type FixtureLine, fixtureLines } from "../rules/fixture.ts";

/** A call's argument that must be a number. */
function numberOf(value: unknown): number {
  assert.equal(typeof value, "number");
  return Number(value);
}

/** A call's argument that is a number or null. */
function layerOf(value: unknown): number | null {
  return value === null ? null : numberOf(value);
}

/** A call's argument that is a flag, when it is given. */
function flagOf(value: unknown): boolean | undefined {
  assert.ok(value === undefined || typeof value === "boolean");
  return value;
}

/** A call's argument that is one of the looks. */
function lookOf(value: unknown): LookName {
  assert.ok(value === "normal" || value === "hover" || value === "pressed" || value === "alternative");
  return value;
}

/** One call of the fixture made on the step last begun: its protocol name in snake_case, then its arguments. */
function add(step: TimelineStep, name: unknown, given: readonly unknown[]): void {
  const [object, ...rest] = given;
  const target = numberOf(object);
  switch (name) {
    case "move": {
      step.move(target, numberOf(rest[0]), numberOf(rest[1]), flagOf(rest[2]));
      break;
    }
    case "show": {
      step.show(target);
      break;
    }
    case "hide": {
      step.hide(target);
      break;
    }
    case "look": {
      step.look(target, lookOf(rest[0]));
      break;
    }
    case "order": {
      step.order(target, layerOf(rest[0]), numberOf(rest[1]));
      break;
    }
    case "frame": {
      step.frame(target, numberOf(rest[0]));
      break;
    }
    case "cycle": {
      step.cycle(target, numberOf(rest[0]), numberOf(rest[1]), numberOf(rest[2]), flagOf(rest[3]));
      break;
    }
    case "stop_cycle": {
      step.stopCycle(target);
      break;
    }
    case "reset": {
      step.reset(target);
      break;
    }
    default: {
      assert.fail(`the fixture calls ${String(name)}, which no step has`);
    }
  }
}

/** The timeline a fixture line's calls build: `at` and `then` begin a step, and each other call adds to the step last begun. */
function built(line: FixtureLine): Timeline {
  const loopTicks = line["loop_ticks"];
  const timeline = typeof loopTicks === "number" ? new Timeline({ loopTicks }) : new Timeline();
  let step: TimelineStep | undefined;
  const calls = line["calls"];
  assert.ok(Array.isArray(calls));
  for (const call of calls as readonly unknown[]) {
    assert.ok(Array.isArray(call));
    const [name, ...given] = call as readonly unknown[];
    if (name === "at" || name === "then") {
      step = name === "at" ? timeline.at(numberOf(given[0])) : timeline.then(numberOf(given[0]));
    } else {
      assert.ok(step !== undefined, "a call before any step");
      add(step, name, given);
    }
  }
  return timeline;
}

const TIMELINES = fixtureLines("timelines.jsonl");
const INDEX = 0x100;

test("ANIM-19: the fixture holds timelines that sort, join, loop, use every operation and leave out a step with none", () => {
  assert.deepEqual(
    TIMELINES.map((line) => line["timeline"]),
    ["walk", "sorted-and-joined", "every-operation", "a-step-with-no-operation"],
  );
});

for (const line of TIMELINES) {
  test(`ANIM-19, ANIM-21: the timeline ${String(line["timeline"])} is written as exactly the fixture's message`, () => {
    const page = Number.parseInt(String(line["page"]), 16);
    const sub = Number.parseInt(String(line["sub"]), 16);
    const harness = new Harness([
      {
        // The channel's own page: a timeline may name any page, one the standard reserves among them, which the server judges.
        pages: (): PageEntry[] => [{ page: INDEX, title: "Index" }],
        start: (context): void => {
          context.publish("channel", INDEX, new Screen());
        },
        opened: (_connection, _page, context): void => {
          context.playTimeline({ connections: "all" }, page, sub, built(line), numberOf(line["id"]));
        },
      },
    ]);
    harness.join(1, INDEX);
    const written = harness.sent.filter((sent) => sent["type"] === "timeline");
    assert.equal(written.length, 1);
    assert.equal(JSON.stringify(written[0]), JSON.stringify(line["message"]));
    assert.deepEqual(harness.errors, []);
  });
}

test("ANIM-19: a timeline holds its loop, and its steps are read at any time without changing it", () => {
  const timeline = new Timeline({ loopTicks: 120 });
  assert.equal(timeline.loopTicks, 120);
  assert.equal(new Timeline().loopTicks, null);
  assert.deepEqual(timeline.steps, []);
  const step = timeline.then(10);
  assert.deepEqual(timeline.steps, [], "a step given no operation is left out");
  assert.equal(step.show(1).hide(2), step, "each call answers its step");
  timeline.then(5).reset(3);
  const expected = [
    {
      tick: 10,
      ops: [
        { action: "show", target: { object: 1 } },
        { action: "hide", target: { object: 2 } },
      ],
    },
    { tick: 15, ops: [{ action: "reset", target: { object: 3 } }] },
  ];
  assert.deepEqual(timeline.steps, expected);
  assert.deepEqual(timeline.steps, expected);
});

test("ANIM-19: a timeline awaited is refused where it is awaited, since its then begins a step and settles nothing", async () => {
  const timeline = new Timeline();
  timeline.then(30).show(1);
  await assert.rejects(Promise.resolve(timeline), /a Timeline is not a promise/u);
  assert.deepEqual(timeline.steps, [{ tick: 30, ops: [{ action: "show", target: { object: 1 } }] }], "and the timeline is as it was");
});

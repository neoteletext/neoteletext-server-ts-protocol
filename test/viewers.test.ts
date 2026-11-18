// Connections and viewers (viewer-state.md VS-403, VS-404): every tab is a
// connection of its own to applications, a viewer's tabs carry one viewer,
// and a connection's state ends at its `gone`.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Application, Context, PageEntry, Viewer } from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";
import { Recorder, screen } from "./recorder.ts";

const INDEX = 0x100;

/** An application that records each connection's viewer as it hears of it. */
function viewerRecorder(heard: string[], viewers: Map<number, Viewer | null>): Application {
  return {
    pages: (): PageEntry[] => [{ page: INDEX, title: "Index" }],
    start: (context): void => {
      context.publish("channel", INDEX, screen("index"));
    },
    opened: (connection, _page, context: Context): void => {
      viewers.set(connection, context.viewer(connection));
      heard.push(`opened ${connection} remembered ${context.remembered(connection)}`);
    },
    viewerBegan: (connection, viewer, remembered): void => {
      viewers.set(connection, viewer);
      heard.push(`began ${connection} ${remembered}`);
    },
    viewerLeft: (connection): void => {
      viewers.set(connection, null);
      heard.push(`left ${connection}`);
    },
    stateRefused: (connection, reason): void => {
      heard.push(`refused ${connection} ${reason}`);
    },
    gone: (connection): void => {
      heard.push(`gone ${connection}`);
    },
  };
}

test("VS-403, VS-404: alice in two tabs is two connections with one viewer, and a tab's state ends at its gone", () => {
  const heard: string[] = [];
  const viewers = new Map<number, Viewer | null>();
  const harness = new Harness([viewerRecorder(heard, viewers)]);
  const alice = harness.viewer("alice");
  const first = harness.join(alice, INDEX);
  const second = harness.join(alice, INDEX);
  assert.notEqual(first, second);
  assert.equal(viewers.get(first), viewers.get(second), "one viewer, the same object, compared by value");
  assert.equal(viewers.get(first)?.handle, alice.handle);
  assert.equal(String(viewers.get(first)), "[viewer]", "a viewer prints as a placeholder (VS-401)");
  assert.equal(JSON.stringify({ viewer: viewers.get(first) }), '{"viewer":"[viewer]"}');
  harness.close(first);
  assert.deepEqual(heard, [`opened ${first} remembered false`, `opened ${second} remembered false`, `gone ${first}`]);
});

test("VS-404: a private window is another viewer, a reset gives a new handle and tells the open tabs, and a restart keeps handles", () => {
  const heard: string[] = [];
  const viewers = new Map<number, Viewer | null>();
  const harness = new Harness([viewerRecorder(heard, viewers)]);
  const alice = harness.viewer("alice");
  assert.equal(harness.viewer("alice"), alice, "a name is one viewer");
  assert.match(alice.handle, /^[0-9a-f]{32}$/u);
  assert.notEqual(harness.privateViewer("alice").handle, alice.handle);
  harness.remember(alice, true);
  const tab = harness.join(alice, INDEX);
  assert.deepEqual(heard, [`opened ${tab} remembered true`]);
  const before = alice.handle;
  harness.forget(alice);
  assert.notEqual(alice.handle, before, "after a reset");
  assert.equal(viewers.get(tab), null);
  assert.deepEqual(heard.slice(1), [`left ${tab}`]);
  const kept = harness.viewer("bob").handle;
  harness.restart();
  assert.equal(harness.join(harness.viewer("bob"), INDEX), 1, "connection numbers start again");
  assert.equal(harness.viewer("bob").handle, kept, "handles do not change");
});

test("VS-352, VS-404: a connection with no viewer asks for state, which is granted or refused", () => {
  const heard: string[] = [];
  const viewers = new Map<number, Viewer | null>();
  const recorder = viewerRecorder(heard, viewers);
  const harness = new Harness([
    {
      ...recorder,
      input: (connection, _page, _input, context): void => {
        context.requestState(connection);
        context.offerRemember(connection);
      },
    },
  ]);
  harness.join(3, INDEX);
  assert.equal(viewers.get(3), null);
  harness.typeText(3, "x");
  assert.deepEqual(
    harness.sent.filter((line) => line["type"] === "request_state" || line["type"] === "offer_remember"),
    [
      { type: "request_state", connection: 3 },
      { type: "offer_remember", connection: 3 },
    ],
  );
  harness.grantState(3);
  assert.notEqual(viewers.get(3), null);
  harness.refuseState(3, "private");
  assert.deepEqual(heard.slice(1), ["began 3 false", "refused 3 private"]);
});

test("VS-352: ending a viewer's state sends its handle, and nothing of it is printed", () => {
  const ended: string[] = [];
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: INDEX, title: "Index" }],
      start: (context): void => {
        context.publish("channel", INDEX, screen("index"));
      },
      input: (connection, _page, _input, context): void => {
        const viewer = context.viewer(connection);
        if (viewer !== null) {
          ended.push(String(viewer));
          context.endState(viewer);
        }
      },
    },
  ]);
  const alice = harness.viewer("alice");
  const tab = harness.join(alice, INDEX);
  harness.typeText(tab, "x");
  assert.deepEqual(ended, ["[viewer]"]);
  assert.deepEqual(harness.sent.at(-1), { type: "end_state", viewer: alice.handle });
});

test("two tabs are each opened on their page, and a sound to one connection reaches it alone", () => {
  const recorder = new Recorder([{ page: INDEX, title: "Index" }]);
  recorder.onInput = (connection, _page, context): void => {
    context.sound({ connection }, { kind: "play", channel: 0, handle: 1, generation: 1, gain: 100, fade_ms: 0, loop: false, after: false, duck: 0 });
  };
  const harness = new Harness([recorder]);
  const alice = harness.viewer("alice");
  const first = harness.join(alice, INDEX);
  const second = harness.join(alice, INDEX);
  harness.typeText(first, "a");
  assert.deepEqual(
    harness.sent.filter((message) => message["type"] === "sound").map((message) => message["connections"]),
    [[first]],
  );
  assert.equal(harness.sounds(second).length, 0);
});

// Tabs are independent (DEC-6443): each connection of a server session is a
// session of its own to applications, opened on its own page, sent to on its
// own, and ended with the rest when the server's session ends.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Harness } from "../src/testing/index.ts";
import { ANY_SUB } from "../src/channel/channel.ts";
import { Recorder } from "./recorder.ts";

const SERVER_SESSION = 9;
const FIRST_TAB = 21;
const SECOND_TAB = 22;

test("two tabs of one session are each joined and opened on the same page, and both end with the session", () => {
  const recorder = new Recorder([{ page: 0x100, title: "Index" }]);
  const harness = new Harness([recorder]);
  harness.channel.connected(FIRST_TAB, SERVER_SESSION, 1, { page: 0x100, sub: ANY_SUB }, []);
  harness.channel.connected(SECOND_TAB, SERVER_SESSION, 1, { page: 0x100, sub: ANY_SUB }, []);
  harness.channel.closed(SERVER_SESSION);
  assert.deepEqual(recorder.heard, [
    `joined ${FIRST_TAB}`,
    `opened ${FIRST_TAB} 100`,
    `joined ${SECOND_TAB}`,
    `opened ${SECOND_TAB} 100`,
    `ended ${FIRST_TAB}`,
    `ended ${SECOND_TAB}`,
  ]);
});

test("a sound sent to one tab's session reaches that tab alone", () => {
  const recorder = new Recorder([{ page: 0x100, title: "Index" }]);
  recorder.onInput = (session, _page, context): void => {
    context.sound({ session }, { play: { channel: 0, handle: 1, generation: 1 } });
  };
  const harness = new Harness([recorder]);
  harness.channel.connected(FIRST_TAB, SERVER_SESSION, 1, { page: 0x100, sub: ANY_SUB }, []);
  harness.channel.connected(SECOND_TAB, SERVER_SESSION, 1, { page: 0x100, sub: ANY_SUB }, []);
  harness.channel.input(FIRST_TAB, 0x100, ANY_SUB, { kind: "key", action: "press", key: "a", text: "a" });
  const plays = harness.sent.filter((message) => message["type"] === "sound");
  assert.deepEqual(
    plays.map((message) => message["connections"]),
    [[FIRST_TAB]],
  );
});

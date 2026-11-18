// The harness gives back sounds as the members a program built (typescript.md
// TS-29), answers only as a test tells it (TS-30), and restarts as the server
// does (TS-31).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type PageEntry, Screen } from "../src/index.ts";
import type { Rule, ServerMessageRefused, SoundMember } from "../src/protocol.ts";
import { Harness } from "../src/testing/index.ts";

const LIVE_PAGE = 0x300;
const LIVE: SoundMember = { kind: "synth106_live", handle: 6, generation: 0, banks: [5] };
const BANK: SoundMember = { kind: "synth106_bank", handle: 5, generation: 0, bank: { form: "bytes", bytes: new Uint8Array([0xf0, 0x41, 0xf7]) } };
const EVERYONE: SoundMember = { kind: "gain", channel: 0, gain: 50, fade_ms: 0 };

/** A channel that announces its live sound to each connection that opens page 300, and tells everyone a gain. */
function announcing(refusals: ServerMessageRefused[]): Harness {
  return new Harness([
    {
      pages: (): PageEntry[] => [{ page: LIVE_PAGE, title: "Live" }],
      start: (context): void => {
        context.publish("channel", LIVE_PAGE, new Screen());
      },
      opened: (connection, _page, context): void => {
        context.sound({ connection }, BANK);
        context.sound({ connection }, LIVE);
        context.sound({ connections: "all" }, EVERYONE);
      },
      refused: (refusal): void => {
        refusals.push(refusal);
      },
    },
  ]);
}

test("TS-29: sounds, soundsOfKind and soundsToEveryone give the members as built, bytes as Uint8Array", () => {
  const harness = announcing([]);
  harness.join(1, LIVE_PAGE);
  assert.deepEqual(harness.sounds(1), [BANK, LIVE, EVERYONE]);
  const [bank] = harness.soundsOfKind(1, "synth106_bank");
  assert.ok(bank?.bank.form === "bytes" && bank.bank.bytes instanceof Uint8Array);
  assert.deepEqual(harness.soundsOfKind(1, "synth106_live"), [LIVE]);
  assert.deepEqual(harness.soundsToEveryone(), [EVERYONE]);
  assert.deepEqual(harness.sounds(2), [EVERYONE], "a sound to everyone is for every connection");
});

test("TS-30: a refusal reaches the channel with exactly its fields; one of a sound never written, or of a rule outside the list, fails the test", () => {
  const refusals: ServerMessageRefused[] = [];
  const harness = announcing(refusals);
  harness.join(1, LIVE_PAGE);
  harness.refuse(LIVE, "banks[0]", "unknown_bank", "no bank 5 of generation 0");
  assert.deepEqual(refusals, [
    {
      type: "refused",
      message: "sound",
      path: "banks[0]",
      rule: "unknown_bank",
      detail: "no bank 5 of generation 0",
      sound: { kind: "synth106_live", handle: 6, generation: 0 },
    },
  ]);
  assert.throws(() => {
    harness.refuse({ ...LIVE, handle: 7 }, "", "unknown_bank", "d");
  }, /never wrote/u);
  assert.throws(() => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a rule the type refuses, to see validation refuse it at run time
    harness.refuse(LIVE, "", "no_such_rule" as Rule, "d");
  }, /never sends that: rule: not_listed/u);
});

test("TS-31: after a restart connection numbers start again and the channel announces its live sound again", () => {
  const harness = announcing([]);
  harness.join(harness.viewer("alice"), LIVE_PAGE);
  harness.restart();
  const before = harness.sent.length;
  assert.equal(harness.join(harness.viewer("alice"), LIVE_PAGE), 1);
  assert.ok(
    harness.sent.slice(before).some((line) => line["kind"] === "synth106_live"),
    "the live sound, unknown to a server started again (MIDI-94), is announced again",
  );
});

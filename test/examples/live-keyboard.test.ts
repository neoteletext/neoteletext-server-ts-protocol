// typescript.md 4.2: the viewer plays synth106 from the keyboard on page 310,
// the program feeding a live sound every 100 milliseconds (TS-43).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Context, Input } from "../../src/index.ts";
import type { SoundPlayMember, SoundStopMember, SoundSynth106EventsMember, SoundSynth106LiveMember, Synth106Event } from "../../src/protocol.ts";
import { Harness } from "../../src/testing/index.ts";
import { BRASS_BANK, brassBank } from "./patch-by-fields.ts";
import { INDEX, expected, serving, soundLines } from "./shared.ts";

const KEYBOARD_PAGE = 0x310;
const LIVE_HANDLE = 6;
/** Middle C, MIDI note 60, then the white keys up to the next C. */
const KEY_NOTES: Readonly<Record<string, number>> = { a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72 };
/** How often the program says how far it has given every event: well inside MIDI-20's 2,000,000 microseconds a message. */
const FEED_MS = 100;
const MICROSECONDS_A_MILLISECOND = 1_000;
/** `until_us` is one microsecond past now, so that an event stamped now is before it (SRV-74). */
const PAST_NOW_US = 1;

/** One connection's live sound: its start on the program's clock and the events not yet sent. */
interface Player {
  readonly startMs: number;
  pending: Synth106Event[];
}

const players = new Map<number, Player>();
const nowUs = (player: Player, context: Context): number => (context.now() - player.startMs) * MICROSECONDS_A_MILLISECOND;

function opened(connection: number, page: number, context: Context): void {
  if (page !== KEYBOARD_PAGE) {
    return;
  }
  const live: SoundSynth106LiveMember = { kind: "synth106_live", handle: LIVE_HANDLE, generation: 0, banks: [BRASS_BANK] };
  const play: SoundPlayMember = {
    kind: "play",
    channel: 1,
    handle: LIVE_HANDLE,
    generation: 0,
    gain: 100,
    fade_ms: 0,
    loop: false,
    after: false,
    duck: 0,
    page: "310",
  };
  context.sound({ connection }, brassBank());
  context.sound({ connection }, live);
  context.sound({ connection }, play);
  players.set(connection, { startMs: context.now(), pending: [] });
  context.wakeIn(FEED_MS);
}

function input(connection: number, _page: number, given: Input, context: Context): boolean {
  const player = players.get(connection);
  const key = given.kind === "key" && given.action !== "repeat" ? KEY_NOTES[given.text ?? given.key] : undefined;
  if (player === undefined || key === undefined || given.kind !== "key") {
    return false;
  }
  const time_us = nowUs(player, context);
  player.pending.push(
    given.action === "press" ? { event: "note_on", time_us, channel: 1, key, velocity: 100 } : { event: "note_off", time_us, channel: 1, key, velocity: 64 },
  );
  return true;
}

function wake(context: Context): void {
  for (const [connection, player] of players) {
    const events: SoundSynth106EventsMember = {
      kind: "synth106_events",
      handle: LIVE_HANDLE,
      generation: 0,
      until_us: nowUs(player, context) + PAST_NOW_US,
      events: player.pending,
    };
    context.sound({ connection }, events);
    player.pending = [];
  }
  if (players.size > 0) {
    context.wakeIn(FEED_MS);
  }
}

function leftPage(connection: number, _page: number, context: Context): void {
  if (players.delete(connection)) {
    const stop: SoundStopMember = { kind: "stop", channel: 1, fade_ms: 20 };
    context.sound({ connection }, stop);
  }
}

const keyboard = serving([KEYBOARD_PAGE], { opened, input, wake, leftPage });

test("TS-43, 4.2: a key pressed at 30 ms and released at 250 ms on page 310, left at 350 ms, writes the fixture's lines", () => {
  const harness = new Harness([keyboard]);
  harness.join(1, KEYBOARD_PAGE);
  harness.runUntil(30);
  harness.key(1, "a", "press");
  harness.runUntil(250);
  harness.key(1, "a", "release");
  harness.runUntil(350);
  harness.open(1, INDEX);
  harness.runUntil(500);
  assert.deepEqual(soundLines(harness), expected("live-keyboard"));
  assert.deepEqual(harness.errors, []);
});

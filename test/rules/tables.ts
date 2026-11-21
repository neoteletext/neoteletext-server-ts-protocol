// The worked examples of page-rules.md section 7.5, the `painted` trigger's
// table (DEC-7031 item 6) and the music player's
// table of RULE-93 (music-player.ts), each written as a program writes it: a typed table, its
// audience, its page and its sub-code, built with the kit's builders where
// one makes the object. The type check holds each to the schema's types,
// and test/rules/examples.test.ts to the document's JSON.

import { type Audience, Key, characterKey, namedKey, noteOff, noteOn, phase, row, variable } from "../../src/index.ts";
import type { AnimationOp, RuleCommand, RuleTable } from "../../src/protocol.ts";
import { MUSIC_PLAYER } from "./music-player.ts";

/** One example: the fixture's name for it, who it is sent to, its page, its sub-code and its table. */
export interface Example {
  readonly example: string;
  readonly to: Audience;
  readonly page: number;
  readonly sub: number;
  readonly table: RuleTable;
}

const EVERYONE: Audience = { connections: "all" };
/** A group's `report` of the firing (RULE-22). */
const REPORT = { type: "report" } as const satisfies RuleCommand;
/** The sub-code the examples of section 7.5 name. */
const FIRST = 0x0000;
/** The sub-code of every music player page (RULE-91). */
const MUSIC_SUB = 0x0001;

/** An `animate` command of one operation or more (ANIM-21). */
function animate(...ops: AnimationOp[]): RuleCommand {
  return { type: "animate", ops };
}

/** Example 1: a text field's keys are sent, and nothing else. */
const TEXT_FIELD: RuleTable = {
  rules: [{ name: "typed", on: [{ event: "key", keys: "any", repeat: true }, { event: "text" }], do: [REPORT] }],
};

/** Example 2: a button that lights at once and tells the channel. */
const BUTTON: RuleTable = {
  rules: [
    {
      name: "vote_down",
      on: { event: "press", target: { control: 3 }, button: 0 },
      do: [animate({ action: "look", target: { control: 3 }, look: "pressed" })],
    },
    {
      name: "vote",
      on: { event: "release", target: { control: 3 }, button: 0 },
      echo: true,
      do: [animate({ action: "look", target: { control: 3 }, look: "normal" })],
    },
  ],
};

/** Example 3: a counter held to a range, reported in the group that changes it. */
const COUNTER: RuleTable = {
  groups: [
    {
      name: "up",
      commands: [
        { type: "variable", op: "inc", variable: "v0" },
        { type: "variable", op: "min", variable: "v0", value: 10 },
        { type: "report", value: variable("v0") },
      ],
    },
    {
      name: "down",
      commands: [
        { type: "variable", op: "dec", variable: "v0" },
        { type: "variable", op: "max", variable: "v0", value: 0 },
        { type: "report", value: variable("v0") },
      ],
    },
  ],
  rules: [
    { name: "start", on: { event: "open" }, do: [{ type: "variable", op: "set", variable: "v0", value: 5 }] },
    { name: "up", on: { event: "key", keys: [namedKey(Key.Up)], repeat: true }, run: "up" },
    { name: "down", on: { event: "key", keys: [namedKey(Key.Down)], repeat: true }, run: "down" },
  ],
};

/** Example 4: a sprite that walks with the arrow keys, and a collision. */
const SPRITE: RuleTable = {
  rules: [
    {
      name: "left",
      on: { event: "key", keys: [namedKey(Key.Left)], repeat: true },
      do: [animate({ action: "move", target: { object: 10 }, x: -8, y: 0, relative: true })],
    },
    {
      name: "right",
      on: { event: "key", keys: [namedKey(Key.Right)], repeat: true },
      do: [animate({ action: "move", target: { object: 10 }, x: 8, y: 0, relative: true })],
    },
    {
      name: "hit",
      on: { event: "becomes" },
      when: { overlaps: [{ object: 10 }, { object: 20 }] },
      echo: true,
      do: [
        { type: "sound", kind: "play", channel: 1, handle: 5, generation: 1, gain: 100, fade_ms: 5, duck: 0, loop: false, after: false },
        animate({ action: "hide", target: { object: 20 } }),
      ],
    },
  ],
};

/** Example 5: a blinking prompt and a timeout. */
const PROMPT: RuleTable = {
  rules: [
    {
      name: "start",
      on: { event: "open" },
      do: [animate({ action: "cycle", target: { object: 7 }, first: 0, last: 1, period: 30, once: false }), { type: "timer", op: "start", timer: "t0" }],
    },
    { name: "awake", on: { event: "key", keys: "any" }, do: [{ type: "timer", op: "start", timer: "t0" }] },
    { name: "asleep", on: { event: "after", ticks: 600, timer: "t0" }, do: [REPORT] },
  ],
};

/** The value example 6 reads: how many notes are down on part 1 of the synth106 sound on audio channel 0. */
const NOTES = { of: "synth", channel: 0, family: "synth106", part: 1, property: "notes" } as const;

/** Example 6: a synthesizer's own state drives the picture, and a mode. */
const SYNTH_STATE: RuleTable = {
  rules: [
    {
      name: "gate_on",
      on: { event: "becomes" },
      when: {
        and: [
          { read: variable("v0"), op: "==", value: 0 },
          { read: NOTES, op: ">", value: 0 },
        ],
      },
      do: [animate({ action: "show", target: { object: 50 } })],
    },
    {
      name: "gate_off",
      on: { event: "becomes" },
      when: {
        or: [
          { read: variable("v0"), op: "!=", value: 0 },
          { read: NOTES, op: "==", value: 0 },
        ],
      },
      do: [animate({ action: "hide", target: { object: 50 } })],
    },
    { name: "help", on: { event: "key", keys: [characterKey("h")] }, do: [{ type: "variable", op: "set", variable: "v0", value: 1 }] },
    { name: "back", on: { event: "key", keys: [namedKey(Key.Escape)] }, do: [{ type: "variable", op: "set", variable: "v0", value: 0 }] },
    { name: "open_filter", on: { event: "wheel", target: { object: 51 } }, do: [REPORT] },
  ],
};

/** Example 7: a sequence started on the next beat, a timer's phase, and a cue. */
const BEAT: RuleTable = {
  groups: [
    { name: "n1", commands: [noteOn(0, 1, 60, 100)] },
    { name: "n2", commands: [noteOff(0, 1, 60, 64), noteOn(0, 1, 64, 100)] },
    { name: "n3", commands: [noteOff(0, 1, 64, 64), noteOn(0, 1, 67, 100)] },
    { name: "n4", commands: [noteOff(0, 1, 67, 64)] },
    { name: "lit", commands: [animate({ action: "show", target: { object: 9 } })] },
    { name: "unlit", commands: [animate({ action: "hide", target: { object: 9 } })] },
  ],
  sequences: [
    {
      name: "fanfare",
      length: 32,
      repeat: 2,
      steps: [
        { tick: 0, run: "n1" },
        { tick: 8, run: "n2" },
        { tick: 16, run: "n3" },
        { tick: 24, run: "n4" },
      ],
    },
    {
      name: "flash",
      length: 6,
      repeat: 1,
      steps: [
        { tick: 0, run: "lit" },
        { tick: 5, run: "unlit" },
      ],
    },
  ],
  rules: [
    { name: "start", on: { event: "open" }, do: [{ type: "timer", op: "start", timer: "t0" }] },
    {
      name: "space",
      on: { event: "key", keys: [characterKey(" ")] },
      do: [{ type: "sequence", op: "start", sequence: "fanfare", at: { beat: { timer: "t0", ticks: 30 } } }],
    },
    {
      name: "on_beat",
      on: { event: "key", keys: [characterKey("b")] },
      when: { read: phase("t0", 30), in_range: [0, 3] },
      echo: true,
      do: [noteOn(0, 10, 37, 110)],
    },
    { name: "bar", on: { event: "cue", channel: 1, number: 1 }, do: [{ type: "sequence", op: "start", sequence: "flash" }] },
  ],
};

/** Example 8: a long press and a double press, with timers and a variable. */
const PRESSES: RuleTable = {
  rules: [
    { name: "hold_start", on: { event: "key", keys: [namedKey(Key.Enter)] }, do: [{ type: "timer", op: "start", timer: "t1" }] },
    { name: "hold_end", on: { event: "key_up", keys: [namedKey(Key.Enter)] }, do: [{ type: "timer", op: "stop", timer: "t1" }] },
    { name: "long_press", on: { event: "after", ticks: 30, timer: "t1" }, do: [REPORT] },
    {
      name: "first",
      on: { event: "key", keys: [characterKey(" ")] },
      when: { read: variable("v0"), op: "==", value: 0 },
      do: [
        { type: "variable", op: "set", variable: "v0", value: 1 },
        { type: "timer", op: "start", timer: "t2" },
      ],
    },
    {
      name: "second",
      on: { event: "key", keys: [characterKey(" ")] },
      when: { read: variable("v0"), op: "==", value: 1 },
      do: [{ type: "variable", op: "set", variable: "v0", value: 0 }, { type: "timer", op: "stop", timer: "t2" }, REPORT],
    },
    { name: "expire", on: { event: "after", ticks: 20, timer: "t2" }, do: [{ type: "variable", op: "set", variable: "v0", value: 0 }] },
  ],
};

/** The numbered drawing whose painting shows the next one, and the one it shows (DEC-7031 item 8's show). */
const TITLE_DRAWING = 10;
const AFTER_TITLE_DRAWING = 11;
/** A panel's drawing is its row's parameter plus this, and the drawing its painting shows that parameter plus the other. */
const FIRST_PANEL_DRAWING = 20;
const FIRST_CAPTION_DRAWING = 30;

/** Painting as a show (DEC-7031 items 4 and 6, REQ-7026): the whole picture painted is reported, and a drawing painted shows the next, one by its number and one a row. */
const PAINTED: RuleTable = {
  rows: { panels: [1, 2, 3] },
  rules: [
    { name: "received", on: { event: "painted", target: "page" }, do: [REPORT] },
    {
      name: "title_painted",
      on: { event: "painted", target: { object: TITLE_DRAWING } },
      do: [animate({ action: "show", target: { object: AFTER_TITLE_DRAWING } })],
    },
    {
      name: "panel_painted",
      rows: "panels",
      on: { event: "painted", target: { object: row(FIRST_PANEL_DRAWING) } },
      do: [animate({ action: "show", target: { object: row(FIRST_CAPTION_DRAWING) } })],
    },
  ],
};

/** Every example, by the fixture's names. */
export const EXAMPLES: readonly Example[] = [
  { example: "example-1", to: EVERYONE, page: 0x120, sub: FIRST, table: TEXT_FIELD },
  { example: "example-2", to: EVERYONE, page: 0x130, sub: FIRST, table: BUTTON },
  { example: "example-3", to: EVERYONE, page: 0x140, sub: FIRST, table: COUNTER },
  { example: "example-4", to: EVERYONE, page: 0x150, sub: FIRST, table: SPRITE },
  { example: "example-5", to: EVERYONE, page: 0x160, sub: FIRST, table: PROMPT },
  { example: "example-6", to: EVERYONE, page: 0x170, sub: FIRST, table: SYNTH_STATE },
  { example: "example-7", to: EVERYONE, page: 0x180, sub: FIRST, table: BEAT },
  { example: "example-8", to: EVERYONE, page: 0x190, sub: FIRST, table: PRESSES },
  { example: "painted", to: EVERYONE, page: 0x1a0, sub: FIRST, table: PAINTED },
  { example: "music-player", to: { connection: 7 }, page: 0x101, sub: MUSIC_SUB, table: MUSIC_PLAYER },
];

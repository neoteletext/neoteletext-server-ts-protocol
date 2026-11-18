// The worked examples of page-rules.md section 7.5 and the music player's
// table of RULE-93, each written as a program writes it: a typed table, its
// audience and its page. The type check holds each to the schema's types,
// and test/rules/examples.test.ts to the document's JSON.

import { type Audience, Key, characterKey, level, namedKey, physicalKey } from "../../src/index.ts";
import type { PageRule, RuleTable, RuleValue } from "../../src/protocol.ts";

/** One example: the fixture's name for it, who it is sent to, its page and its table. */
export interface Example {
  readonly example: string;
  readonly to: Audience;
  readonly page: number;
  readonly table: RuleTable;
}

const EVERYONE: Audience = { connections: "all" };

/** Example 1: a text field's keys are sent, and nothing else. */
const TEXT_FIELD: RuleTable = {
  rules: [
    { name: "typed", on: { event: "key", keys: "any", repeat: true }, do: [{ action: "send" }] },
    { name: "composed", on: { event: "text" }, do: [{ action: "send" }] },
  ],
};

/** Example 2: a button that lights at once and tells the channel. */
const BUTTON: RuleTable = {
  rules: [
    {
      name: "vote_down",
      on: { event: "press", target: { control: 3 }, button: 0 },
      do: [{ action: "look", target: { control: 3 }, look: "pressed" }],
    },
    {
      name: "vote",
      on: { event: "release", target: { control: 3 }, button: 0 },
      do: [{ action: "look", target: { control: 3 }, look: "normal" }],
      echo: true,
    },
  ],
};

/** Example 3: a counter held to a range, reported when it changes. */
const COUNTER: RuleTable = {
  variables: [{ name: "volume", min: 0, max: 10, initial: 5 }],
  timers: [{ name: "report", running: false }],
  rules: [
    {
      name: "up",
      on: { event: "key", keys: [namedKey(Key.Up)], repeat: true },
      do: [
        { action: "add", variable: "volume", amount: 1 },
        { action: "start_timer", timer: "report" },
      ],
    },
    {
      name: "down",
      on: { event: "key", keys: [namedKey(Key.Down)], repeat: true },
      do: [
        { action: "add", variable: "volume", amount: -1 },
        { action: "start_timer", timer: "report" },
      ],
    },
    { name: "tell", on: { event: "after", ticks: 1, timer: "report" }, do: [{ action: "send", value: { of: "variable", name: "volume" } }] },
  ],
};

/** Example 4: a sprite that walks with the arrow keys, and a collision. */
const SPRITE: RuleTable = {
  rules: [
    {
      name: "left",
      on: { event: "key", keys: [namedKey(Key.Left)], repeat: true },
      do: [{ action: "move", target: { object: 10 }, x: -8, y: 0, relative: true }],
    },
    {
      name: "right",
      on: { event: "key", keys: [namedKey(Key.Right)], repeat: true },
      do: [{ action: "move", target: { object: 10 }, x: 8, y: 0, relative: true }],
    },
    {
      name: "hit",
      on: { event: "becomes", condition: { overlaps: [{ object: 10 }, { object: 20 }] } },
      do: [
        { action: "play", channel: 1, handle: 5, generation: 1, gain: 100, fade_ms: 5, loop: false },
        { action: "hide", target: { object: 20 } },
      ],
      echo: true,
    },
  ],
};

/** Example 5: a blinking prompt and a timeout. */
const PROMPT: RuleTable = {
  timers: [{ name: "idle", running: true }],
  rules: [
    { name: "blink", on: { event: "open" }, do: [{ action: "cycle", target: { object: 7 }, first: 0, last: 1, period: 30, once: false }] },
    { name: "awake", on: { event: "key", keys: "any" }, do: [{ action: "start_timer", timer: "idle" }] },
    { name: "asleep", on: { event: "after", ticks: 600, timer: "idle" }, do: [{ action: "send" }] },
  ],
};

/** The notes down on part 1 of the synth106 sound on audio channel 0. */
const NOTES: RuleValue = { of: "synth", channel: 0, family: "synth106", part: 1, property: "notes" };
/** That sound's filter cutoff. */
const CUTOFF: RuleValue = { of: "synth", channel: 0, family: "synth106", part: 1, property: "field", field: "vcf_frequency" };

/** Example 6: a synthesizer's own state drives the picture. */
const SYNTH_STATE: RuleTable = {
  rules: [
    { name: "gate_on", on: { event: "becomes", condition: { read: NOTES, op: ">", value: 0 } }, do: [{ action: "show", target: { object: 50 } }] },
    { name: "gate_off", on: { event: "becomes", condition: { read: NOTES, op: "==", value: 0 } }, do: [{ action: "hide", target: { object: 50 } }] },
    {
      name: "bright",
      on: { event: "becomes", condition: { read: CUTOFF, op: ">", value: 100 } },
      do: [{ action: "look", target: { object: 51 }, look: "alternative" }],
    },
    {
      name: "dull",
      on: { event: "becomes", condition: { read: CUTOFF, op: "<=", value: 100 } },
      do: [{ action: "look", target: { object: 51 }, look: "normal" }],
    },
    { name: "open_filter", on: { event: "wheel", target: { object: 51 } }, do: [{ action: "send" }] },
  ],
  subpages: [{ sub: "0002", off: ["gate_on", "gate_off"] }],
};

/** The music player's audio channel, on which its local sound plays (RULE-91). */
const CHANNEL = 0;
/** The MIDI channel of the local sound's one part. */
const PART = 1;
/** The first of the thirteen notes, C4, and the computer keys that play them in order (RULE-92). */
const FIRST_NOTE = 60;
const NOTE_KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"];
/** A key's drawing is `100 + note - 59` (RULE-92). */
const FIRST_KEY_DRAWING = 101;
/** The velocity of a played note, and of its release (RULE-93). */
const NOTE_ON_VELOCITY = 100;
const NOTE_OFF_VELOCITY = 64;
/** The level at which each of the meter's eight segments, drawings 301 to 308, is shown (RULE-93). */
const METER_THRESHOLDS = [4, 8, 16, 32, 64, 96, 128, 192];
const FIRST_METER_DRAWING = 301;
/** The four sound names, drawings 401 to 404, each chosen by its number key (RULE-92). */
const SOUND_DRAWINGS = [401, 402, 403, 404];

/** A key's two rules: its press plays the note and forces the pressed look, its release ends both. */
function noteRules(character: string, index: number): PageRule[] {
  const key = FIRST_NOTE + index;
  const target = { object: FIRST_KEY_DRAWING + index };
  return [
    {
      name: `note${key}_on`,
      on: { event: "key", keys: [physicalKey(character)] },
      do: [
        { action: "midi", channel: CHANNEL, message: { event: "note_on", channel: PART, key, velocity: NOTE_ON_VELOCITY } },
        { action: "look", target, look: "pressed" },
      ],
    },
    {
      name: `note${key}_off`,
      on: { event: "key_up", keys: [physicalKey(character)] },
      do: [
        { action: "midi", channel: CHANNEL, message: { event: "note_off", channel: PART, key, velocity: NOTE_OFF_VELOCITY } },
        { action: "look", target, look: "normal" },
      ],
    },
  ];
}

/** A meter segment's two rules: shown when the level reaches its threshold, hidden when it falls below. */
function meterRules(threshold: number, index: number): PageRule[] {
  const target = { object: FIRST_METER_DRAWING + index };
  return [
    {
      name: `meter${index + 1}_on`,
      on: { event: "becomes", condition: { read: level(CHANNEL), op: ">=", value: threshold } },
      do: [{ action: "show", target }],
    },
    {
      name: `meter${index + 1}_off`,
      on: { event: "becomes", condition: { read: level(CHANNEL), op: "<", value: threshold } },
      do: [{ action: "hide", target }],
    },
  ];
}

/** A number key's rule: the program change, and that sound's name shown with the other three hidden. */
function soundRule(program: number): PageRule {
  return {
    name: `sound${program + 1}`,
    on: { event: "key", keys: [characterKey(String(program + 1))] },
    do: [
      { action: "midi", channel: CHANNEL, message: { event: "program_change", channel: PART, program } },
      ...SOUND_DRAWINGS.map((object, index) => ({ action: index === program ? "show" : "hide", target: { object } }) as const),
    ],
  };
}

/** The music player's table (RULE-93): 47 rules, none of which sends its channel anything. */
const MUSIC_PLAYER: RuleTable = {
  rules: [
    { name: "start", on: { event: "open" }, do: [{ action: "play", channel: CHANNEL, handle: 1, generation: 1, gain: 100, fade_ms: 5, loop: false }] },
    ...NOTE_KEYS.flatMap((character, index) => noteRules(character, index)),
    ...METER_THRESHOLDS.flatMap((threshold, index) => meterRules(threshold, index)),
    ...SOUND_DRAWINGS.map((_, program) => soundRule(program)),
  ],
};

/** Every example, by the fixture's names. */
export const EXAMPLES: readonly Example[] = [
  { example: "example-1", to: EVERYONE, page: 0x120, table: TEXT_FIELD },
  { example: "example-2", to: EVERYONE, page: 0x130, table: BUTTON },
  { example: "example-3", to: EVERYONE, page: 0x140, table: COUNTER },
  { example: "example-4", to: EVERYONE, page: 0x150, table: SPRITE },
  { example: "example-5", to: EVERYONE, page: 0x160, table: PROMPT },
  { example: "example-6", to: EVERYONE, page: 0x170, table: SYNTH_STATE },
  { example: "music-player", to: { connection: 7 }, page: 0x101, table: MUSIC_PLAYER },
];

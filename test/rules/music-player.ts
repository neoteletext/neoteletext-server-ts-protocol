// The music player's table of page-rules.md RULE-93, as a program writes it
// with the kit's builders and the mode helper of RULE-110: page 101's, with
// its own sound handle in the `start` group (RULE-91).

import { characterKey, fired, level, modes, namedKey, noteOff, noteOn, physicalKey, plus, row, variable, Key } from "../../src/index.ts";
import type { AnimationOp, RuleCommand, RuleGroup, RuleTable, RuleTrigger } from "../../src/protocol.ts";

/** An `animate` command of one operation or more (ANIM-21). */
function animate(...ops: AnimationOp[]): RuleCommand {
  return { type: "animate", ops };
}

/** The music player's mode (RULE-93): `v1`, 0 playing, 1 arpeggio. */
const MODE = modes("v1", ["play", "arpeggio"]);
/** The thirteen keys of the keyboard, A to K, the key of each row of the `keys` row set by place (RULE-93). */
const KEYBOARD = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"].map((character) => physicalKey(character));
/** A key's drawing is `41 + p`, its note's row parameter (RULE-92). */
const KEY_DRAWING = 41;
/** A sound's name's drawing is `401 + p`. */
const SOUND_NAME = 401;
/** A meter segment's drawing is `301 + row`, its row's place. */
const METER_SEGMENT = 301;
/** The first key's drawing, note 60's. */
const FIRST_KEY = 101;
/** The keys' drawings, notes 60 to 72. */
const KEY_DRAWINGS = KEYBOARD.map((_, place) => FIRST_KEY + place);
/** The sound names' drawings, programs 0 to 3. */
const SOUND_NAMES = [0, 1, 2, 3].map((program) => SOUND_NAME + program);
/** A key's drawing from the firing row's note. */
const KEY_OF_ROW = { object: row(KEY_DRAWING) };

/** The two triggers of a key of the keyboard: the computer key of its row, or a press on its drawing; or their releases. */
function keyTriggers(up: boolean): RuleTrigger[] {
  return [
    { event: up ? "key_up" : "key", by_row: true, keys: KEYBOARD },
    { event: up ? "release" : "press", target: KEY_OF_ROW, button: 0 },
  ];
}

/** The commands that work out the note into `v2`: the firing's `p` and the octave's shift. */
const WORK_OUT_NOTE: readonly RuleCommand[] = [
  { type: "variable", op: "set", variable: "v2", value: fired("p") },
  { type: "variable", op: "add", variable: "v2", value: plus(0, "v0") },
];

/** A step of the arpeggio: the note `above` semitones over the held key's, at `velocity`. */
function arpeggioStep(name: string, above: number, velocity: number): RuleGroup {
  return { name, commands: [{ type: "run", group: "arp_note" }, noteOn(0, 1, plus(above, "v2"), velocity)] };
}

/** The music player's table (RULE-93), with page 101's sound handle. */
export const MUSIC_PLAYER: RuleTable = {
  rows: {
    keys: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72],
    sounds: [0, 1, 2, 3],
    meter: [4, 8, 16, 32, 64, 96, 128, 192],
  },
  groups: [
    {
      name: "start",
      commands: [{ type: "sound", kind: "play", channel: 0, handle: 1, generation: 1, gain: 100, fade_ms: 5, duck: 0, loop: false, after: false }],
    },
    { name: "note_on", commands: [...WORK_OUT_NOTE, noteOn(0, 1, plus(0, "v2"), 100), animate({ action: "look", target: KEY_OF_ROW, look: "pressed" })] },
    { name: "note_off", commands: [...WORK_OUT_NOTE, noteOff(0, 1, plus(0, "v2"), 64), animate({ action: "look", target: KEY_OF_ROW, look: "normal" })] },
    { name: "silence", commands: [{ type: "local_midi", channel: 0, message: { event: "control_change", channel: 1, controller: 123, value: 0 } }] },
    {
      name: "arp_start",
      commands: [animate({ action: "look", target: KEY_OF_ROW, look: "pressed" }), { type: "sequence", op: "start", sequence: "arpeggio", at: null }],
    },
    {
      name: "arp_stop",
      commands: [
        { type: "sequence", op: "stop", sequence: "arpeggio" },
        { type: "run", group: "silence" },
        animate({ action: "look", target: KEY_OF_ROW, look: "normal" }),
      ],
    },
    { name: "arp_note", commands: [{ type: "run", group: "silence" }, ...WORK_OUT_NOTE] },
    arpeggioStep("arp_0", 0, 100),
    arpeggioStep("arp_1", 4, 90),
    arpeggioStep("arp_2", 7, 90),
    arpeggioStep("arp_3", 12, 90),
    {
      name: "arp_toggle",
      commands: [
        { type: "sequence", op: "stop", sequence: "arpeggio" },
        { type: "run", group: "silence" },
        { type: "variable", op: "toggle", variable: "v1" },
        animate(...KEY_DRAWINGS.map((drawing): AnimationOp => ({ action: "look", target: { object: drawing }, look: "normal" }))),
      ],
    },
    { name: "arp_shown", commands: [animate({ action: "show", target: { object: 405 } })] },
    { name: "arp_hidden", commands: [animate({ action: "hide", target: { object: 405 } })] },
    {
      name: "sound_pick",
      commands: [
        { type: "local_midi", channel: 0, message: { event: "program_change", channel: 1, program: row() } },
        animate(...SOUND_NAMES.map((drawing): AnimationOp => ({ action: "hide", target: { object: drawing } })), {
          action: "show",
          target: { object: row(SOUND_NAME) },
        }),
      ],
    },
    { name: "meter_show", commands: [animate({ action: "show", target: { object: fired("row", METER_SEGMENT) } })] },
    { name: "meter_hide", commands: [animate({ action: "hide", target: { object: fired("row", METER_SEGMENT) } })] },
    {
      name: "octave_up",
      commands: [
        { type: "run", group: "silence" },
        { type: "variable", op: "add", variable: "v0", value: 12 },
        { type: "variable", op: "min", variable: "v0", value: 24 },
      ],
    },
    {
      name: "octave_down",
      commands: [
        { type: "run", group: "silence" },
        { type: "variable", op: "sub", variable: "v0", value: 12 },
        { type: "variable", op: "max", variable: "v0", value: -24 },
      ],
    },
    {
      name: "panic_arm",
      commands: [
        { type: "variable", op: "set", variable: "v3", value: 1 },
        { type: "timer", op: "start", timer: "t0" },
      ],
    },
    {
      name: "panic_fire",
      commands: [
        { type: "variable", op: "set", variable: "v3", value: 0 },
        { type: "timer", op: "stop", timer: "t0" },
        { type: "run", group: "silence" },
      ],
    },
    { name: "panic_reset", commands: [{ type: "variable", op: "set", variable: "v3", value: 0 }] },
  ],
  sequences: [
    {
      name: "arpeggio",
      length: 32,
      repeat: 0,
      steps: [
        { tick: 0, run: "arp_0" },
        { tick: 8, run: "arp_1" },
        { tick: 16, run: "arp_2" },
        { tick: 24, run: "arp_3" },
      ],
    },
  ],
  rules: [
    { name: "start", on: { event: "open" }, run: "start" },
    { name: "down", rows: "keys", when: MODE.in("play"), run: "note_on", on: keyTriggers(false) },
    { name: "up", rows: "keys", when: MODE.in("play"), run: "note_off", on: keyTriggers(true) },
    { name: "arp_down", rows: "keys", when: MODE.in("arpeggio"), run: "arp_start", on: keyTriggers(false) },
    { name: "arp_up", rows: "keys", when: MODE.in("arpeggio"), run: "arp_stop", on: keyTriggers(true) },
    { name: "arp_key", on: { event: "key", keys: [physicalKey("z")] }, run: "arp_toggle" },
    { name: "arp_on", on: { event: "becomes" }, when: MODE.in("arpeggio"), run: "arp_shown" },
    { name: "arp_off", on: { event: "becomes" }, when: MODE.in("play"), run: "arp_hidden" },
    { name: "sound", rows: "sounds", on: { event: "key", by_row: true, keys: ["1", "2", "3", "4"].map((digit) => characterKey(digit)) }, run: "sound_pick" },
    { name: "meter_on", rows: "meter", on: { event: "becomes" }, when: { read: level(0), op: ">=", value: row() }, run: "meter_show" },
    { name: "meter_off", rows: "meter", on: { event: "becomes" }, when: { read: level(0), op: "<", value: row() }, run: "meter_hide" },
    { name: "octave_up", on: { event: "key", keys: [namedKey(Key.Up)] }, run: "octave_up" },
    { name: "octave_down", on: { event: "key", keys: [namedKey(Key.Down)] }, run: "octave_down" },
    { name: "panic_first", on: { event: "key", keys: [characterKey(" ")] }, when: { read: variable("v3"), op: "==", value: 0 }, run: "panic_arm" },
    { name: "panic", on: { event: "key", keys: [characterKey(" ")] }, when: { read: variable("v3"), op: "==", value: 1 }, run: "panic_fire" },
    { name: "panic_expire", on: { event: "after", ticks: 20, timer: "t0" }, run: "panic_reset" },
  ],
};

// The server's refusals of protocol 15 (page-rules.md RULE-39; animation.md
// ANIM-21) and the kit: what the schema states of a rule table, a command
// and an animation message the kit refuses before it is written, at the
// server's path and rule; what the schema cannot state is the server's alone
// to refuse, so the kit sends it (RULE-55; DEC-6462); and every refusal the
// server may send back is one a program reads.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProgram, checkServer } from "../../src/index.ts";
import { SERVER_LIMITS } from "../../src/testing/index.ts";

/** `fault` is null, or the path and rule of the fault found. */
function expectRefused(message: unknown, path: string, rule: string): void {
  const fault = checkProgram(message, SERVER_LIMITS);
  assert.deepEqual(fault === null ? null : { path: fault.path, rule: fault.rule }, { path, rule }, JSON.stringify(message).slice(0, 300));
}

function expectAccepted(message: unknown): void {
  assert.equal(checkProgram(message, SERVER_LIMITS), null, JSON.stringify(message).slice(0, 300));
}

/** The page every message here names. */
const AT = { page: "101", sub: "0001" };
/** A `rules` message of page 101 with `table`. */
const rulesOf = (table: unknown): unknown => ({ type: "rules", connections: "all", ...AT, table });
/** A rule that reports when the page opens. */
const OPEN_RULE = { name: "start", on: { event: "open" }, do: [{ type: "report" }] };
/** A rule's trigger on a key of a row (RULE-105). */
const KEY_A = { physical: "a" };

test("RULE-39, RULE-55: a rule table is held to the schema's bounds, at the server's path and rule", () => {
  expectAccepted(rulesOf(null));
  expectAccepted(rulesOf({ rules: [] }));
  expectAccepted(rulesOf({ rules: Array.from({ length: 64 }, () => OPEN_RULE) }));
  expectRefused({ type: "rules", connections: "all", page: "101", table: null }, "", "missing_field");
  expectRefused(rulesOf({ rules: Array.from({ length: 65 }, () => OPEN_RULE) }), "table.rules", "too_long");
  expectRefused(rulesOf({}), "table", "missing_field");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, do: Array.from({ length: 33 }, () => ({ type: "report" })) }] }), "table.rules[0].do", "too_long");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, name: "Start" }] }), "table.rules[0].name", "wrong_type");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, bogus: 1 }] }), "table.rules[0]", "unknown_field");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, on: { event: "every", ticks: 216_001 } }] }), "table.rules[0].on.ticks", "out_of_range");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, on: Array.from({ length: 5 }, () => ({ event: "open" })) }] }), "table.rules[0].on", "too_long");
  expectRefused(rulesOf({ rules: [OPEN_RULE], groups: [{ name: "empty", commands: [] }] }), "table.groups[0].commands", "too_short");
  expectRefused(
    rulesOf({ rules: [OPEN_RULE], sequences: Array.from({ length: 9 }, (_, index) => ({ name: `s${index}`, length: 1, repeat: 0, steps: [] })) }),
    "table.sequences",
    "too_long",
  );
  // The first form's declarations are gone (DEC-6587 items 4 and 8): a table has no variables, timers or sub-page lists.
  expectRefused(rulesOf({ rules: [OPEN_RULE], variables: [] }), "table", "unknown_field");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ action: "send" }] }] }), "table.rules[0].do[0]", "missing_field");
  // A variable is v0 to v15 and a timer t0 to t7 (RULE-36).
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ type: "variable", op: "inc", variable: "v16" }] }] }), "table.rules[0].do[0].variable", "not_listed");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ type: "timer", op: "start", timer: "idle" }] }] }), "table.rules[0].do[0].timer", "not_listed");
  expectRefused(
    rulesOf({ rules: [{ ...OPEN_RULE, do: [{ type: "local_midi", channel: 4, message: { event: "note_on", channel: 1, key: 60, velocity: 100 } }] }] }),
    "table.rules[0].do[0].channel",
    "out_of_range",
  );
  expectRefused({ type: "query_state", connection: 7, ...AT, request: 0 }, "request", "out_of_range");
  expectAccepted({ type: "query_state", connection: 7, ...AT, request: 4_294_967_295 });
});

test("RULE-39, DEC-6635: what the second form withdrew is refused by the schema", () => {
  // The triggers held, double, press_held and double_press (item 7).
  for (const event of ["held", "double", "press_held", "double_press"]) {
    assert.notEqual(checkProgram(rulesOf({ rules: [{ ...OPEN_RULE, on: { event, keys: [KEY_A], ticks: 30 } }] }), SERVER_LIMITS), null, event);
  }
  // A row of several parameters, and a key from a row's parameter (item 8).
  assert.notEqual(checkProgram(rulesOf({ rules: [OPEN_RULE], rows: { keys: [{ p0: 60, p1: 1 }] } }), SERVER_LIMITS), null);
  assert.notEqual(
    checkProgram(rulesOf({ rules: [{ ...OPEN_RULE, rows: "keys", on: { event: "key", keys: [{ physical: { row: "p0" } }] } }] }), SERVER_LIMITS),
    null,
  );
  // A run armed for later (item 6).
  expectRefused({ type: "run", connections: [7], ...AT, group: "flash", at: { tick: 5 } }, "", "unknown_field");
  // The state of a page has no armed runs.
  const state = {
    type: "page_state",
    connection: 7,
    ...AT,
    request: 1,
    tick: 0,
    table: false,
    variables: Array.from({ length: 16 }, () => 0),
    timers: {},
    sequences: {},
    targets: [],
    values: [],
  };
  assert.equal(checkServer(state), null);
  assert.notEqual(checkServer({ ...state, armed: 0 }), null);
});

test("RULE-39, RULE-55, DEC-6462: what the schema cannot state of a table is the server's to refuse, and the kit sends it", () => {
  const level = { read: { of: "sound", channel: 0, property: "level" }, op: ">=", value: 4 };
  // invalid_rules: both run and do, or neither; a becomes rule without a when; first above last; low above high; "any" where one target is required; a row's p or by_row without rows; a by_row key set of another count than the rows; a stop with an at; a phase without a period.
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, run: "start" }] }));
  expectAccepted(rulesOf({ rules: [{ name: "idle", on: { event: "open" } }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, on: { event: "becomes" } }] }));
  expectAccepted(
    rulesOf({ rules: [{ ...OPEN_RULE, do: [{ type: "animate", ops: [{ action: "cycle", target: { object: 1 }, first: 3, last: 1, period: 1 }] }] }] }),
  );
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, when: { read: level.read, in_range: [5, 1] } }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ type: "animate", ops: [{ action: "show", target: { object: "any" } }] }] }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, on: { event: "press", target: { object: { plus: 41, row: "p" } } } }] }));
  expectAccepted(rulesOf({ rows: { keys: [60, 62] }, rules: [{ ...OPEN_RULE, rows: "keys", on: { event: "key", by_row: true, keys: [KEY_A] } }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ type: "sequence", op: "stop", sequence: null, at: { tick: 3 } }] }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, when: { read: { of: "timer", timer: "t0", property: "phase" }, in_range: [0, 3] } }] }));
  // invalid_group: a ring of groups; a play with a page.
  expectAccepted(
    rulesOf({
      groups: [
        { name: "one", commands: [{ type: "run", group: "two" }] },
        { name: "two", commands: [{ type: "run", group: "one" }] },
      ],
      rules: [OPEN_RULE],
    }),
  );
  // unknown_name, duplicate_name and unknown_parameter.
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ type: "run", group: "undeclared" }] }] }));
  expectAccepted(rulesOf({ rules: [OPEN_RULE, OPEN_RULE] }));
  const field = { of: "synth", channel: 0, family: "synth106", part: 1, property: "field", field: "no_such_field" };
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, when: { read: field, op: ">", value: 0 } }] }));
  // rules_over_limit: a condition nested four operators deep.
  const deep = { not: { not: { not: { not: level } } } };
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, when: deep }] }));
  // invalid_command: an amount, a fired value or a report of the firing sent directly.
  expectAccepted({ type: "variable", connections: [7], ...AT, op: "add", variable: "v0", value: { plus: 1, row: "p" } });
  expectAccepted({ type: "report", connections: [7], ...AT });
});

test("RULE-114, RULE-39: the commands sent directly are held to the schema's bounds", () => {
  const to = { connections: [7], ...AT };
  expectAccepted({ type: "local_midi", ...to, channel: 0, message: { event: "pitch_bend", channel: 16, value: 16_383 } });
  expectRefused({ type: "local_midi", ...to, channel: 0, message: { event: "pitch_bend", channel: 16, value: 16_384 } }, "message.value", "out_of_range");
  expectRefused(
    { type: "local_midi", ...to, channel: 0, message: { event: "note_on", channel: 17, key: 60, velocity: 100 } },
    "message.channel",
    "out_of_range",
  );
  expectRefused({ type: "variable", ...to, op: "double", variable: "v0" }, "op", "not_listed");
  expectRefused({ type: "timer", ...to, op: "pause", timer: "t0" }, "op", "not_listed");
  expectRefused({ type: "run", ...to }, "", "missing_field");
  expectAccepted({ type: "sequence", ...to, op: "start", sequence: "pulse", at: { beat: { timer: "page", ticks: 216_000 } } });
  expectRefused({ type: "sequence", ...to, op: "start", sequence: "pulse", at: { beat: { timer: "t0", ticks: 216_001 } } }, "at.beat.ticks", "out_of_range");
});

test("RULE-39, ANIM-21: every refusal protocol 15 adds is one the server may send, and a program reads it", () => {
  const added = [
    "rules_over_limit",
    "invalid_rules",
    "invalid_group",
    "invalid_command",
    "unknown_name",
    "duplicate_name",
    "unknown_parameter",
    "too_frequent",
    "not_answered",
    "frame_order",
    "frame_too_large",
    "invalid_animation",
    "invalid_sprites",
    "invalid_naplps_objects",
    "invalid_sheet",
    "sheet_too_large",
    "too_many_timelines",
  ];
  for (const rule of added) {
    assert.equal(checkServer({ type: "refused", message: "rules", path: "table.rules[0]", rule, detail: "d", request: null, sound: null }), null, rule);
  }
  assert.equal(checkServer({ type: "refused", message: "rules", path: "", rule: "no_such_rule", detail: "d" })?.rule, "not_listed");
});

test("ANIM-17, ANIM-21: the animation messages are held to the schema's bounds, at the server's path and rule", () => {
  const at = { connections: "all", page: "150", sub: "0001" };
  const show = { action: "show", target: { object: 10 } };
  expectAccepted({ type: "frame", ...at, mark: "begin" });
  expectRefused({ type: "frame", ...at, mark: "middle" }, "mark", "not_listed");
  expectAccepted({ type: "animate", ...at, ops: Array.from({ length: 64 }, () => show) });
  expectRefused({ type: "animate", ...at, ops: Array.from({ length: 65 }, () => show) }, "ops", "too_long");
  expectRefused({ type: "animate", ...at, ops: [{ action: "frame", target: { object: 10 }, frame: 16 }] }, "ops[0].frame", "out_of_range");
  expectAccepted({ type: "sprites", ...at, sprites: [] });
  expectRefused({ type: "sprites", ...at, sprites: [{ number: 1 }] }, "sprites[0]", "missing_field");
  expectAccepted({ type: "naplps_objects", ...at, objects: [] });
  expectAccepted({ type: "sprite_sheet", ...at, kind: "regis", data: "RChCNDEp" });
  expectRefused({ type: "sprite_sheet", connections: "all", page: "150", kind: "regis", data: "RChCNDEp" }, "", "missing_field");
  expectRefused({ type: "sprite_sheet", ...at, kind: "sixel", data: "" }, "kind", "not_listed");
  const step = { tick: 0, ops: [show] };
  expectAccepted({ type: "timeline", ...at, id: 1, loop_ticks: null, steps: [step] });
  expectRefused({ type: "timeline", ...at, id: 65_536, steps: [step] }, "id", "out_of_range");
  expectRefused({ type: "timeline", ...at, id: 1, steps: [] }, "steps", "too_short");
  expectRefused({ type: "timeline", ...at, id: 1, steps: Array.from({ length: 1025 }, () => step) }, "steps", "too_long");
  expectRefused({ type: "timeline", ...at, id: 1, steps: [{ tick: 216_001, ops: [show] }] }, "steps[0].tick", "out_of_range");
  // Steps out of order are the server's to refuse; the kit's builder sorts them.
  expectAccepted({ type: "timeline", ...at, id: 1, steps: [{ tick: 30, ops: [show] }, step] });
  expectAccepted({ type: "timeline_stop", ...at, id: 1 });
  expectRefused({ type: "timeline_stop", connections: "all", page: "150", id: 1 }, "", "missing_field");
  // An object page is held to a published sub-page's rules: a page's 3F7F is no object page's.
  expectRefused({ type: "object_page", ...at, object: { page: "1FE", sub: "0000" } }, "object", "missing_field");
});

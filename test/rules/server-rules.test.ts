// The server's refusals of protocol 14 (page-rules.md RULE-39; animation.md
// ANIM-21) and the kit: what the schema states of a rule table and of an
// animation message the kit refuses before it is written, at the server's
// path and rule; what the schema cannot state is the server's alone to
// refuse, so the kit sends it (RULE-55; DEC-6462); and every refusal the
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

/** A `rules` message of page 101 with `table`. */
const rulesOf = (table: unknown): unknown => ({ type: "rules", connections: "all", page: "101", table });
/** A rule that sends its own event when the page opens. */
const OPEN_RULE = { name: "start", on: { event: "open" }, do: [{ action: "send" }] };

test("RULE-39, RULE-55: a rule table is held to the schema's bounds, at the server's path and rule", () => {
  expectAccepted(rulesOf(null));
  expectAccepted(rulesOf({ rules: [] }));
  expectAccepted(rulesOf({ rules: Array.from({ length: 64 }, () => OPEN_RULE) }));
  expectRefused(rulesOf({ rules: Array.from({ length: 65 }, () => OPEN_RULE) }), "table.rules", "too_long");
  expectRefused(rulesOf({}), "table", "missing_field");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, do: Array.from({ length: 17 }, () => ({ action: "send" })) }] }), "table.rules[0].do", "too_long");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, name: "Start" }] }), "table.rules[0].name", "wrong_type");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, bogus: 1 }] }), "table.rules[0]", "unknown_field");
  expectRefused(rulesOf({ rules: [{ ...OPEN_RULE, on: { event: "every", ticks: 216_001 } }] }), "table.rules[0].on.ticks", "out_of_range");
  expectRefused(
    rulesOf({ rules: [OPEN_RULE], variables: Array.from({ length: 33 }, () => ({ name: "v", min: 0, max: 1, initial: 0 })) }),
    "table.variables",
    "too_long",
  );
  expectRefused(
    rulesOf({ rules: [{ ...OPEN_RULE, do: [{ action: "midi", channel: 4, message: { event: "note_on", channel: 1, key: 60, velocity: 100 } }] }] }),
    "table.rules[0].do[0].channel",
    "out_of_range",
  );
  expectRefused({ type: "query_state", connection: 7, page: "101", request: 0 }, "request", "out_of_range");
  expectAccepted({ type: "query_state", connection: 7, page: "101", request: 4_294_967_295 });
});

test("RULE-39, RULE-55, DEC-6462: what the schema cannot state of a table is the server's to refuse, and the kit sends it", () => {
  const level = { read: { of: "sound", channel: 0, property: "level" }, op: ">=", value: 4 };
  // invalid_rules: no actions and no echo; a becomes rule with a when; first above last; low above high; min above max; "any" where one target is required.
  expectAccepted(rulesOf({ rules: [{ name: "silent", on: { event: "open" }, do: [] }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, on: { event: "becomes", condition: level }, when: level }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ action: "cycle", target: { object: 1 }, first: 3, last: 1, period: 1 }] }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, when: { read: level.read, in_range: [5, 1] } }] }));
  expectAccepted(rulesOf({ rules: [OPEN_RULE], variables: [{ name: "v", min: 2, max: 1, initial: 9 }] }));
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ action: "show", target: { object: "any" } }] }] }));
  // unknown_name, duplicate_name and unknown_parameter.
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, do: [{ action: "add", variable: "undeclared", amount: 1 }] }] }));
  expectAccepted(rulesOf({ rules: [OPEN_RULE, OPEN_RULE] }));
  const field = { of: "synth", channel: 0, family: "synth106", part: 1, property: "field", field: "no_such_field" };
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, when: { read: field, op: ">", value: 0 } }] }));
  // rules_over_limit: a condition nested four operators deep.
  const deep = { not: { not: { not: { not: level } } } };
  expectAccepted(rulesOf({ rules: [{ ...OPEN_RULE, when: deep }] }));
});

test("RULE-39, ANIM-21: every refusal protocol 14 adds is one the server may send, and a program reads it", () => {
  const added = [
    "rules_over_limit",
    "invalid_rules",
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

test("ANIM-21: the animation messages are held to the schema's bounds, at the server's path and rule", () => {
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
  expectAccepted({ type: "sprite_sheet", connections: "all", page: "150", kind: "regis", data: "RChCNDEp" });
  expectRefused({ type: "sprite_sheet", connections: "all", page: "150", kind: "sixel", data: "" }, "kind", "not_listed");
  const step = { tick: 0, ops: [show] };
  expectAccepted({ type: "timeline", ...at, id: 1, loop_ticks: null, steps: [step] });
  expectRefused({ type: "timeline", ...at, id: 65_536, steps: [step] }, "id", "out_of_range");
  expectRefused({ type: "timeline", ...at, id: 1, steps: [] }, "steps", "too_short");
  expectRefused({ type: "timeline", ...at, id: 1, steps: Array.from({ length: 1025 }, () => step) }, "steps", "too_long");
  expectRefused({ type: "timeline", ...at, id: 1, steps: [{ tick: 216_001, ops: [show] }] }, "steps[0].tick", "out_of_range");
  // Steps out of order are the server's to refuse; the kit's builder sorts them.
  expectAccepted({ type: "timeline", ...at, id: 1, steps: [{ tick: 30, ops: [show] }, step] });
  expectAccepted({ type: "timeline_stop", connections: "all", page: "150", id: 1 });
});

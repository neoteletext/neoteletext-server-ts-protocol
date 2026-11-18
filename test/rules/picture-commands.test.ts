// A rule table's group commands of a sub-page's picture (renderer parity
// PAR-20; page-rules.md RULE-35, RULE-119): regis_links, regis_cursor,
// naplps_links and naplps_cursor, each the message without connections,
// page and sub, taken by the schema of the server's 9059c09 and written
// unchanged; their links held as the messages' links are and refused as a
// group's command (invalid_group), at the paths the server's
// a_groups_picture_links_are_refused_as_the_message_refuses_them names.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProgram } from "../../src/index.ts";
import type { RuleCommand, RuleTable } from "../../src/protocol.ts";
import { SERVER_LIMITS } from "../../src/testing/index.ts";
import { INDEX, SUB, calling, written } from "./serving.ts";

/** The four picture commands as the server's own test holds them, a group of them accepted. */
const PICTURE_COMMANDS: readonly RuleCommand[] = [
  {
    type: "regis_links",
    links: [
      { drawing: 3, target: "300" },
      { drawing: 4, target: "web:https://example.com/" },
    ],
  },
  { type: "regis_cursor", drawing: 3 },
  { type: "naplps_links", links: [{ object: 7, target: "200" }] },
  { type: "naplps_cursor", object: 7 },
];

/** A table of one rule whose `do` is `commands`: the server's one_rule. */
function oneRule(commands: readonly unknown[]): unknown {
  return { rules: [{ name: "r", on: { event: "key", keys: "any" }, do: commands }] };
}

/** The `rules` message of `table` for the index page. */
function rulesMessage(table: unknown): unknown {
  return { type: "rules", connections: "all", page: "100", sub: "0001", table };
}

/** The path and rule of the first fault the kit finds in a table, or null. */
function faultOf(table: unknown): readonly [string, string] | null {
  const fault = checkProgram(rulesMessage(table), SERVER_LIMITS);
  return fault === null ? null : [fault.path, fault.rule];
}

test("PAR-20, RULE-119: a group may hold a picture's links and cursor, written as given, in a named group and in a rule's do", () => {
  const table: RuleTable = {
    groups: [{ name: "show", commands: PICTURE_COMMANDS }],
    rules: [{ name: "r", on: { event: "key", keys: "any" }, do: PICTURE_COMMANDS }],
  };
  assert.equal(checkProgram(rulesMessage(table), SERVER_LIMITS), null);
  const harness = calling((context) => {
    context.rules({ connection: 7 }, INDEX, SUB, table);
  });
  assert.deepEqual(harness.errors, []);
  assert.deepEqual(
    written(harness, "rules").map((line) => JSON.stringify(line["table"])),
    [JSON.stringify(table)],
    "the same text, every field in its order",
  );
});

test("PAR-20, RULE-35: a group's picture links are refused as the server refuses them: invalid_group at the link", () => {
  assert.deepEqual(
    faultOf(
      oneRule([
        {
          type: "regis_links",
          links: [
            { drawing: 2, target: "200" },
            { drawing: 2, target: "201" },
          ],
        },
      ]),
    ),
    ["table.rules[0].do[0].links[1].drawing", "invalid_group"],
  );
  assert.deepEqual(faultOf(oneRule([{ type: "naplps_links", links: [{ object: 1, target: "not a target" }] }])), [
    "table.rules[0].do[0].links[0].target",
    "invalid_group",
  ]);
  const twice = {
    groups: [
      { name: "a", commands: [{ type: "naplps_cursor", object: 1 }] },
      {
        name: "b",
        commands: [
          { type: "report" },
          {
            type: "naplps_links",
            links: [
              { object: 5, target: "200" },
              { object: 5, target: "200" },
            ],
          },
        ],
      },
    ],
    rules: [{ name: "r", on: { event: "open" }, run: "a" }],
  };
  assert.deepEqual(faultOf(twice), ["table.groups[1].commands[1].links[1].object", "invalid_group"]);
  // The same object in two commands is two sendings, each whole: no fault.
  assert.equal(faultOf(oneRule([PICTURE_COMMANDS[2], PICTURE_COMMANDS[2]])), null);
});

test("PAR-20: what the schema states of a group's picture commands is the schema's, at the server's path", () => {
  // The server refuses a zero object as invalid_group; the schema states the number's least as 1, and its fault is the kit's, at the same path, as the message's zero is.
  assert.deepEqual(faultOf(oneRule([{ type: "naplps_links", links: [{ object: 0, target: "200" }] }])), [
    "table.rules[0].do[0].links[0].object",
    "out_of_range",
  ]);
  assert.equal(faultOf(oneRule([{ type: "naplps_cursor", object: 0 }])), null, "a cursor of 0 is none");
  assert.deepEqual(faultOf(oneRule([{ type: "regis_cursor", drawing: 65_536 }])), ["table.rules[0].do[0].drawing", "out_of_range"]);
  const many = Array.from({ length: 65 }, (_unused, index) => ({ object: index + 1, target: "200" }));
  assert.equal(faultOf(oneRule([{ type: "naplps_links", links: many }]))?.[0], "table.rules[0].do[0].links");
  // A picture's bytes are no command a group holds (RULE-119).
  assert.equal(faultOf(oneRule([{ type: "regis", data: "AA==" }]))?.[0].startsWith("table.rules[0].do[0]"), true);
});

test("PAR-20, RULE-119: links a group holds that only the engine's table check measures are the server's to refuse", () => {
  // Twenty long targets pass every rule of the links themselves; whether their record fits MAX_COMMAND_BYTES is the engine's check, which the server runs.
  const many = Array.from({ length: 20 }, (_unused, index) => ({ object: index + 1, target: "web:https://example.com/a/long/address" }));
  assert.equal(faultOf(oneRule([{ type: "naplps_links", links: many }])), null);
});

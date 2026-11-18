// The rule table's calls and handlers (page-rules.md RULE-55): `rules` sends
// the table as built for a page and sub-code or removes it, `queryState` is
// settled by the server's `page_state` or its refusal, an input names the
// rule and the row that reported it, and a rule's event and a table's fault
// reach the page's application.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type Context, type Input, type PageState, QueryRefusedError } from "../../src/index.ts";
import type { ServerMessageRefused, ServerMessageRuleEvent, ServerMessageRulesFault } from "../../src/protocol.ts";
import { Harness, SERVER_LIMITS } from "../../src/testing/index.ts";
import { INDEX, SUB, calling, serving, written } from "./serving.ts";

const OTHER = 0x200;

test("RULE-35: rules sends the table as built for a page and sub-code, null removes it, and an audience is chunked by start's named_connections", () => {
  const limits = { ...SERVER_LIMITS, budgets: { ...SERVER_LIMITS.budgets, namedConnections: 2 } };
  const table = { rules: [{ name: "typed", on: { event: "text" }, do: [{ type: "report" }] }] } as const;
  const harness = new Harness(
    [
      serving([INDEX], {
        input: (_connection, _page, _input, context): void => {
          context.rules({ connections: [1, 2, 3] }, INDEX, SUB, table);
          context.rules({ connection: 2 }, INDEX, SUB, null);
          context.rules({ connections: [] }, INDEX, SUB, table);
        },
      }),
    ],
    { limits },
  );
  for (const connection of [1, 2, 3]) {
    harness.join(connection, INDEX);
  }
  harness.typeText(1, "x");
  assert.deepEqual(written(harness, "rules"), [
    { type: "rules", connections: [1, 2], page: "100", sub: "0001", table },
    { type: "rules", connections: [3], page: "100", sub: "0001", table },
    { type: "rules", connections: [2], page: "100", sub: "0001", table: null },
  ]);
});

test("RULE-55, DEC-6462: the kit holds a table to the schema and to nothing else, and writes do and echo as they are", () => {
  let thrown: unknown;
  const echoed = { rules: [{ name: "vote", on: { event: "open" }, echo: true, do: [{ type: "timer", op: "start", timer: "t0" }] }] } as const;
  const harness = calling((context) => {
    // The server refuses each of these (RULE-39: invalid_rules, unknown_name); the schema cannot state them, so the kit sends them.
    context.rules({ connection: 7 }, INDEX, SUB, { rules: [{ name: "both", on: { event: "open" }, run: "missing", do: [{ type: "report" }] }] });
    context.rules({ connection: 7 }, INDEX, SUB, { rules: [{ name: "lost", on: { event: "open" }, run: "undeclared" }] });
    // A rule's own `do` and `echo` are the server's to make into groups (RULE-35): the kit writes them unchanged.
    context.rules({ connection: 7 }, INDEX, SUB, echoed);
    try {
      context.rules({ connection: 7 }, INDEX, SUB, { rules: [{ name: "Not A Name", on: { event: "open" }, do: [{ type: "report" }] }] });
    } catch (error) {
      thrown = error;
    }
  });
  assert.equal(written(harness, "rules").length, 3, "what only the server can refuse is written");
  assert.deepEqual(written(harness, "rules")[2]?.["table"], echoed);
  assert.ok(thrown instanceof Error && thrown.name === "ProtocolError", "what the schema refuses is not");
  assert.match(String(thrown), /table\.rules\[0\]\.name/u);
});

/** A channel whose pages query their own state when a connection types, keeping what the query settles with. */
function querying(settled: (PageState | Error)[]): Harness {
  return new Harness([
    serving([INDEX, OTHER], {
      input: (connection, page, _input, context): void => {
        context.queryState(connection, page, SUB).then(
          (state) => settled.push(state),
          (error: unknown) => settled.push(error instanceof Error ? error : new Error(String(error))),
        );
      },
    }),
  ]);
}

test("RULE-38: queryState writes query_state for a page and sub-code with a number of the kit's own, and resolves with the page_state of that number", async () => {
  const settled: (PageState | Error)[] = [];
  const harness = querying(settled);
  harness.join(7, INDEX);
  harness.typeText(7, "x");
  harness.typeText(7, "x");
  const queries = written(harness, "query_state");
  assert.deepEqual(queries, [
    { type: "query_state", connection: 7, page: "100", sub: "0001", request: 1 },
    { type: "query_state", connection: 7, page: "100", sub: "0001", request: 2 },
  ]);
  const [first, second] = queries;
  assert.ok(first !== undefined && second !== undefined);
  // Answered out of order: each answer settles the query of its number.
  const variables = [4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
  harness.answerState(second, { table: true, variables, sequences: { pulse: { running: true, waiting: false, passes: 3, position: 12 } } });
  harness.answerState(first);
  await Promise.resolve();
  assert.deepEqual(
    settled.map((state) => (state instanceof Error ? state.message : [state.request, state.sub, state.table, state.variables, state.sequences])),
    [
      [2, "0001", true, variables, { pulse: { running: true, waiting: false, passes: 3, position: 12 } }],
      [1, "0001", false, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {}],
    ],
  );
  assert.deepEqual(harness.errors, []);
});

test("RULE-38, RULE-39: a refusal naming a state query rejects it with the refusal, and reaches no refused handler", async () => {
  const settled: (PageState | Error)[] = [];
  const heard: ServerMessageRefused[] = [];
  const harness = new Harness([
    serving([INDEX], {
      input: (connection, page, _input, context): void => {
        context.queryState(connection, page, SUB).catch((error: unknown) => settled.push(error instanceof Error ? error : new Error(String(error))));
      },
      refused: (refusal): void => {
        heard.push(refusal);
      },
    }),
  ]);
  harness.join(7, INDEX);
  harness.typeText(7, "x");
  const refusal: ServerMessageRefused = {
    type: "refused",
    message: "query_state",
    request: 1,
    path: "",
    rule: "not_answered",
    detail: "no answer in 10 seconds",
  };
  harness.channel.refused(refusal);
  await Promise.resolve();
  const [error] = settled;
  assert.ok(error instanceof QueryRefusedError);
  assert.deepEqual(error.refusal, refusal);
  assert.deepEqual(heard, []);
  // A refusal of another message, or of a query nothing waits for, is an application's to hear.
  harness.channel.refused({ ...refusal, message: "rules", request: null, rule: "invalid_rules" });
  harness.channel.refused(refusal);
  assert.deepEqual(
    heard.map(({ message, rule }) => [message, rule]),
    [
      ["rules", "invalid_rules"],
      ["query_state", "not_answered"],
    ],
  );
});

test("RULE-38: a page_state nothing waits for is reported, and a restart rejects the queries not yet answered", async () => {
  const settled: (PageState | Error)[] = [];
  const harness = querying(settled);
  harness.join(7, INDEX);
  harness.typeText(7, "x");
  const [query] = written(harness, "query_state");
  assert.ok(query !== undefined);
  harness.restart();
  await Promise.resolve();
  assert.match(settled[0] instanceof Error ? settled[0].message : "", /started again/u);
  harness.answerState(query);
  assert.match(harness.errors.at(-1) ?? "", /state query 1, which nothing waits for/u);
});

test("RULE-37: an input names the rule that reported it, the row that fired, its tick and its target", () => {
  const inputs: Input[] = [];
  const harness = new Harness([
    serving([INDEX], {
      input: (_connection, _page, input): void => {
        inputs.push(input);
      },
    }),
  ]);
  harness.join(7, INDEX);
  harness.fire(7, "vote", { kind: "mouse", action: "release", button: 0, buttons: null, mods: 0, column: 3, row: 4 }, 412, { control: 3 });
  harness.fire(7, "keys", { kind: "key", action: "press", key: "a", base: null, mods: 0, text: "a" }, 413);
  harness.fire(7, "down", { kind: "key", action: "press", key: "s", base: null, mods: 0, text: "s" }, 414, undefined, 2);
  assert.deepEqual(inputs, [
    { kind: "mouse", action: "release", button: 0, column: 3, row: 4, rule: "vote", ruleRow: null, tick: 412, target: { control: 3 } },
    { kind: "key", action: "press", key: "a", text: "a", rule: "keys", ruleRow: null, tick: 413, target: null },
    { kind: "key", action: "press", key: "s", text: "s", rule: "down", ruleRow: 2, tick: 414, target: null },
  ]);
});

test("RULE-37, RULE-48: a rule's event and a table's fault reach the application of their page, unchanged, as calls from the connection", () => {
  const heard: unknown[] = [];
  const hearing = (name: string): Partial<Application> => ({
    ruleEvent: (event: ServerMessageRuleEvent, context: Context): void => {
      heard.push([name, event, context.connection()]);
    },
    rulesFault: (fault: ServerMessageRulesFault, context: Context): void => {
      heard.push([name, fault, context.connection()]);
    },
  });
  const harness = new Harness([serving([INDEX], hearing("index")), serving([OTHER], hearing("other"))]);
  harness.join(7, OTHER);
  harness.fire(7, "hot", undefined, 9031);
  const reading = { kind: "value", read: { of: "variable", variable: "v0" }, value: 5 } as const;
  // A report of a run no rule made, a command the server sent, names no rule (RULE-37).
  harness.fire(7, null, reading, 9031);
  harness.fire(7, "meter_on", undefined, 9032, undefined, 3);
  const fault: ServerMessageRulesFault = { type: "rules_fault", connection: 7, page: "200", sub: "0000", generation: 3, fault: "queue_full", count: 12 };
  harness.channel.rulesFault(fault);
  assert.deepEqual(heard, [
    ["other", { type: "rule_event", connection: 7, page: "200", sub: "0000", rule: "hot", row: null, tick: 9031, event: { kind: "fired" } }, 7],
    ["other", { type: "rule_event", connection: 7, page: "200", sub: "0000", rule: null, row: null, tick: 9031, event: reading }, 7],
    ["other", { type: "rule_event", connection: 7, page: "200", sub: "0000", rule: "meter_on", row: 3, tick: 9032, event: { kind: "fired" } }, 7],
    ["other", fault, 7],
  ]);
});

test("RULE-37: an input fired names its rule: a null rule is a rule_event's alone", () => {
  const harness = new Harness([serving([INDEX], {})]);
  harness.join(7, INDEX);
  assert.throws(() => {
    harness.fire(7, null, { kind: "key", action: "press", key: "a", base: null, mods: 0, text: "a" });
  }, /names the rule/u);
});

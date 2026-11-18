// The rule table's calls and handlers (page-rules.md RULE-55): `rules` sends
// the table as built or removes it, `queryState` is settled by the server's
// `page_state` or its refusal, an input names the rule that sent it, and a
// rule's event and a table's fault reach the page's application.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type Context, type Input, type PageEntry, type PageState, QueryRefusedError, Screen } from "../../src/index.ts";
import type { ServerMessageRefused, ServerMessageRuleEvent, ServerMessageRulesFault } from "../../src/protocol.ts";
import { Harness, SERVER_LIMITS } from "../../src/testing/index.ts";

const INDEX = 0x100;
const OTHER = 0x200;

/** An application of `pages` that publishes each blank, with `handlers`. */
function serving(pages: readonly number[], handlers: Partial<Application>): Application {
  return {
    pages: (): PageEntry[] => pages.map((page) => ({ page, title: "Page" })),
    start: (context): void => {
      for (const page of pages) {
        context.publish("channel", page, new Screen());
      }
    },
    ...handlers,
  };
}

/** The lines of one type the channel wrote. */
function written(harness: Harness, type: string): Readonly<Record<string, unknown>>[] {
  return harness.sent.filter((line) => line["type"] === type);
}

test("RULE-35: rules sends the table as built, null removes it, and an audience is chunked by start's named_connections", () => {
  const limits = { ...SERVER_LIMITS, budgets: { ...SERVER_LIMITS.budgets, namedConnections: 2 } };
  const table = { rules: [{ name: "typed", on: { event: "text" }, do: [{ action: "send" }] }] } as const;
  const harness = new Harness(
    [
      serving([INDEX], {
        input: (_connection, _page, _input, context): void => {
          context.rules({ connections: [1, 2, 3] }, INDEX, table);
          context.rules({ connection: 2 }, INDEX, null);
          context.rules({ connections: [] }, INDEX, table);
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
    { type: "rules", connections: [1, 2], page: "100", table },
    { type: "rules", connections: [3], page: "100", table },
    { type: "rules", connections: [2], page: "100", table: null },
  ]);
});

test("RULE-55, DEC-6462: the kit holds a table to the schema and to nothing else", () => {
  let thrown: unknown;
  const harness = new Harness([
    serving([INDEX], {
      input: (_connection, _page, _input, context): void => {
        // The server refuses each of these (RULE-39: invalid_rules, unknown_name); the schema cannot state them, so the kit sends them.
        context.rules({ connection: 1 }, INDEX, { rules: [{ name: "silent", on: { event: "open" }, do: [] }] });
        context.rules({ connection: 1 }, INDEX, { rules: [{ name: "lost", on: { event: "open" }, do: [{ action: "start_timer", timer: "undeclared" }] }] });
        try {
          context.rules({ connection: 1 }, INDEX, { rules: [{ name: "Not A Name", on: { event: "open" }, do: [{ action: "send" }] }] });
        } catch (error) {
          thrown = error;
        }
      },
    }),
  ]);
  harness.join(1, INDEX);
  harness.typeText(1, "x");
  assert.equal(written(harness, "rules").length, 2, "what only the server can refuse is written");
  assert.ok(thrown instanceof Error && thrown.name === "ProtocolError", "what the schema refuses is not");
  assert.match(String(thrown), /table\.rules\[0\]\.name/u);
});

/** A channel whose index page queries its own state when a connection types, keeping what the query settles with. */
function querying(settled: (PageState | Error)[]): Harness {
  return new Harness([
    serving([INDEX, OTHER], {
      input: (connection, page, _input, context): void => {
        context.queryState(connection, page).then(
          (state) => settled.push(state),
          (error: unknown) => settled.push(error instanceof Error ? error : new Error(String(error))),
        );
      },
    }),
  ]);
}

test("RULE-38: queryState writes query_state with a number of the kit's own, and resolves with the page_state of that number", async () => {
  const settled: (PageState | Error)[] = [];
  const harness = querying(settled);
  harness.join(7, INDEX);
  harness.typeText(7, "x");
  harness.typeText(7, "x");
  const queries = written(harness, "query_state");
  assert.deepEqual(queries, [
    { type: "query_state", connection: 7, page: "100", request: 1 },
    { type: "query_state", connection: 7, page: "100", request: 2 },
  ]);
  const [first, second] = queries;
  assert.ok(first !== undefined && second !== undefined);
  // Answered out of order: each answer settles the query of its number.
  harness.answerState(second, { table: true, variables: { octave: 5 }, enabled: ["c_down"] });
  harness.answerState(first);
  await Promise.resolve();
  assert.deepEqual(
    settled.map((state) => (state instanceof Error ? state.message : [state.request, state.table, state.variables])),
    [
      [2, true, { octave: 5 }],
      [1, false, {}],
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
        context.queryState(connection, page).catch((error: unknown) => settled.push(error instanceof Error ? error : new Error(String(error))));
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

test("RULE-37: an input names the rule that sent it, its tick and its target", () => {
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
  assert.deepEqual(inputs, [
    { kind: "mouse", action: "release", button: 0, column: 3, row: 4, rule: "vote", tick: 412, target: { control: 3 } },
    { kind: "key", action: "press", key: "a", text: "a", rule: "keys", tick: 413, target: null },
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
  const reading = { kind: "value", read: { of: "variable", name: "octave" }, value: 5 } as const;
  harness.fire(7, "report", reading, 9031);
  const fault: ServerMessageRulesFault = { type: "rules_fault", connection: 7, page: "200", generation: 3, fault: "tick_overrun", count: 12 };
  harness.channel.rulesFault(fault);
  assert.deepEqual(heard, [
    ["other", { type: "rule_event", connection: 7, page: "200", sub: "0000", rule: "hot", tick: 9031, event: { kind: "fired" } }, 7],
    ["other", { type: "rule_event", connection: 7, page: "200", sub: "0000", rule: "report", tick: 9031, event: reading }, 7],
    ["other", fault, 7],
  ]);
});

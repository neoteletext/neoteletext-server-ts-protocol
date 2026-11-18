// The kit's public calls, handlers, audiences and harness calls are the
// Python kit's, held to neoteletext-common's kit-calls.tsv, of which
// kit-calls.tsv here is a copy the commit gate checks (typescript.md TS-2;
// python.md PY-19), the calls of the page rule table and of animation and
// the timeline builder among them (page-rules.md RULE-55; animation.md
// ANIM-19), and the builders of a rule table's pieces and the mode set's
// methods (RULE-55, RULE-110).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { Application } from "../src/channel/application.ts";
import { HANDLER_ARGUMENTS, type OptionalHandler } from "../src/channel/handlers.ts";
import * as packageExports from "../src/index.ts";
import { Context, Modes, Naplps, Regis, Timeline } from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";

/** One row of the file. */
interface Row {
  readonly what: string;
  readonly typescript: string;
  readonly message: string;
  readonly arguments: readonly string[];
}

function rows(): Row[] {
  const text = readFileSync(join(import.meta.dirname, "..", "kit-calls.tsv"), "utf8");
  const [header, ...lines] = text.split("\n").filter((line) => line !== "" && !line.startsWith("#"));
  assert.equal(header, "what\ttypescript\tpython\tmessage\targuments");
  return lines.map((line) => {
    const fields = line.split("\t");
    assert.equal(fields.length, 5, line);
    const [what = "", typescript = "", , message = "", listed = ""] = fields;
    return { what, typescript, message, arguments: listed === "-" ? [] : listed.split(", ") };
  });
}

/** The parameters of a method as its source names them, at the top level of its list. */
function parameterCount(method: unknown): number {
  assert.equal(typeof method, "function");
  const source = String(method);
  const open = source.indexOf("(");
  let depth = 0;
  let count = 0;
  let any = false;
  for (const character of source.slice(open + 1)) {
    if (character === "(" || character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]" || (character === ")" && depth > 0)) {
      depth -= 1;
    } else if (character === ")") {
      break;
    } else if (character === "," && depth === 0) {
      count += 1;
    } else if (character.trim() !== "") {
      any = true;
    }
  }
  return any ? count + 1 : 0;
}

/** The prototype `at` inherits from, if it is an object's. */
function parentOf(at: object): object | null {
  const parent: unknown = Object.getPrototypeOf(at);
  return typeof parent === "object" ? parent : null;
}

/** The methods of a class, by its prototype and its parents', but the constructor. */
function methodsOf(prototype: object): Map<string, unknown> {
  const methods = new Map<string, unknown>();
  for (let at: object | null = prototype; at !== null && at !== Object.prototype; at = parentOf(at)) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(at))) {
      if (name !== "constructor" && typeof descriptor.value === "function" && !methods.has(name)) {
        methods.set(name, descriptor.value);
      }
    }
  }
  return methods;
}

/** Holds the kit's names of one kind to the file's: the same set, each with the file's count of arguments. */
function holds(what: string, kit: ReadonlyMap<string, number>): void {
  const listed = new Map(
    rows()
      .filter((row) => row.what === what)
      .map((row) => [row.typescript, row.arguments.length]),
  );
  assert.deepEqual(
    [...kit.keys()].filter((name) => !listed.has(name)),
    [],
    `${what}s of the kit that kit-calls.tsv lacks`,
  );
  assert.deepEqual(
    [...listed.keys()].filter((name) => !kit.has(name)),
    [],
    `${what}s of kit-calls.tsv that the kit lacks`,
  );
  for (const [name, count] of listed) {
    assert.equal(kit.get(name), count, `${what} ${name}'s arguments`);
  }
}

test("TS-2: Context's methods are kit-calls.tsv's calls, each with its arguments", () => {
  holds("call", new Map([...methodsOf(Context.prototype)].map(([name, method]) => [name, parameterCount(method)])));
});

test("TS-2: the harness's methods are kit-calls.tsv's harness calls, each with its arguments", () => {
  holds("harness", new Map([...methodsOf(Harness.prototype)].map(([name, method]) => [name, parameterCount(method)])));
});

test("TS-2: Application's handlers are kit-calls.tsv's, each with its arguments", () => {
  const handlers = new Map<string, number>(Object.entries(HANDLER_ARGUMENTS).map(([name, listed]) => [name, listed.length]));
  // pages and start are Application's own, which every application has: the file lists them as handlers too.
  handlers.set("pages", 1).set("start", 0);
  holds("handler", handlers);
});

test("TS-2: the audiences are kit-calls.tsv's", () => {
  assert.deepEqual(
    rows()
      .filter((row) => row.what === "audience")
      .map((row) => row.typescript),
    ["{ connection }", "{ page }", "{ connections: [...] }", '{ connections: "all" }', "{ kept: true }"],
  );
});

test("ANIM-19: the timeline builder's members are kit-calls.tsv's, each with its arguments", () => {
  // Its constructor, written by the class's name, takes its one option; `steps` is read, not called.
  const members = new Map([...methodsOf(Timeline.prototype)].map(([name, method]) => [name, parameterCount(method)]));
  const steps = Object.getOwnPropertyDescriptor(Timeline.prototype, "steps");
  assert.equal(typeof steps?.get, "function");
  members.set("steps", 0).set("Timeline", Timeline.length + 1);
  assert.equal(new Timeline({ loopTicks: 2 }).loopTicks, 2, "the one option");
  holds("timeline", members);
});

test("ANIM-19: a step's calls are kit-calls.tsv's, each with its arguments", () => {
  const step: object = new Timeline().at(0);
  holds("step", new Map([...methodsOf(parentOf(step) ?? {})].map(([name, method]) => [name, parameterCount(method)])));
});

/** What a handler's parameters count when they are its arguments and its context, but `describe`'s, which has none. */
type Expected<Name extends OptionalHandler> = Name extends "describe"
  ? (typeof HANDLER_ARGUMENTS)[Name]["length"]
  : [...(typeof HANDLER_ARGUMENTS)[Name], "context"]["length"];
/** The handlers whose parameters do not count as listed: none. */
type Miscounted = { [Name in OptionalHandler]: Parameters<NonNullable<Application[Name]>>["length"] extends Expected<Name> ? never : Name }[OptionalHandler];

test("TS-2: each handler's parameters are its listed arguments and its context, by the type check", () => {
  const counted: [Miscounted] extends [never] ? true : Miscounted = true;
  assert.equal(counted, true);
});

test("RULE-55: the builders are kit-calls.tsv's, each a function of the package with its arguments", () => {
  const listed = rows().filter((row) => row.what === "builder");
  const exported: Readonly<Record<string, unknown>> = packageExports;
  holds("builder", new Map(listed.map((row) => [row.typescript, parameterCount(exported[row.typescript])])));
});

test("PAR-39, PAR-40: the picture builders' methods are kit-calls.tsv's regis and naplps rows, each with its arguments, and their constructors take nothing", () => {
  for (const [what, builder] of [
    ["regis", Regis],
    ["naplps", Naplps],
  ] as const) {
    holds(
      what,
      new Map([...[...methodsOf(builder.prototype)].map(([name, method]) => [name, parameterCount(method)] as const), [builder.name, builder.length] as const]),
    );
  }
});

test("RULE-110: the mode set's methods are kit-calls.tsv's modes, each with its arguments", () => {
  holds("modes", new Map([...methodsOf(Modes.prototype)].map(([name, method]) => [name, parameterCount(method)])));
});

test("RULE-55, RULE-110: each builder answers the JSON kit-calls.tsv states", () => {
  const set = packageExports.modes("v1", ["play", "arpeggio"]);
  const playing = { read: { of: "variable", variable: "v1" }, op: "==", value: 0 } as const;
  const answered = [
    [packageExports.physicalKey("a"), { physical: "a" }],
    [packageExports.characterKey(" "), { char: " " }],
    [packageExports.namedKey("Enter"), { name: "Enter" }],
    [packageExports.level(0), { of: "sound", channel: 0, property: "level" }],
    [packageExports.variable("v0"), { of: "variable", variable: "v0" }],
    [packageExports.plus(12, "v0"), { plus: 12, variable: "v0" }],
    [packageExports.row(), { plus: 0, row: "p" }],
    [packageExports.row(41), { plus: 41, row: "p" }],
    [packageExports.fired("p"), { plus: 0, fired: "p" }],
    [packageExports.fired("row", 301), { plus: 301, fired: "row" }],
    [packageExports.phase("t0", 30), { of: "timer", timer: "t0", property: "phase", period: 30 }],
    [packageExports.noteOn(0, 1, 60, 100), { type: "local_midi", channel: 0, message: { event: "note_on", channel: 1, key: 60, velocity: 100 } }],
    [packageExports.noteOff(0, 1, 60, 64), { type: "local_midi", channel: 0, message: { event: "note_off", channel: 1, key: 60, velocity: 64 } }],
    [set.in("play"), playing],
    [set.in("arpeggio", playing), { and: [{ ...playing, value: 1 }, playing] }],
    [set.enter("arpeggio"), { type: "variable", op: "set", variable: "v1", value: 1 }],
  ] as const;
  for (const [built, expected] of answered) {
    assert.equal(JSON.stringify(built), JSON.stringify(expected), "the same text, every field in its order");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a name outside the set, as JavaScript could give one
  assert.throws(() => set.enter("menu" as "play"), RangeError);
});

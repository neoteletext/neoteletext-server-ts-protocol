// The kit's public calls, handlers, audiences and harness calls are the
// Python kit's, held to neoteletext-common's kit-calls.tsv, of which
// kit-calls.tsv here is a copy the commit gate checks (typescript.md TS-2;
// python.md PY-19).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { Application } from "../src/channel/application.ts";
import { HANDLER_ARGUMENTS, type OptionalHandler } from "../src/channel/handlers.ts";
import { Context } from "../src/index.ts";
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
    ["{ connection }", "{ page }", "{ connections: [...] }", '{ connections: "all" }'],
  );
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

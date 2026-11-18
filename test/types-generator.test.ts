// The kit's generator of the protocol's types (typescript.md TS-9, TS-10,
// TS-13): each keyword of TS-9's table as it writes it, the names of TS-10,
// and a schema it does not understand refused, naming what and where.

import assert from "node:assert/strict";
import { test } from "node:test";

import { GenerationError, generate } from "../scripts/types.ts";

/** The types written for a schema of `definitions`. */
function typesOf(definitions: Readonly<Record<string, unknown>>): string {
  return generate(JSON.stringify({ $defs: definitions }), "a test's schema").types;
}

/** The generation of `definitions` fails, saying `said`. */
function refuses(definitions: Readonly<Record<string, unknown>>, said: RegExp): void {
  assert.throws(
    () => typesOf(definitions),
    (error: unknown) => error instanceof GenerationError && said.test(error.message),
  );
}

const CLOSED = { type: "object", additionalProperties: false } as const;

test("TS-9, TS-13: an object is an interface of readonly properties, required plain and others optional, each with its words and bounds", () => {
  const written = typesOf({
    Thing: {
      ...CLOSED,
      description: "A thing.",
      properties: {
        count: { type: "integer", format: "uint8", minimum: 0, maximum: 255, description: "How many." },
        name: { type: "string", maxLength: 4, default: "x" },
      },
      required: ["count"],
    },
  });
  assert.ok(
    written.includes(`/**
 * A thing.
 */
export interface Thing {
  /**
   * How many.
   * Schema: minimum 0; maximum 255; format uint8.
   */
  readonly count: number;
  /**
   * Schema: maxLength 4; absent: "x".
   */
  readonly name?: string;
}
`),
    written,
  );
});

test("TS-9: strings, numbers, booleans, null, lists, tuples, bytes, enums, consts, unions and intersections are written as the table says", () => {
  const written = typesOf({
    Bytes: { type: "string", contentEncoding: "base64" },
    Maybe: { type: ["integer", "null"] },
    Flag: { type: "boolean" },
    Words: { type: "array", items: { type: "string" }, maxItems: 3 },
    Pair: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    Colour: { type: "string", enum: ["red", "green"] },
    One: { const: 1 },
    Loose: { enum: ["a", 2] },
    Either: { anyOf: [{ $ref: "#/$defs/Flag" }, { $ref: "#/$defs/Words" }] },
    Both: { allOf: [{ $ref: "#/$defs/Flag" }, { $ref: "#/$defs/One" }] },
  });
  for (const line of [
    "export type Bytes = Uint8Array;",
    "export type Maybe = number | null;",
    "export type Flag = boolean;",
    "export type Words = readonly string[];",
    "export type Pair = readonly [number, number];",
    'export type Colour = "red" | "green";',
    "export type One = 1;",
    'export type Loose = "a" | 2;',
    "export type Either =\n  | Flag\n  | Words;",
    "export type Both = Flag & One;",
  ]) {
    assert.ok(written.includes(line), line);
  }
});

test("TS-10: a tagged union's branches are named by the union and the tag, an inline object by its property, and members omit what the kit fills", () => {
  const written = typesOf({
    Event: {
      oneOf: [
        {
          ...CLOSED,
          properties: { event: { type: "string", const: "note_on" }, at: { ...CLOSED, properties: { time_us: { type: "integer" } }, required: ["time_us"] } },
          required: ["event", "at"],
        },
        { ...CLOSED, properties: { event: { type: "string", const: "note_off" } }, required: ["event"] },
      ],
    },
    ProgramMessage: {
      oneOf: [
        {
          type: "object",
          properties: { type: { type: "string", const: "sound" } },
          required: ["type"],
          oneOf: [
            {
              ...CLOSED,
              properties: { type: { type: "string", const: "sound" }, kind: { type: "string", const: "synth7_bank" }, connections: { type: "string" } },
              required: ["type", "kind", "connections"],
            },
          ],
        },
        { ...CLOSED, properties: { type: { type: "string", const: "page" }, connections: { type: "string" } }, required: ["type", "connections"] },
      ],
    },
  });
  for (const line of [
    "export interface EventNoteOn {",
    "readonly at: EventNoteOnAt;",
    "export interface EventNoteOnAt {",
    "export interface EventNoteOff {",
    "export interface SoundSynth7Bank {",
    'export type ProgramMessageSound = { readonly type: "sound" } & Sound;',
    'export type SoundSynth7BankMember = Omit<SoundSynth7Bank, "connections">;',
    'export type ProgramMessagePageMember = Omit<ProgramMessagePage, "type" | "connections">;',
    "export type SoundMember =\n  | SoundSynth7BankMember;",
  ]) {
    assert.ok(written.includes(line), line);
  }
});

/** A program's message union whose one message, `sound`, holds the one branch given. */
function soundWith(branch: object): Readonly<Record<string, unknown>> {
  return { ProgramMessage: { oneOf: [{ type: "object", properties: { type: { type: "string", const: "sound" } }, required: ["type"], oneOf: [branch] }] } };
}

test("TS-9: a keyword the table does not list, or an object that does not refuse unknown fields, fails naming it and its path", () => {
  refuses({ Thing: { type: "string", unevaluatedProperties: false } }, /#\/\$defs\/Thing: the keyword unevaluatedProperties/u);
  refuses({ Thing: { type: "object", properties: { a: { type: "string" } } } }, /#\/\$defs\/Thing: an object without additionalProperties: false/u);
  refuses({ Thing: { $ref: "#/$defs/Nothing" } }, /names no definition/u);
  refuses(
    soundWith({
      type: "object",
      properties: { type: { type: "string", const: "sound" }, kind: { type: "string", const: "stop" } },
      required: ["type", "kind"],
    }),
    /#\/\$defs\/ProgramMessage\/oneOf\/0\/oneOf\/0: an object without additionalProperties: false/u,
  );
  refuses(
    soundWith({ ...CLOSED, properties: { kind: { type: "string", const: "stop" } }, required: ["kind"] }),
    /oneOf\/0\/oneOf\/0: a branch that does not restate its message's type/u,
  );
});

test("RULE-35, PY-75: action and of tag a union, and an untagged branch of several properties is named by the first it requires that no other branch has", () => {
  const written = typesOf({
    Action: {
      oneOf: [
        { ...CLOSED, properties: { action: { const: "start_timer", type: "string" }, timer: { type: "string" } }, required: ["action", "timer"] },
        { ...CLOSED, properties: { action: { const: "send", type: "string" } }, required: ["action"] },
      ],
    },
    Value: { oneOf: [{ ...CLOSED, properties: { of: { const: "keys_down", type: "string" } }, required: ["of"] }] },
    Condition: {
      anyOf: [
        { ...CLOSED, properties: { not: { $ref: "#/$defs/Condition" } }, required: ["not"] },
        { ...CLOSED, properties: { read: { $ref: "#/$defs/Value" }, op: { type: "string" }, value: { type: "integer" } }, required: ["read", "op", "value"] },
        { ...CLOSED, properties: { read: { $ref: "#/$defs/Value" }, in_range: { type: "array", items: { type: "integer" } } }, required: ["read", "in_range"] },
      ],
    },
  });
  assert.ok(written.includes("export type Action =\n  | ActionStartTimer\n  | ActionSend;"), written);
  assert.ok(written.includes("export type Value =\n  | ValueKeysDown;"), written);
  assert.ok(written.includes("export type Condition =\n  | ConditionNot\n  | ConditionOp\n  | ConditionInRange;"), written);
  assert.ok(written.includes("export interface ConditionOp {\n  readonly read: Value;\n  readonly op: string;\n  readonly value: number;\n}"), written);
  const same = { ...CLOSED, properties: { read: { type: "string" } }, required: ["read"] };
  refuses(
    { Condition: { anyOf: [same, same] } },
    /#\/\$defs\/Condition\/anyOf\/0: an object branch of an untagged union with no required property of its own/u,
  );
});

test("RULE-38, PY-74: a map of names that match one pattern is a record of its values, and any other patternProperties fails", () => {
  const map = { type: "object", additionalProperties: false, patternProperties: { "^[a-z]+$": { type: "integer" } } };
  const written = typesOf({ State: { ...CLOSED, properties: { variables: map }, required: ["variables"] } });
  assert.ok(written.includes("  readonly variables: Readonly<Record<string, number>>;"), written);
  refuses(
    { State: { ...CLOSED, properties: { variables: { ...map, properties: { a: { type: "string" } } } } } },
    /properties\/variables\/patternProperties: not one pattern, alone and with additionalProperties: false/u,
  );
  refuses({ State: { ...CLOSED, properties: { variables: { ...map, additionalProperties: true } } } }, /patternProperties: not one pattern/u);
  refuses(
    { State: { ...CLOSED, properties: { variables: { ...map, patternProperties: { "^a$": { type: "integer" }, "^b$": { type: "integer" } } } } } },
    /patternProperties: not one pattern/u,
  );
});

test("TS-10 rule 5: two types of one name, or a reserved word, fail rather than being renamed", () => {
  refuses({ A: { oneOf: [{ ...CLOSED, properties: { kind: { const: "b", type: "string" } } }] }, AB: { type: "string" } }, /would both be named AB/u);
  refuses({ None: { type: "string" } }, /reserved word/u);
});

test("TS-12: one schema gives one text", () => {
  const schema = JSON.stringify({ $defs: { Thing: { ...CLOSED, properties: { a: { type: "string" } } } } });
  assert.equal(generate(schema, "s").types, generate(schema, "s").types);
});

test("RULE-106, PY-10: an amount is one type by its properties wherever it is written, nested unions join, and an unknown shape fails", () => {
  const amount = (bound: number, sources: readonly string[]): object => ({
    ...CLOSED,
    properties: Object.fromEntries<object>([
      ["plus", { type: "integer", maximum: bound }],
      ...sources.map((source): [string, object] => [source, { const: "p" }]),
    ]),
    oneOf: sources.map((source) => ({ required: [source] })),
  });
  const written = typesOf({
    Move: { ...CLOSED, properties: { x: { anyOf: [{ type: "integer" }, amount(32_767, ["variable", "row", "fired"])] } }, required: ["x"] },
    Operand: {
      anyOf: [
        { anyOf: [{ type: "integer" }, amount(1, ["variable", "row", "fired"])] },
        { ...CLOSED, properties: { read: { type: "string" } }, required: ["read"] },
      ],
    },
    Target: { ...CLOSED, properties: { object: { anyOf: [{ type: "integer" }, amount(7, ["row", "fired"])] } }, required: ["object"] },
  });
  assert.equal(written.match(/^export type Amount = /gmu)?.length, 1, written);
  assert.equal(written.match(/^export type TargetAmount = /gmu)?.length, 1, written);
  assert.ok(written.includes("export type Operand =\n  | number\n  | Amount\n  | OperandRead;"), written);
  assert.ok(written.includes('  | { readonly row: "p" }'), written);
  assert.ok(!written.includes("maximum 32767"), "a shape's bounds are its fields', not the type's");
  refuses({ Odd: { ...CLOSED, properties: { a: { anyOf: [{ type: "integer" }, amount(1, ["key"])] } } } }, /name no amount the generator knows/u);
});

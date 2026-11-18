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
              type: "object",
              properties: { kind: { type: "string", const: "synth7_bank" }, connections: { type: "string" } },
              required: ["kind", "connections"],
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

test("TS-9: a keyword the table does not list, or an object that does not refuse unknown fields, fails naming it and its path", () => {
  refuses({ Thing: { type: "string", unevaluatedProperties: false } }, /#\/\$defs\/Thing: the keyword unevaluatedProperties/u);
  refuses({ Thing: { type: "object", properties: { a: { type: "string" } } } }, /#\/\$defs\/Thing: an object without additionalProperties: false/u);
  refuses({ Thing: { $ref: "#/$defs/Nothing" } }, /names no definition/u);
});

test("TS-10 rule 5: two types of one name, or a reserved word, fail rather than being renamed", () => {
  refuses({ A: { oneOf: [{ ...CLOSED, properties: { kind: { const: "b", type: "string" } } }] }, AB: { type: "string" } }, /would both be named AB/u);
  refuses({ None: { type: "string" } }, /reserved word/u);
});

test("TS-12: one schema gives one text", () => {
  const schema = JSON.stringify({ $defs: { Thing: { ...CLOSED, properties: { a: { type: "string" } } } } });
  assert.equal(generate(schema, "s").types, generate(schema, "s").types);
});

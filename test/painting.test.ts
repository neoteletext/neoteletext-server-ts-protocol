// Painting as a show in the kit (neoteletext-common's DEC-7031 item 6;
// REQ-7024, REQ-7025, REQ-7026; TODO-7039 step 1): `regis` and `naplps` write
// `line_speed` and `default_rate` after `restart`, each only when given, and
// refuse what the server's check_paint at e9fa47b refuses, under its rule
// and with its detail, before anything is written. The bounds are read from
// the server's schema here, so that this file holds the calls to the
// server's figures and not to the kit's own constants (which
// painting-bounds.test.ts holds to the schema).

// oxlint-disable max-lines -- one test of each of TODO-7039 step 1's cases, and the helpers they share
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { type Context, type PageEntry, type PictureAudience, ProtocolError, checkProgram, row } from "../src/index.ts";
import type { RuleTable, RuleTriggerPainted } from "../src/protocol.ts";
import { Harness, SERVER_LIMITS } from "../src/testing/index.ts";
import { isFields } from "../src/wire/fields.ts";
import { screen } from "./recorder.ts";

const PAGE = 0x200;
const SUB = 1;
const VIEWER = 1;
/** The snapshot's number, as the server would give it. */
const SNAPSHOT = 17;
/** 3F7F: the page as a whole (EN 300 706 clause 9.6.1). */
const WHOLE = 0x3f7f;
const REGIS_TEXT = "P[0,0]V[10,10]";
const NAPLPS_BYTES = Uint8Array.from([0x0e, 0x20, 0x7f, 0x7f]);
/** A line speed and a default rate well inside their ranges (DEC-7031 item 8's demonstrations use 2,400 and 20). */
const SOME_SPEED = 2400;
const SOME_RATE = 20;

/** The `minimum` and `maximum` of a field of a program message, from the server's schema at e9fa47b. */
function schemaBounds(type: "regis" | "naplps", field: "line_speed" | "default_rate"): { readonly least: number; readonly most: number } {
  const schema: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "..", "schema", "protocol-16.json"), "utf8"));
  assert.ok(isFields(schema) && isFields(schema["$defs"]));
  const program = schema["$defs"]["ProgramMessage"];
  assert.ok(isFields(program) && Array.isArray(program["oneOf"]));
  const branch: unknown = program["oneOf"].find(
    (candidate: unknown) =>
      isFields(candidate) &&
      isFields(candidate["properties"]) &&
      isFields(candidate["properties"]["type"]) &&
      candidate["properties"]["type"]["const"] === type,
  );
  assert.ok(isFields(branch) && isFields(branch["properties"]));
  const property = branch["properties"][field];
  assert.ok(isFields(property), `${type} has ${field}`);
  const { minimum, maximum } = property;
  assert.ok(typeof minimum === "number" && typeof maximum === "number");
  return { least: minimum, most: maximum };
}

const SPEED = schemaBounds("regis", "line_speed");
const RATE = schemaBounds("regis", "default_rate");

/** The server's details (check_paint at e9fa47b), written out here rather than taken from the kit. */
function notBegun(field: "line_speed" | "default_rate"): string {
  return `\`${field}\` is for the stream a message begins: it is given with \`restart: true\``;
}
function speedOutside(speed: number): string {
  return `${speed} bits a second: MIN_LINE_SPEED (${SPEED.least}) to MAX_LINE_SPEED (${SPEED.most})`;
}
function rateOutside(rate: number): string {
  return `${rate}: ${RATE.least} to MAX_DEFAULT_PAINT_RATE (${RATE.most})`;
}

/** A harness of one page whose context the test keeps, with a viewer on the page. */
function started(): { readonly harness: Harness; readonly context: Context } {
  let kept: Context | null = null;
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: PAGE, title: "Painting" }],
      start: (context): void => {
        kept = context;
        context.publish("channel", PAGE, screen("beneath"));
      },
      joined: (_connection, context): void => {
        kept = context;
      },
    },
  ]);
  harness.join(VIEWER, PAGE);
  assert.ok(kept !== null);
  return { harness, context: kept };
}

/** The stream messages written since `before`. */
function streamsSince(harness: Harness, before: number): Record<string, unknown>[] {
  return harness.sent.slice(before).filter((message) => message["type"] === "regis" || message["type"] === "naplps");
}

/** The fault `call` throws, which must be a ProtocolError. */
function thrownFault(call: () => void): unknown {
  try {
    call();
  } catch (error) {
    assert.ok(error instanceof ProtocolError, `a ProtocolError, not ${String(error)}`);
    return error.fault;
  }
  return assert.fail("the call was refused");
}

interface Options {
  readonly restart?: boolean;
  readonly lineSpeed?: number;
  readonly defaultRate?: number;
}

/** Every combination of the options: `restart` left out, false or true; a line speed and a default rate each left out or given. */
function combinations(withRate: boolean): Options[] {
  const all: Options[] = [];
  for (const restart of [undefined, false, true]) {
    for (const lineSpeed of [undefined, SOME_SPEED]) {
      for (const defaultRate of withRate ? [undefined, SOME_RATE] : [undefined]) {
        all.push({
          ...(restart === undefined ? {} : { restart }),
          ...(lineSpeed === undefined ? {} : { lineSpeed }),
          ...(defaultRate === undefined ? {} : { defaultRate }),
        });
      }
    }
  }
  return all;
}

/** Whether the server takes the options: values only with a restart. */
function taken(options: Options): boolean {
  return options.restart === true || (options.lineSpeed === undefined && options.defaultRate === undefined);
}

/** The message's fields after its bytes, in the order the kit must write them. */
function expectedTail(options: Options): Record<string, unknown> {
  return {
    restart: options.restart === true,
    ...(options.lineSpeed === undefined ? {} : { line_speed: options.lineSpeed }),
    ...(options.defaultRate === undefined ? {} : { default_rate: options.defaultRate }),
  };
}

test("DEC-7031 item 6: regis writes restart always, then line_speed, then default_rate, each only when given, for every combination", () => {
  for (const options of combinations(true).filter((combination) => taken(combination))) {
    const { harness, context } = started();
    const before = harness.sent.length;
    context.regis({ connection: VIEWER }, PAGE, SUB, REGIS_TEXT, options);
    const expected = {
      type: "regis",
      connections: [VIEWER],
      page: "200",
      sub: "0001",
      data: Buffer.from(REGIS_TEXT).toString("base64"),
      ...expectedTail(options),
    };
    const written = streamsSince(harness, before);
    assert.equal(JSON.stringify(written), JSON.stringify([expected]), `every field, in order, for ${JSON.stringify(options)}`);
    assert.deepEqual(harness.errors, []);
  }
});

test("DEC-7031 item 6: naplps writes restart always, then line_speed only when given, for every combination", () => {
  for (const options of combinations(false).filter((combination) => taken(combination))) {
    const { harness, context } = started();
    const before = harness.sent.length;
    context.naplps({ connection: VIEWER }, PAGE, SUB, NAPLPS_BYTES, options);
    const expected = {
      type: "naplps",
      connections: [VIEWER],
      page: "200",
      sub: "0001",
      data: Buffer.from(NAPLPS_BYTES).toString("base64"),
      ...expectedTail(options),
    };
    assert.equal(JSON.stringify(streamsSince(harness, before)), JSON.stringify([expected]), `every field, in order, for ${JSON.stringify(options)}`);
  }
});

test("DEC-7031 item 6: with no options at all, regis and naplps write restart false and neither line_speed nor default_rate", () => {
  const { harness, context } = started();
  const before = harness.sent.length;
  context.regis({ connection: VIEWER }, PAGE, SUB, REGIS_TEXT);
  context.naplps({ connection: VIEWER }, PAGE, SUB, NAPLPS_BYTES);
  const written = streamsSince(harness, before);
  assert.deepEqual(
    written.map((message) => Object.keys(message)),
    [
      ["type", "connections", "page", "sub", "data", "restart"],
      ["type", "connections", "page", "sub", "data", "restart"],
    ],
  );
  assert.deepEqual(
    written.map((message) => message["restart"]),
    [false, false],
  );
});

test("DEC-7031 item 6: the fields follow a stream given as parts, and go to the kept audience too", () => {
  const { harness, context } = started();
  const before = harness.sent.length;
  context.regis({ connection: VIEWER }, PAGE, SUB, ["P[0,0]", { text: "Hi" }], { restart: true, lineSpeed: SOME_SPEED, defaultRate: SOME_RATE });
  context.naplps({ kept: true }, PAGE, SUB, NAPLPS_BYTES, { restart: true, lineSpeed: SOME_SPEED });
  const written = streamsSince(harness, before);
  assert.deepEqual(
    written.map((message) => Object.keys(message)),
    [
      ["type", "connections", "page", "sub", "parts", "restart", "line_speed", "default_rate"],
      ["type", "connections", "page", "sub", "data", "restart", "line_speed"],
    ],
  );
  assert.deepEqual(
    written.map((message) => [message["connections"], message["line_speed"], message["default_rate"]]),
    [
      [[VIEWER], SOME_SPEED, SOME_RATE],
      ["kept", SOME_SPEED, undefined],
    ],
  );
});

/** One refusal: the call, the options, and the server's fault. */
interface Refusal {
  readonly name: string;
  readonly type: "regis" | "naplps";
  readonly options: Options;
  readonly path: "line_speed" | "default_rate";
  readonly detail: string;
}

const REFUSALS: readonly Refusal[] = [
  { name: "a line speed with no restart", type: "regis", options: { lineSpeed: SOME_SPEED }, path: "line_speed", detail: notBegun("line_speed") },
  {
    name: "a line speed with restart false",
    type: "naplps",
    options: { restart: false, lineSpeed: SOME_SPEED },
    path: "line_speed",
    detail: notBegun("line_speed"),
  },
  { name: "a default rate with no restart", type: "regis", options: { defaultRate: SOME_RATE }, path: "default_rate", detail: notBegun("default_rate") },
  {
    name: "a default rate with restart false",
    type: "regis",
    options: { restart: false, defaultRate: SOME_RATE },
    path: "default_rate",
    detail: notBegun("default_rate"),
  },
  {
    name: "a line speed below the least",
    type: "regis",
    options: { restart: true, lineSpeed: SPEED.least - 1 },
    path: "line_speed",
    detail: speedOutside(SPEED.least - 1),
  },
  {
    name: "a line speed above the most",
    type: "regis",
    options: { restart: true, lineSpeed: SPEED.most + 1 },
    path: "line_speed",
    detail: speedOutside(SPEED.most + 1),
  },
  {
    name: "a NAPLPS line speed below the least",
    type: "naplps",
    options: { restart: true, lineSpeed: SPEED.least - 1 },
    path: "line_speed",
    detail: speedOutside(SPEED.least - 1),
  },
  {
    name: "a NAPLPS line speed above the most",
    type: "naplps",
    options: { restart: true, lineSpeed: SPEED.most + 1 },
    path: "line_speed",
    detail: speedOutside(SPEED.most + 1),
  },
  {
    name: "a default rate of 0",
    type: "regis",
    options: { restart: true, defaultRate: RATE.least - 1 },
    path: "default_rate",
    detail: rateOutside(RATE.least - 1),
  },
  {
    name: "a default rate above the most",
    type: "regis",
    options: { restart: true, defaultRate: RATE.most + 1 },
    path: "default_rate",
    detail: rateOutside(RATE.most + 1),
  },
  // The order: restart is told before the range, and line_speed before default_rate.
  {
    name: "an out-of-range line speed with no restart: restart first",
    type: "regis",
    options: { lineSpeed: SPEED.least - 1 },
    path: "line_speed",
    detail: notBegun("line_speed"),
  },
  {
    name: "an out-of-range default rate with no restart: restart first",
    type: "regis",
    options: { defaultRate: RATE.most + 1 },
    path: "default_rate",
    detail: notBegun("default_rate"),
  },
  {
    name: "both out of range: line_speed first",
    type: "regis",
    options: { restart: true, lineSpeed: SPEED.most + 1, defaultRate: RATE.least - 1 },
    path: "line_speed",
    detail: speedOutside(SPEED.most + 1),
  },
  {
    name: "both with no restart: line_speed first",
    type: "regis",
    options: { lineSpeed: SOME_SPEED, defaultRate: SOME_RATE },
    path: "line_speed",
    detail: notBegun("line_speed"),
  },
  {
    name: "a good line speed and a bad default rate: default_rate",
    type: "regis",
    options: { restart: true, lineSpeed: SOME_SPEED, defaultRate: RATE.most + 1 },
    path: "default_rate",
    detail: rateOutside(RATE.most + 1),
  },
];

/** The call of a refusal's type, to `to`. */
function callOf(context: Context, refusal: Refusal, to: PictureAudience): () => void {
  return refusal.type === "regis"
    ? (): void => {
        context.regis(to, PAGE, SUB, REGIS_TEXT, refusal.options);
      }
    : (): void => {
        context.naplps(to, PAGE, SUB, NAPLPS_BYTES, refusal.options);
      };
}

/** The message a refusal's call would write, as a program writes it to checkProgram directly. */
function messageOf(refusal: Refusal): Record<string, unknown> {
  const data = Buffer.from(refusal.type === "regis" ? REGIS_TEXT : NAPLPS_BYTES).toString("base64");
  return {
    type: refusal.type,
    connections: [VIEWER],
    page: "200",
    sub: "0001",
    data,
    ...(refusal.options.restart === undefined ? {} : { restart: refusal.options.restart }),
    ...(refusal.options.lineSpeed === undefined ? {} : { line_speed: refusal.options.lineSpeed }),
    ...(refusal.options.defaultRate === undefined ? {} : { default_rate: refusal.options.defaultRate }),
  };
}

for (const refusal of REFUSALS) {
  test(`DEC-7031 item 6: ${refusal.type} refuses ${refusal.name} as invalid_paint at ${refusal.path}, with the server's detail, and writes nothing`, () => {
    const expected = { path: refusal.path, rule: "invalid_paint", detail: refusal.detail };
    const audiences: readonly PictureAudience[] = [{ connection: VIEWER }, { connections: [] }, { connections: "all" }, { page: PAGE }, { kept: true }];
    for (const to of audiences) {
      const { harness, context } = started();
      const before = harness.sent.length;
      assert.deepEqual(thrownFault(callOf(context, refusal, to)), expected, `to ${JSON.stringify(to)}`);
      assert.deepEqual(harness.sent.slice(before), [], `nothing written to ${JSON.stringify(to)}`);
    }
    assert.deepEqual(checkProgram(messageOf(refusal), SERVER_LIMITS), expected, "checkProgram, directly");
  });
}

test("DEC-7031 item 6: the bounds themselves are taken, by the call and by checkProgram", () => {
  const takenOptions: readonly Options[] = [
    { restart: true, lineSpeed: SPEED.least },
    { restart: true, lineSpeed: SPEED.most },
    { restart: true, defaultRate: RATE.least },
    { restart: true, defaultRate: RATE.most },
    { restart: true, lineSpeed: SPEED.least, defaultRate: RATE.most },
  ];
  assert.deepEqual(
    [SPEED, RATE],
    [
      { least: 300, most: 115_200 },
      { least: 1, most: 32_767 },
    ],
    "the schema's bounds are the engine's at 40faa0d8",
  );
  for (const options of takenOptions) {
    const { harness, context } = started();
    const before = harness.sent.length;
    context.regis({ connection: VIEWER }, PAGE, SUB, REGIS_TEXT, options);
    const refusal: Refusal = { name: "", type: "regis", options, path: "line_speed", detail: "" };
    assert.equal(checkProgram(messageOf(refusal), SERVER_LIMITS), null, JSON.stringify(options));
    assert.equal(streamsSince(harness, before).length, 1, JSON.stringify(options));
    if (options.defaultRate === undefined) {
      const naplpsBefore = harness.sent.length;
      context.naplps({ connection: VIEWER }, PAGE, SUB, NAPLPS_BYTES, options);
      assert.equal(streamsSince(harness, naplpsBefore).length, 1, `naplps ${JSON.stringify(options)}`);
      assert.equal(checkProgram(messageOf({ ...refusal, type: "naplps" }), SERVER_LIMITS), null, `naplps ${JSON.stringify(options)}`);
    }
  }
  assert.deepEqual(schemaBounds("naplps", "line_speed"), SPEED, "naplps's line speed has regis's bounds");
});

test("DEC-7031 item 6: a default rate on naplps is refused by the schema as unknown_field, by the call and by checkProgram", () => {
  const { harness, context } = started();
  const before = harness.sent.length;
  const fault = thrownFault(() => {
    // @ts-expect-error -- naplps takes no default rate: NAPLPS has no numbered drawings' T
    context.naplps({ connection: VIEWER }, PAGE, SUB, NAPLPS_BYTES, { restart: true, defaultRate: SOME_RATE });
  });
  assert.ok(isFields(fault));
  assert.deepEqual([fault["path"], fault["rule"]], ["", "unknown_field"]);
  assert.match(String(fault["detail"]), /default_rate/u);
  assert.deepEqual(harness.sent.slice(before), []);
  const direct = checkProgram(
    { ...messageOf({ name: "", type: "naplps", options: { restart: true }, path: "default_rate", detail: "" }), default_rate: SOME_RATE },
    SERVER_LIMITS,
  );
  assert.deepEqual([direct?.path, direct?.rule], ["", "unknown_field"]);
});

/** A harness whose page's `opened` makes `call` for a snapshot's connection and keeps what it throws. */
function snapshotOf(call: (context: Context, connection: number) => void): { readonly lines: Record<string, unknown>[]; readonly thrown: unknown[] } {
  const thrown: unknown[] = [];
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: PAGE, title: "Painting" }],
      start: (context): void => {
        context.publishSubpages("channel", PAGE, [{ screen: screen("first") }, { screen: screen("second") }]);
      },
      opened: (connection, _page, context): void => {
        try {
          call(context, connection);
        } catch (error) {
          thrown.push(error);
        }
      },
    },
  ]);
  const before = harness.sent.length;
  harness.channel.snapshot(SNAPSHOT, { page: PAGE, sub: WHOLE }, "200");
  return { lines: harness.sent.slice(before), thrown };
}

test("DEC-7031 item 6: a snapshot's connection is refused as any other, and nothing is gathered as its picture", () => {
  const refused = snapshotOf((context, connection) => {
    context.regis({ connection }, PAGE, SUB, REGIS_TEXT, { restart: true, lineSpeed: SPEED.most + 1 });
  });
  assert.equal(refused.thrown.length, 1);
  const [error] = refused.thrown;
  assert.ok(error instanceof ProtocolError);
  assert.deepEqual(error.fault, { path: "line_speed", rule: "invalid_paint", detail: speedOutside(SPEED.most + 1) });
  assert.deepEqual(
    refused.lines.map((line) => [line["type"], line["picture"]]),
    [["snapshot_page", undefined]],
    "the page is answered with no picture",
  );

  const naplps = snapshotOf((context, connection) => {
    context.naplps({ connection }, PAGE, SUB, NAPLPS_BYTES, { lineSpeed: SOME_SPEED });
  });
  assert.ok(naplps.thrown[0] instanceof ProtocolError);
  assert.deepEqual(naplps.thrown[0].fault, { path: "line_speed", rule: "invalid_paint", detail: notBegun("line_speed") });
  assert.deepEqual(
    naplps.lines.map((line) => [line["type"], line["picture"]]),
    [["snapshot_page", undefined]],
  );

  const takenSnapshot = snapshotOf((context, connection) => {
    context.regis({ connection }, PAGE, SUB, REGIS_TEXT, { restart: true, lineSpeed: SOME_SPEED, defaultRate: SOME_RATE });
  });
  assert.deepEqual(takenSnapshot.thrown, []);
  assert.deepEqual(
    takenSnapshot.lines.map((line) => [line["type"], line["picture"]]),
    [["snapshot_page", { language: "regis", data: Buffer.from(REGIS_TEXT).toString("base64") }]],
    "values in range are taken, and the picture gathered",
  );
});

test('REQ-7026: the painted trigger takes "page", { object: n } and the row form, and the kit writes each as given', () => {
  const page: RuleTriggerPainted = { event: "painted", target: "page" };
  const drawing: RuleTriggerPainted = { event: "painted", target: { object: 10 } };
  const byRow: RuleTriggerPainted = { event: "painted", target: { object: row(20) } };
  const table: RuleTable = {
    rows: { panels: [1, 2] },
    rules: [
      { name: "whole", on: page, do: [{ type: "report" }] },
      { name: "drawing", on: drawing, do: [{ type: "report" }] },
      { name: "panel", rows: "panels", on: byRow, do: [{ type: "report" }] },
    ],
  };
  const { harness, context } = started();
  const before = harness.sent.length;
  context.rules({ connection: VIEWER }, PAGE, SUB, table);
  const written = harness.sent.slice(before).filter((line) => line["type"] === "rules");
  assert.equal(written.length, 1);
  const writtenTable = written[0]?.["table"];
  assert.ok(isFields(writtenTable) && Array.isArray(writtenTable["rules"]));
  assert.deepEqual(
    writtenTable["rules"].map((rule: unknown) => (isFields(rule) ? rule["on"] : undefined)),
    [
      { event: "painted", target: "page" },
      { event: "painted", target: { object: 10 } },
      { event: "painted", target: { object: { plus: 20, row: "p" } } },
    ],
  );
  assert.deepEqual(harness.errors, []);
});

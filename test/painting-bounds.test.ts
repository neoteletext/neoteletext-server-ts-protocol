// The kit's painting bounds are written by hand from the engine's
// neoteletext-web constants (src/picture/paint.ts), not generated as the
// rule table's limits are. The server writes the schema's `minimum` and
// `maximum` of `line_speed` and `default_rate` from those same constants, so
// holding the kit's to the schema copy, which the commit gate holds to the
// server's file, keeps them from drifting (TODO-7039 step 2; DEC-7031 item 6).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { DEFAULT_PAINT_RATE_MAX, LINE_SPEED_1200, LINE_SPEED_2400, LINE_SPEED_300, LINE_SPEED_9600, LINE_SPEED_MAX, LINE_SPEED_MIN } from "../src/index.ts";
import { DEFAULT_PAINT_RATE_MIN } from "../src/picture/paint.ts";
import { isFields } from "../src/wire/fields.ts";

/** A program message's property in the schema, by the message's `type`. */
function propertyOf(type: string, field: string): unknown {
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
  assert.ok(isFields(branch) && isFields(branch["properties"]), `the schema has ${type}`);
  return branch["properties"][field];
}

/** The `[minimum, maximum]` of a property. */
function rangeOf(type: string, field: string): [unknown, unknown] {
  const property = propertyOf(type, field);
  assert.ok(isFields(property), `${type} has ${field}`);
  return [property["minimum"], property["maximum"]];
}

test("DEC-7031 item 6: LINE_SPEED_MIN and LINE_SPEED_MAX are the schema's bounds of regis's and naplps's line_speed", () => {
  assert.deepEqual(rangeOf("regis", "line_speed"), [LINE_SPEED_MIN, LINE_SPEED_MAX]);
  assert.deepEqual(rangeOf("naplps", "line_speed"), [LINE_SPEED_MIN, LINE_SPEED_MAX]);
});

test("DEC-7031 item 6: DEFAULT_PAINT_RATE_MIN and DEFAULT_PAINT_RATE_MAX are the schema's bounds of regis's default_rate, which naplps has not", () => {
  assert.deepEqual(rangeOf("regis", "default_rate"), [DEFAULT_PAINT_RATE_MIN, DEFAULT_PAINT_RATE_MAX]);
  assert.equal(propertyOf("naplps", "default_rate"), undefined);
});

test("DEC-7031 item 1: the named line speeds are 300, 1,200, 2,400 and 9,600, each within the bounds", () => {
  const named = [LINE_SPEED_300, LINE_SPEED_1200, LINE_SPEED_2400, LINE_SPEED_9600];
  assert.deepEqual(named, [300, 1200, 2400, 9600]);
  assert.ok(named.every((speed) => speed >= LINE_SPEED_MIN && speed <= LINE_SPEED_MAX));
});

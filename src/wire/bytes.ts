// The schema's bytes fields at run time (typescript.md TS-21): every field the
// server's schema marks `contentEncoding: "base64"` is a Uint8Array to a
// program and exact base64 text on the line (RFC 4648 section 4, padded, no
// line breaks). Which fields those are is read from the schema's structure
// (generated/bytes.js, written by scripts/types.ts with the types), never
// guessed from a description or a field's name, so a value elsewhere is left
// as it is, and a Uint8Array given where the schema has no bytes then fails
// the validators.

import { BYTES_SCHEMA } from "./generated/bytes.js";

/** A node of the schema's structure. */
type SchemaNode = Readonly<Record<string, unknown>>;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- scripts/types.ts writes every definition as an object node
const DEFINITIONS = BYTES_SCHEMA.$defs as Readonly<Record<string, SchemaNode>>;
const REFERENCE = "#/$defs/";

function isNode(value: unknown): value is SchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/** The node, its `$ref` followed. */
function resolved(node: SchemaNode): SchemaNode {
  const reference = node["$ref"];
  if (typeof reference !== "string") {
    return node;
  }
  const target = DEFINITIONS[reference.slice(REFERENCE.length)];
  if (target === undefined) {
    throw new Error(`the schema's structure has no ${reference}`);
  }
  return resolved(target);
}

/** A value's JSON type, as the schema's `type` names it; a Uint8Array is the string it is written as. */
function typeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (value instanceof Uint8Array) {
    return "string";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function typeFits(value: unknown, type: unknown): boolean {
  const found = typeOf(value);
  const fitsOne = (one: unknown): boolean => one === found || (one === "number" && found === "integer");
  return Array.isArray(type) ? type.some((one: unknown) => fitsOne(one)) : type === undefined || fitsOne(type);
}

/** Whether `value` can be of `node`, as far as its type, the properties it requires and the consts of its tags say: enough to tell a union's branches apart. */
function fits(value: unknown, given: SchemaNode): boolean {
  const node = resolved(given);
  if (node["const"] !== undefined) {
    return node["const"] === value;
  }
  if (!typeFits(value, node["type"])) {
    return false;
  }
  const required = node["required"];
  if (Array.isArray(required) && isNode(value) && !required.every((name: unknown) => typeof name === "string" && value[name] !== undefined)) {
    return false;
  }
  const properties = node["properties"];
  if (isNode(properties) && isNode(value)) {
    const tagged = Object.entries(properties).every(([name, schema]) => !isNode(schema) || schema["const"] === undefined || value[name] === schema["const"]);
    if (!tagged) {
      return false;
    }
  }
  const union = node["oneOf"] ?? node["anyOf"];
  return !Array.isArray(union) || union.some((branch: unknown) => isNode(branch) && fits(value, branch));
}

/** `value` with `convert` applied to each of its bytes fields, as `given` places them. */
function walk(value: unknown, given: SchemaNode, convert: (bytes: unknown) => unknown): unknown {
  const node = resolved(given);
  if (node["contentEncoding"] === "base64") {
    return convert(value);
  }
  let result = value;
  const union = node["oneOf"] ?? node["anyOf"];
  if (Array.isArray(union)) {
    const branch: unknown = union.find((one: unknown) => isNode(one) && fits(value, one));
    if (isNode(branch)) {
      result = walk(result, branch, convert);
    }
  }
  const all = node["allOf"];
  if (Array.isArray(all)) {
    for (const branch of all) {
      if (isNode(branch)) {
        result = walk(result, branch, convert);
      }
    }
  }
  const items = node["items"];
  if (isNode(items) && Array.isArray(result)) {
    return result.map((item: unknown) => walk(item, items, convert));
  }
  const properties = node["properties"];
  const additional = node["additionalProperties"];
  if ((isNode(properties) || isNode(additional)) && isNode(result)) {
    return Object.fromEntries(
      Object.entries(result).map(([name, field]) => {
        const schema = isNode(properties) && Object.hasOwn(properties, name) ? properties[name] : additional;
        return [name, isNode(schema) ? walk(field, schema, convert) : field];
      }),
    );
  }
  return result;
}

/** RFC 4648 section 4's base64 of the bytes, padded, with no line break. */
function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function definition(name: string): SchemaNode {
  const node = DEFINITIONS[name];
  if (node === undefined) {
    throw new Error(`the schema's structure has no ${name}`);
  }
  return node;
}

/** A message of the schema's definition `union` with each bytes field written as its base64 text: what its line carries. */
export function encodeBytes(message: unknown, union: string): unknown {
  return walk(message, definition(union), (bytes) => (bytes instanceof Uint8Array ? base64Of(bytes) : bytes));
}

/** A message of `union` read from its line, the schema having passed it, with each bytes field its bytes. */
export function decodeBytes(message: unknown, union: string): unknown {
  return walk(message, definition(union), (text) => (typeof text === "string" ? new Uint8Array(Buffer.from(text, "base64")) : text));
}

// Writes the protocol's TypeScript types from the server's published schema
// (schema/protocol-15.json, the server's protocol/schema-15.json, generated
// from its Rust types): typescript.md TS-8 to TS-15. No library writes them
// (DEC-6477 answer 2): the schema uses few keywords, each mapped below, and
// any other keyword fails generation, naming it and its path, so a schema
// that says more than this generator understands never becomes a type that
// says less (TS-9). The types go to src/wire/generated/protocol.d.ts, with
// the schema's bytes fields beside them in bytes.js (TS-21), built here,
// never edited, never committed (TS-7, TS-12).
//   node scripts/types.ts           writes the files
//   node scripts/types.ts --check   writes nothing, and fails naming the first line that differs from the files written

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** A node of the schema, as JSON gives it. */
type Node = Readonly<Record<string, unknown>>;

/** Generation failed: the schema says something this generator does not understand, or two types would share a name. */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

/** The keywords TS-9's table maps, and nothing else. */
const KNOWN = new Set([
  "$defs",
  "$ref",
  "$schema",
  "title",
  "description",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "items",
  "minItems",
  "maxItems",
  "oneOf",
  "anyOf",
  "allOf",
  "enum",
  "const",
  "default",
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "contentEncoding",
]);

/**
 * The properties that tag a union's branches (TS-10 rule 2); `packet`, which
 * tags a packed line (the schema's PackedLine, which TS-10 does not name);
 * and `action` and `of`, which tag animation operations and rule values
 * (page-rules.md RULE-35, animation.md ANIM-21).
 */
const TAGS = ["type", "kind", "event", "form", "packet", "action", "of"] as const;

/** The longest fixed-length array written as a tuple (TS-9: as SRV-23's 16-entry channel map). */
const LONGEST_TUPLE = 16;

/** Words no type may be named, of TypeScript and of Python (TS-10 rule 5). */
const RESERVED = new Set([
  // TypeScript's reserved words and its built-in type names.
  ..."break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with as implements interface let package private protected public static yield any boolean constructor declare get module require number set string symbol type from of never unknown object bigint undefined".split(
    " ",
  ),
  // Python's keywords and soft keywords.
  ..."False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type _".split(
    " ",
  ),
]);

/** The text the schema's description and bounds make, as a documentation comment (TS-13). */
function comment(node: Node, indent: string, description?: unknown): string {
  const lines: string[] = [];
  const said = description ?? node["description"];
  if (typeof said === "string") {
    lines.push(...said.split("\n"));
  }
  const bounds: string[] = [];
  for (const keyword of ["pattern", "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "format"] as const) {
    if (node[keyword] !== undefined) {
      bounds.push(`${keyword} ${keyword === "pattern" ? `\`${String(node[keyword])}\`` : String(node[keyword])}`);
    }
  }
  if (node["contentEncoding"] === "base64") {
    bounds.push("bytes, written as exact base64 (RFC 4648 section 4)");
  }
  if (node["default"] !== undefined) {
    bounds.push(`absent: ${JSON.stringify(node["default"])}`);
  }
  if (bounds.length > 0) {
    lines.push(`Schema: ${bounds.join("; ")}.`);
  }
  if (lines.length === 0) {
    return "";
  }
  const safe = lines.map((line) => line.replaceAll("*/", "*\\/").trimEnd());
  return `${indent}/**\n${safe.map((line) => (line === "" ? `${indent} *` : `${indent} * ${line}`)).join("\n")}\n${indent} */\n`;
}

/** A tag's value in upper camel case: its parts between underscores, each with its first letter a capital (TS-10 rule 2). */
export function upperCamel(value: string): string {
  return value
    .split("_")
    .map((part) => (part === "" ? "" : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join("");
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name);
}

function literal(value: unknown, path: string): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return JSON.stringify(value);
  }
  throw new GenerationError(`${path}: a const or enum value that is not a string, number, boolean or null`);
}

/** The branches of a union, if each is an object tagged by one property's string const: that property. */
function tagOf(branches: readonly Node[]): string | undefined {
  return TAGS.find((tag) =>
    branches.every((branch) => {
      const properties = branch["properties"];
      return isNode(properties) && isNode(properties[tag]) && typeof properties[tag]["const"] === "string";
    }),
  );
}

/**
 * The property an object branch of an untagged union is named by: the first
 * of its required properties, in the schema's order, that no other object
 * branch of the union has (page-rules.md RULE-35's conditions: `read` is in
 * three branches, which `op`, `in_range` and `in_set` tell apart). A branch
 * with one property is the plain case of it.
 */
function distinguishing(branch: Node, branches: readonly Node[]): string | undefined {
  const required = branch["required"];
  const properties = branch["properties"];
  if (!isNode(properties) || !Array.isArray(required)) {
    return undefined;
  }
  const others = branches.filter((other) => other !== branch && other["type"] === "object" && other["$ref"] === undefined);
  return required.find(
    (property: unknown): property is string =>
      typeof property === "string" && others.every((other) => !isNode(other["properties"]) || other["properties"][property] === undefined),
  );
}

/**
 * Whether `node` is an object whose `oneOf` only says which one of its
 * properties it requires, as the server writes an amount (page-rules.md
 * RULE-106): `plus` and exactly one source, `variable`, `row` or `fired`.
 */
function isExclusive(node: Node): boolean {
  const union = node["oneOf"];
  return (
    node["type"] === "object" &&
    isNode(node["properties"]) &&
    node["required"] === undefined &&
    Array.isArray(union) &&
    union.length > 0 &&
    union.every((branch: unknown) => isNode(branch) && Object.keys(branch).length === 1 && Array.isArray(branch["required"]))
  );
}

/**
 * Whether `node` is a message with fields of its own of which exactly one of
 * some optional ones is given (renderer parity PAR-21: `regis` and `naplps`
 * take `data` or `parts`): an object with a `required` list beside a `oneOf`
 * whose every branch is a bare `required` list of its optional properties.
 * Its type is the object's, those properties optional; which one is given is
 * the validators' to hold.
 */
function isOneOfGiven(node: Node): boolean {
  const union = node["oneOf"];
  const properties = node["properties"];
  const required = node["required"];
  return (
    node["type"] === "object" &&
    isNode(properties) &&
    Array.isArray(required) &&
    Array.isArray(union) &&
    union.length > 1 &&
    union.every(
      (branch: unknown) =>
        isNode(branch) &&
        Object.keys(branch).length === 1 &&
        Array.isArray(branch["required"]) &&
        branch["required"].every((property: unknown) => typeof property === "string" && properties[property] !== undefined && !required.includes(property)),
    )
  );
}

/** A branch of a union that is itself only a union, as the server nests an amount's union in a wider one: its branches, which join the outer union's. */
function flattened(branches: readonly Node[]): readonly Node[] {
  return branches.flatMap((branch) => {
    const inner = branch["anyOf"] ?? branch["oneOf"];
    const own = Object.keys(branch).filter((keyword) => keyword !== "description");
    return Array.isArray(inner) && own.length === 1 && inner.every(isNode) ? flattened(inner) : [branch];
  });
}

/**
 * The amounts' names (page-rules.md RULE-55, RULE-106) by their properties:
 * the schema writes each inline, with no definition to name it by. A
 * target's number (RULE-12) takes the row's or the firing's, never a
 * variable. The Python kit's names (its generator's CHOICES).
 */
const AMOUNTS = new Map([
  ["fired plus row variable", "Amount"],
  ["fired plus row", "TargetAmount"],
]);

/** One type of the generated file, by name, with the schema path it came from. */
interface Declaration {
  readonly path: string;
  readonly text: string;
}

/** The generator's state over one schema. */
class Generator {
  readonly #definitions: Readonly<Record<string, Node>>;
  readonly #declared = new Map<string, Declaration>();

  constructor(definitions: Readonly<Record<string, Node>>) {
    this.#definitions = definitions;
  }

  get declared(): ReadonlyMap<string, Declaration> {
    return this.#declared;
  }

  declare(name: string, path: string, text: string): string {
    if (!/^[A-Za-z_$][\w$]*$/u.test(name)) {
      throw new GenerationError(`${path}: ${JSON.stringify(name)} is not a type name`);
    }
    if (RESERVED.has(name)) {
      throw new GenerationError(`${path}: the type's name ${name} is a reserved word`);
    }
    const before = this.#declared.get(name);
    if (before !== undefined) {
      throw new GenerationError(`${before.path} and ${path} would both be named ${name}`);
    }
    this.#declared.set(name, { path, text });
    return name;
  }

  /** Every keyword of `node` is one the table maps. */
  #known(node: Node, path: string): void {
    for (const keyword of Object.keys(node)) {
      if (!KNOWN.has(keyword) || (keyword === "$defs" && path !== "#")) {
        throw new GenerationError(`${path}: the keyword ${keyword}, which the generator does not map`);
      }
    }
  }

  /** The type expression of `node`; an object or union written inline is declared as `name` (TS-10 rule 3). */
  expression(node: Node, name: string, path: string): string {
    this.#known(node, path);
    const reference = node["$ref"];
    if (reference !== undefined) {
      return this.#reference(reference, path);
    }
    const union = node["oneOf"] ?? node["anyOf"];
    if (union !== undefined) {
      if (isExclusive(node)) {
        return this.#exclusive(node, path);
      }
      if (isOneOfGiven(node)) {
        const { oneOf: _given, ...fields } = node;
        return this.#typed(fields, name, path);
      }
      if (node["type"] === "object") {
        return this.#composite(node, name, path);
      }
      const keyword = node["oneOf"] === undefined ? "anyOf" : "oneOf";
      const nullable = this.#nullable(union, name, `${path}/${keyword}`);
      return nullable ?? this.#union(node, union, name, `${path}/${keyword}`);
    }
    const all = node["allOf"];
    if (all !== undefined) {
      if (!Array.isArray(all) || all.length === 0) {
        throw new GenerationError(`${path}/allOf: not a list of schemas`);
      }
      return all
        .map((branch: unknown, index) => {
          if (!isNode(branch)) {
            throw new GenerationError(`${path}/allOf/${index}: not a schema`);
          }
          return this.expression(branch, name, `${path}/allOf/${index}`);
        })
        .join(" & ");
    }
    if (node["const"] !== undefined) {
      return literal(node["const"], path);
    }
    if (node["enum"] !== undefined) {
      const values = node["enum"];
      if (!Array.isArray(values) || values.length === 0) {
        throw new GenerationError(`${path}/enum: not a list of values`);
      }
      return values.map((value: unknown) => literal(value, path)).join(" | ");
    }
    return this.#typed(node, name, path);
  }

  /** A union of one schema and null, as \`schemars\` writes an Option of a named type: that type or null, written inline, since it is no type of its own. */
  #nullable(union: unknown, name: string, path: string): string | null {
    if (!Array.isArray(union) || union.length !== 2 || !union.every(isNode)) {
      return null;
    }
    const [one, two] = union as readonly Node[];
    if (one === undefined || two?.["type"] !== "null" || Object.keys(two).length !== 1) {
      return null;
    }
    return `${this.expression(one, name, `${path}/0`)} | null`;
  }

  #reference(reference: unknown, path: string): string {
    const prefix = "#/$defs/";
    if (typeof reference !== "string" || !reference.startsWith(prefix) || this.#definitions[reference.slice(prefix.length)] === undefined) {
      throw new GenerationError(`${path}/$ref: ${JSON.stringify(reference)} names no definition of $defs`);
    }
    return reference.slice(prefix.length);
  }

  /** A node by its `type`. */
  #typed(node: Node, name: string, path: string): string {
    const type = node["type"];
    if (Array.isArray(type)) {
      // `schemars` writes an Option as its type and "null": each is the node with that one type.
      return type
        .map((one: unknown) => {
          if (one !== "string" && one !== "integer" && one !== "number" && one !== "boolean" && one !== "null" && one !== "array") {
            throw new GenerationError(`${path}/type: ${JSON.stringify(one)} in a list of types`);
          }
          return this.#typed({ ...node, type: one }, name, path);
        })
        .join(" | ");
    }
    switch (type) {
      case "string": {
        if (node["contentEncoding"] !== undefined && node["contentEncoding"] !== "base64") {
          throw new GenerationError(`${path}/contentEncoding: ${JSON.stringify(node["contentEncoding"])}, not base64`);
        }
        return node["contentEncoding"] === "base64" ? "Uint8Array" : "string";
      }
      case "integer":
      case "number":
      case "boolean":
      case "null": {
        return this.#primitive(type);
      }
      case "array": {
        return this.#array(node, name, path);
      }
      case "object": {
        return this.#object(node, name, path);
      }
      default: {
        throw new GenerationError(`${path}: a schema with no type, reference, union or value`);
      }
    }
  }

  #primitive(type: "string" | "integer" | "number" | "boolean" | "null"): string {
    if (type === "integer") {
      return "number";
    }
    return type;
  }

  #array(node: Node, name: string, path: string): string {
    const items = node["items"];
    if (!isNode(items)) {
      throw new GenerationError(`${path}: an array without one schema for its items`);
    }
    const item = this.expression(items, name, `${path}/items`);
    const least = node["minItems"];
    const most = node["maxItems"];
    const wrapped = /^[\w$]+$/u.test(item) ? item : `(${item})`;
    if (typeof least === "number" && least === most && least <= LONGEST_TUPLE) {
      return `readonly [${Array.from({ length: least }, () => item).join(", ")}]`;
    }
    return `readonly ${wrapped}[]`;
  }

  /** An object: an interface of readonly properties, or a map of named values. */
  #object(node: Node, name: string, path: string): string {
    const properties = node["properties"];
    const additional = node["additionalProperties"];
    if (properties === undefined && isNode(additional)) {
      return `Readonly<Record<string, ${this.expression(additional, name, `${path}/additionalProperties`)}>>`;
    }
    const patterned = node["patternProperties"];
    if (patterned !== undefined) {
      return this.#patterned(node, patterned, name, path);
    }
    if (!isNode(properties)) {
      throw new GenerationError(`${path}: an object without properties`);
    }
    if (additional !== false) {
      throw new GenerationError(`${path}: an object without additionalProperties: false, which every message of the protocol refuses (REQ-1475)`);
    }
    this.declare(name, path, this.#interface(node, properties, name, path, ""));
    return name;
  }

  /** A map whose names all match one pattern, as the server writes a map keyed by a rule table's names (RULE-38): a record of the one value type, the pattern in its comment. */
  #patterned(node: Node, patterned: unknown, name: string, path: string): string {
    const entries = isNode(patterned) ? Object.entries(patterned) : [];
    const [entry] = entries;
    if (entry === undefined || entries.length !== 1 || !isNode(entry[1]) || node["properties"] !== undefined || node["additionalProperties"] !== false) {
      throw new GenerationError(`${path}/patternProperties: not one pattern, alone and with additionalProperties: false`);
    }
    return `Readonly<Record<string, ${this.expression(entry[1], name, `${path}/patternProperties/${entry[0]}`)}>>`;
  }

  /** The body of an interface of `properties`. */
  #members(node: Node, properties: Node, name: string, path: string): string {
    const required = node["required"] ?? [];
    if (!Array.isArray(required)) {
      throw new GenerationError(`${path}/required: not a list`);
    }
    return Object.entries(properties)
      .map(([property, schema]) => {
        if (!isNode(schema)) {
          throw new GenerationError(`${path}/properties/${property}: not a schema`);
        }
        const type = this.expression(schema, `${name}${upperCamel(property)}`, `${path}/properties/${property}`);
        const documented = isNode(schema) && schema["$ref"] !== undefined ? comment({}, "  ", schema["description"]) : comment(schema, "  ");
        return `${documented}  readonly ${propertyName(property)}${required.includes(property) ? "" : "?"}: ${type};\n`;
      })
      .join("");
  }

  #interface(node: Node, properties: Node, name: string, path: string, extra: string): string {
    return `${comment(node, "")}export interface ${name}${extra} {\n${this.#members(node, properties, name, path)}}\n`;
  }

  /**
   * An object of which exactly one of some properties is given (an amount,
   * RULE-106): the properties no branch requires, each optional, beside a
   * union of one object for each branch with the property it requires.
   */
  #exclusive(node: Node, path: string): string {
    const name = AMOUNTS.get([...Object.keys(node["properties"] as Node)].sort().join(" "));
    if (name === undefined) {
      throw new GenerationError(`${path}: an object of exactly one of its properties whose properties name no amount the generator knows`);
    }
    // One type wherever the schema writes the shape inline; the bounds of `plus` differ with the field and are the validators' to hold.
    if (this.#declared.has(name)) {
      return name;
    }
    if (node["additionalProperties"] !== false) {
      throw new GenerationError(`${path}: an object without additionalProperties: false, which every message of the protocol refuses (REQ-1475)`);
    }
    const properties = node["properties"] as Node;
    const choices = (node["oneOf"] as readonly Node[]).map((branch) => branch["required"] as readonly unknown[]);
    const chosen = new Set(choices.flat());
    // Without their bounds, which differ from field to field of one shape.
    const common = Object.fromEntries(
      Object.entries(properties)
        .filter(([property]) => !chosen.has(property))
        .map(([property, schema]) => [
          property,
          isNode(schema) ? Object.fromEntries(Object.entries(schema).filter(([keyword]) => STRUCTURE.has(keyword))) : schema,
        ]),
    );
    const alternatives = choices.map((required, index) => {
      const members = required.map((property) => {
        const schema = typeof property === "string" ? properties[property] : undefined;
        if (typeof property !== "string" || !isNode(schema)) {
          throw new GenerationError(`${path}/oneOf/${index}: requires ${JSON.stringify(property)}, which is none of the object's properties`);
        }
        return `readonly ${propertyName(property)}: ${this.expression(schema, `${name}${upperCamel(property)}`, `${path}/properties/${property}`)}`;
      });
      return `  | { ${members.join("; ")} }`;
    });
    const shared = `{
${this.#members({}, common, name, path)}}`;
    this.declare(
      name,
      path,
      `${comment(node, "")}export type ${name} = ${shared} & (
${alternatives.join("\n")}
);
`,
    );
    return name;
  }

  /**
   * An object that is both a tagged branch and a union, as `schemars` writes
   * a newtype variant of an internally tagged enum (the server's
   * `ProgramMessage::Sound(Sound)`): its own tag beside the inner union, which
   * is named by that tag's value in upper camel case (`Sound`, the server's
   * type). Each branch is closed and restates the tag, so that it holds the
   * whole message (the server's schema, SRV-3); the inner union is written
   * without it, since the outer type carries it once.
   */
  #composite(node: Node, name: string, path: string): string {
    const properties = node["properties"];
    const union = node["oneOf"];
    if (!isNode(properties) || !Array.isArray(union)) {
      throw new GenerationError(`${path}: an object with a union but no properties or no oneOf`);
    }
    const tag = Object.entries(properties).find(([, value]) => isNode(value) && typeof value["const"] === "string");
    if (tag === undefined || Object.keys(properties).length !== 1 || !isNode(tag[1])) {
      throw new GenerationError(`${path}: an object with a union whose own properties are not one tag`);
    }
    const inner = upperCamel(String(tag[1]["const"]));
    const [tagName, tagSchema] = tag;
    const branches = union.map((branch: unknown, index) => {
      const at = `${path}/oneOf/${index}`;
      if (!isNode(branch) || !isNode(branch["properties"])) {
        throw new GenerationError(`${at}: a branch of a union beside a tag that is not an object with properties`);
      }
      const restated = branch["properties"][tagName];
      if (JSON.stringify(restated) !== JSON.stringify(tagSchema)) {
        throw new GenerationError(`${at}: a branch that does not restate its message's ${tagName}, ${JSON.stringify(tagSchema)}`);
      }
      const { [tagName]: _tag, ...properties } = branch["properties"];
      const required = Array.isArray(branch["required"]) ? branch["required"].filter((key: unknown) => key !== tagName) : branch["required"];
      return { ...branch, properties, required };
    });
    if (!path.startsWith("#/$defs/ProgramMessage/")) {
      return this.#placedComposite(node, union as readonly Node[], branches, name, path);
    }
    this.#union({}, branches, inner, `${path}/oneOf`);
    this.declare(name, path, `${comment(node, "")}export type ${name} = { readonly ${propertyName(tag[0])}: ${literal(tag[1]["const"], path)} } & ${inner};\n`);
    return name;
  }

  /**
   * A composite that is no program's message, as a group's `sound` command
   * (RULE-35: `play` without `page`), which the server's name `Sound` is not
   * for: a union named for its place, each whole branch named by its inner
   * tag (`RuleCommandSoundPlay`), as the Python kit names it (PY-10).
   */
  #placedComposite(node: Node, whole: readonly Node[], stripped: readonly Node[], name: string, path: string): string {
    const tag = tagOf(stripped);
    if (tag === undefined) {
      throw new GenerationError(`${path}/oneOf: the branches beside the tag have no tag of their own`);
    }
    const types = whole.map((branch, index) => {
      const value = String(((stripped[index]?.["properties"] as Node)[tag] as Node)["const"]);
      return this.expression(branch, `${name}${upperCamel(value)}`, `${path}/oneOf/${index}`);
    });
    this.declare(name, path, `${comment(node, "")}export type ${name} =\n${types.map((type) => `  | ${type}`).join("\n")};\n`);
    return name;
  }

  /** A union: tagged branches each named by their tag (TS-10 rule 2), an object branch by its one property, any other inline. */
  #union(node: Node, union: unknown, name: string, path: string): string {
    if (!Array.isArray(union) || union.length === 0 || !union.every(isNode)) {
      throw new GenerationError(`${path}: not a list of schemas`);
    }
    const branches = flattened(union);
    const tag = tagOf(branches);
    const types = branches.map((branch, index) => {
      const at = `${path}/${index}`;
      if (tag !== undefined) {
        const properties = branch["properties"] as Node;
        const value = String((properties[tag] as Node)["const"]);
        const branchName = `${name}${upperCamel(value)}`;
        return this.expression(branch, branchName, at);
      }
      if (isExclusive(branch)) {
        // An amount beside a plain integer (RULE-106): named by its shape, in AMOUNTS.
        return this.expression(branch, name, at);
      }
      if (branch["type"] === "object" && branch["$ref"] === undefined) {
        const property = distinguishing(branch, branches);
        if (property === undefined) {
          throw new GenerationError(`${at}: an object branch of an untagged union with no required property of its own, which has no name`);
        }
        return this.expression(branch, `${name}${upperCamel(property)}`, at);
      }
      return this.expression(branch, name, at);
    });
    this.declare(name, path, `${comment(node, "")}export type ${name} =\n${types.map((type) => `  | ${type}`).join("\n")};\n`);
    return name;
  }

  /** One definition of $defs, under its own name (TS-10 rule 1). */
  definition(name: string, node: Node): void {
    const path = `#/$defs/${name}`;
    this.#known(node, path);
    const isUnion = node["oneOf"] !== undefined || node["anyOf"] !== undefined;
    const isInterface = node["type"] === "object" && isNode(node["properties"]) && !isUnion;
    if (isUnion || isInterface) {
      this.expression(node, name, path);
      return;
    }
    this.declare(name, path, `${comment(node, "")}export type ${name} = ${this.expression(node, name, path)};\n`);
  }
}

/** The member types of TS-11: each message's branch that has `connections`, and each sound kind, without the fields the kit fills. */
function members(schema: Node, generator: Generator): string {
  const definitions = schema["$defs"] as Readonly<Record<string, Node>>;
  const program = definitions["ProgramMessage"]?.["oneOf"];
  if (!Array.isArray(program)) {
    throw new GenerationError("#/$defs/ProgramMessage: the schema has no union of a program's messages");
  }
  let text = "";
  const sounds: string[] = [];
  for (const branch of program as readonly Node[]) {
    const properties = branch["properties"] as Node;
    const type = String((properties["type"] as Node)["const"]);
    const wire = `ProgramMessage${upperCamel(type)}`;
    if (isNode(properties["connections"])) {
      text += `/** {@link ${wire}} as a program builds it: the kit adds \`type\` and \`connections\` (TS-11). */\nexport type ${wire}Member = Omit<${wire}, "type" | "connections">;\n`;
      generator.declare(`${wire}Member`, `#/$defs/ProgramMessage (${type})`, "");
    }
    const kinds = branch["oneOf"];
    if (Array.isArray(kinds) && !isOneOfGiven(branch)) {
      for (const kind of kinds as readonly Node[]) {
        const value = String(((kind["properties"] as Node)["kind"] as Node)["const"]);
        const sound = `${upperCamel(type)}${upperCamel(value)}`;
        text += `/** {@link ${sound}} as a program builds it: the kit adds \`type\` and \`connections\` (TS-11). */\nexport type ${sound}Member = Omit<${sound}, "connections">;\n`;
        generator.declare(`${sound}Member`, `#/$defs/ProgramMessage (${type} ${value})`, "");
        sounds.push(`${sound}Member`);
      }
    }
  }
  if (sounds.length === 0) {
    throw new GenerationError("#/$defs/ProgramMessage: no sound kinds");
  }
  generator.declare("SoundMember", "#/$defs/ProgramMessage (sound)", "");
  return `${text}/** Every sound kind's member type (TS-11): what \`context.sound\` takes. */\nexport type SoundMember =\n${sounds.map((sound) => `  | ${sound}`).join("\n")};\n`;
}

/** The keywords of the schema a bytes field's place is found by, at run time (TS-21): its structure, without words or bounds. */
const STRUCTURE = new Set(["$ref", "type", "const", "properties", "items", "oneOf", "anyOf", "allOf", "additionalProperties", "contentEncoding"]);

function structure(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(structure);
  }
  if (!isNode(node)) {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([keyword, value]) => STRUCTURE.has(keyword) && !(keyword === "additionalProperties" && typeof value === "boolean"))
      .map(([keyword, value]) =>
        keyword === "properties" && isNode(value)
          ? [keyword, Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, structure(schema)]))]
          : [keyword, structure(value)],
      ),
  );
}

/** The generated files' texts, from the schema's text. */
export function generate(schemaText: string, source: string): { readonly types: string; readonly bytes: string } {
  const schema: unknown = JSON.parse(schemaText);
  if (!isNode(schema) || !isNode(schema["$defs"])) {
    throw new GenerationError("#: a schema without $defs");
  }
  for (const keyword of Object.keys(schema)) {
    if (!KNOWN.has(keyword)) {
      throw new GenerationError(`#: the keyword ${keyword}, which the generator does not map`);
    }
  }
  const definitions = schema["$defs"] as Readonly<Record<string, Node>>;
  const generator = new Generator(definitions);
  for (const [name, node] of Object.entries(definitions)) {
    if (!isNode(node)) {
      throw new GenerationError(`#/$defs/${name}: not a schema`);
    }
    generator.definition(name, node);
  }
  const memberText = definitions["ProgramMessage"] === undefined ? "" : members(schema, generator);
  const header = `// Generated by scripts/types.ts from ${source}: never edit (typescript.md TS-8 to TS-15).\n`;
  const declarations = [...generator.declared.values()].map(({ text }) => text).filter((text) => text !== "");
  const types = `${header}${comment(schema, "")}\n${declarations.join("\n")}${memberText === "" ? "" : `\n${memberText}`}`;
  const bytes = `${header}export const BYTES_SCHEMA = ${JSON.stringify({ $defs: Object.fromEntries(Object.entries(definitions).map(([name, node]) => [name, structure(node)])) })};\n`;
  return { types, bytes };
}

/** The declaration of bytes.js. */
const BYTES_DECLARATION = `// Generated by scripts/types.ts: never edit.
/** The schema's structure, without its words and bounds: where its bytes fields are (TS-21). */
export declare const BYTES_SCHEMA: { readonly $defs: Readonly<Record<string, unknown>> };
`;

/** The first line at which two texts differ, 1 first; 0 for none. */
function firstDifference(one: string, two: string): number {
  const ones = one.split("\n");
  const twos = two.split("\n");
  for (let line = 0; line < Math.max(ones.length, twos.length); line += 1) {
    if (ones[line] !== twos[line]) {
      return line + 1;
    }
  }
  return 0;
}

function main(): void {
  const root = join(import.meta.dirname, "..");
  const source = "schema/protocol-15.json";
  const out = join(root, "src", "wire", "generated");
  const { types, bytes } = generate(readFileSync(join(root, source), "utf8"), source);
  const files: readonly (readonly [string, string])[] = [
    ["protocol.d.ts", types],
    ["bytes.js", bytes],
    ["bytes.d.ts", BYTES_DECLARATION],
  ];
  if (process.argv.includes("--check")) {
    for (const [file, text] of files) {
      const written = readFileSync(join(out, file), "utf8");
      const line = firstDifference(written, text);
      if (line !== 0) {
        throw new GenerationError(`src/wire/generated/${file}: line ${line} differs when generated again from the same schema`);
      }
    }
    return;
  }
  mkdirSync(out, { recursive: true });
  for (const [file, text] of files) {
    writeFileSync(join(out, file), text);
  }
}

if (import.meta.main) {
  main();
}

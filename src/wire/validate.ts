// Every message checked against the server's schema by the validators
// precompiled from it (scripts/validators.ts; DEC-1482 item 7): a program's
// before it is written, so a mistake is caught where it is made, and the
// server's after it is read, so nothing acts on a line that is not valid.
// A program's message the schema passes is then held to the server's rules
// for pages, indexes and text that the schema cannot state, with the limits
// `start` gave (server-rules.ts); a sound is held to the schema alone, every
// other rule of it the server's (typescript.md TS-17). A fault is said as the server says a
// refusal: the path of the first fault and the rule broken, from the
// server's closed list (REQ-1475).

import type { Fault } from "./fault.ts";
import { type ValidationFault, type Validator, program, server } from "./generated/validators.js";
import type { Limits } from "./limits.ts";
import { pictureFault } from "./picture-rules.ts";
import { decodeBytes } from "./bytes.ts";
import type { Encoded } from "./encoded.ts";
import type { ProgramMessage, ServerMessage } from "./generated/protocol.js";
import { checkRules } from "./server-rules.ts";

/** A message the program was about to write broke the protocol: nothing of it was written. */
export class ProtocolError extends Error {
  readonly fault: Fault;

  constructor(type: string, fault: Fault) {
    super(`${type}: ${fault.path === "" ? "the message" : fault.path}: ${fault.rule} (${fault.detail})`);
    this.name = "ProtocolError";
    this.fault = fault;
  }
}

/** Ajv's keywords as the server's rules (the schema's $defs/Rule). */
const RULES: Readonly<Record<string, string>> = {
  additionalProperties: "unknown_field",
  required: "missing_field",
  type: "wrong_type",
  pattern: "wrong_type",
  format: "wrong_type",
  const: "not_listed",
  enum: "not_listed",
  oneOf: "not_listed",
  anyOf: "not_listed",
  minimum: "out_of_range",
  maximum: "out_of_range",
  maxLength: "too_long",
  maxItems: "too_long",
  minLength: "too_short",
  minItems: "too_short",
};

/** "/page/rows/3" as the server writes it: "page.rows[3]". */
function pathOf(pointer: string): string {
  let path = "";
  for (const part of pointer.split("/").slice(1)) {
    if (/^\d+$/u.test(part)) {
      path += `[${part}]`;
    } else {
      path += path === "" ? part : `.${part}`;
    }
  }
  return path;
}

/** The field every language tag is, a page's and a text run's. */
const LANGUAGE_FIELD = "/language";

/** Keywords that say only that no alternative of a union fitted: another fault at the same place says more. */
const VAGUE: ReadonlySet<string> = new Set(["type", "anyOf", "oneOf", "const", "enum"]);

/** The fault to report of those Ajv found: the deepest, where a union's alternatives each found one, and of those the most telling. */
function first(faults: readonly ValidationFault[]): Fault {
  const depth = Math.max(...faults.map((fault) => fault.instancePath.length));
  const deepest = faults.filter((fault) => fault.instancePath.length === depth);
  const chosen = deepest.find((fault) => !VAGUE.has(fault.keyword)) ?? deepest[0];
  if (chosen === undefined) {
    return { path: "", rule: "syntax", detail: "not valid" };
  }
  const detail = `${chosen.message ?? chosen.keyword}${Object.keys(chosen.params).length > 0 ? ` ${JSON.stringify(chosen.params)}` : ""}`;
  // The server reads a language as any text and then looks for it in
  // start.languages, refusing one outside them as unknown_language (its
  // check_language, REQ-2215); the schema states that list as an enum.
  const language = chosen.instancePath.endsWith(LANGUAGE_FIELD) && deepest.some((fault) => fault.keyword === "enum");
  return { path: pathOf(chosen.instancePath), rule: language ? "unknown_language" : (RULES[chosen.keyword] ?? "wrong_type"), detail };
}

function check(validators: Readonly<Record<string, Validator>>, message: unknown): Fault | null {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return { path: "", rule: "syntax", detail: "not one JSON object" };
  }
  const type: unknown = "type" in message ? message.type : undefined;
  const validator = typeof type === "string" && Object.hasOwn(validators, type) ? validators[type] : undefined;
  if (validator === undefined) {
    return { path: "type", rule: "not_listed", detail: `no message is of type ${JSON.stringify(type) ?? "undefined"}` };
  }
  return validator(message) ? null : first(validator.errors ?? []);
}

function isProgramMessage(message: unknown): message is Encoded<ProgramMessage> {
  return check(program, message) === null;
}

/** Whether a message the program would send, as its line carries it, is valid, by the schema and then by the server's rules within the limits `start` gave: null, or its first fault. */
export function checkProgram(message: unknown, limits: Limits): Fault | null {
  if (!isProgramMessage(message)) {
    return check(program, message);
  }
  return message.type === "regis_links" || message.type === "regis_cursor" || message.type === "naplps"
    ? pictureFault(message, limits)
    : checkRules(message, limits);
}

/** Whether a message the server sent is valid: null, or its first fault. */
export function checkServer(message: unknown): Fault | null {
  return check(server, message);
}

/** A message the server sent, valid by the schema, with its bytes fields as bytes; or its first fault. */
export function readServer(message: unknown): ServerMessage | Fault {
  const fault = checkServer(message);
  // The validator has passed it: it is the generated type, as its line carried it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the validator compiled from the schema has passed it
  return fault ?? (decodeBytes(message, "ServerMessage") as ServerMessage);
}

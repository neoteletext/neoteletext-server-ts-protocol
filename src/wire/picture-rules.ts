// The server's rules for what a program says of a sub-page's picture: its
// ReGIS and NAPLPS, given as bytes or as parts (renderer parity PAR-21), its
// drawing and object links and its cursor (the server's REQ-6372, PAR-20),
// a kept picture forgotten (PAR-19) and picture text measured (PAR-22): a
// port of check_regis, check_naplps, check_picture_bytes,
// check_regis_links, check_naplps_links, check_shown_subpage and the
// measure_picture_text arm of the server's
// crates/teletext-runtime/src/protocol/check.rs at neoteletext-app-server
// 25bc0e7, and of the links a rule table's group holds (Scope::links_body
// of its protocol/check/rules.rs at 9059c09; PAR-20, RULE-119). What a text part's language shows, and whether the bytes draw,
// are the server's to say: it encodes and reads them as a receiver would.

import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import type { Encoded } from "./encoded.ts";
import type { PicturePart, ProgramMessage, RuleCommand, RuleTable } from "./generated/protocol.js";
import { base64Bytes, boundedTextFault, firstOf, given, isFault } from "./rule-pieces.ts";

/** The program's messages of a sub-page's picture, as their lines carry them. */
export type PictureMessage = Extract<
  Encoded<ProgramMessage>,
  { type: "regis" | "naplps" | "regis_links" | "regis_cursor" | "naplps_links" | "naplps_cursor" | "forget_picture" | "measure_picture_text" }
>;

/** The types of {@link PictureMessage}, for telling one from the program's other messages. */
const PICTURE_TYPES: ReadonlySet<string> = new Set<PictureMessage["type"]>([
  "regis",
  "naplps",
  "regis_links",
  "regis_cursor",
  "naplps_links",
  "naplps_cursor",
  "forget_picture",
  "measure_picture_text",
]);

/** Whether a message is of a sub-page's picture, whose rules are here. */
export function isPictureMessage(message: Encoded<ProgramMessage>): message is PictureMessage {
  return PICTURE_TYPES.has(message.type);
}

/** The sub-code that names no sub-page (EN 300 706 clause 9.6.1). */
const ANY_SUBPAGE = "3F7F";
/** The most drawing or object links a sub-page has (the server's MOST_DRAWING_LINKS). */
const MOST_DRAWING_LINKS = 64;
/** The most bytes one picture message, or one of its parts, carries once decoded (the server's MOST_REGIS_BYTES). */
const MOST_PICTURE_MESSAGE_BYTES = 1024 * 1024;
/** The most parts one picture message has (the server's MOST_PICTURE_PARTS, renderer parity PAR-21). */
const MOST_PICTURE_PARTS = 64;
/** The most characters of one text part, or of text measured (the server's MOST_PART_CHARACTERS, the engine's MAX_PART_CHARACTERS; PAR-3). */
const MOST_PART_CHARACTERS = 1000;
/** Printable ASCII with no space and no comma: what a link target is made of. */
const TARGET_TEXT = /^[!-+\--~]+$/u;

/** A message about one sub-page's picture names that sub-page (the server's check_shown_subpage). */
function shownSubpageFault(sub: string): Fault | null {
  return sub === ANY_SUBPAGE ? { path: "sub", rule: "out_of_range", detail: "3F7F names no sub-page" } : null;
}

/** One part at `path`: its bytes as `data`'s, or its text 1 to MOST_PART_CHARACTERS characters in normalisation form C with no control or bidirectional formatting character. */
function partFault(path: string, part: Encoded<PicturePart>, index: number): Fault | null {
  const at = `${path}[${index}]`;
  if ("text" in part) {
    return boundedTextFault(`${at}.text`, part.text, MOST_PART_CHARACTERS);
  }
  const bytes = base64Bytes(`${at}.data`, part.data, MOST_PICTURE_MESSAGE_BYTES);
  return isFault(bytes) ? bytes : null;
}

/** A picture's parts at `path` (PAR-21): 1 to MOST_PICTURE_PARTS of them, each a part, their bytes at most `mostBytes`. */
export function partsFault(path: string, listed: readonly Encoded<PicturePart>[], mostBytes: number): Fault | null {
  if (listed.length === 0 || listed.length > MOST_PICTURE_PARTS) {
    return { path, rule: "invalid_picture_parts", detail: `${listed.length} parts, 1 to MOST_PICTURE_PARTS (${MOST_PICTURE_PARTS})` };
  }
  const fault = firstOf(listed, (part, index) => partFault(path, part, index));
  if (fault !== null) {
    return fault;
  }
  // The parts' bytes joined are held as `data`'s; what the text parts add is the server's to count once it has written them.
  const bytes = listed.reduce((sum, part) => sum + ("data" in part ? Buffer.from(part.data, "base64").length : 0), 0);
  return bytes > mostBytes ? { path, rule: "too_long", detail: `${bytes} bytes of parts, at most ${mostBytes}` } : null;
}

/**
 * Whether a `regis` or `naplps` message gives exactly one of `data` and `parts` (the server's check_picture_bytes,
 * PAR-21), told before the schema is: the schema says it with a `oneOf`, whose fault names neither field, and the
 * server names the field and the rule.
 */
export function exclusiveBytesFault(message: unknown): Fault | null {
  if (typeof message !== "object" || message === null || !("type" in message) || (message.type !== "regis" && message.type !== "naplps")) {
    return null;
  }
  const data = "data" in message ? message.data : null;
  const parts = "parts" in message ? message.parts : null;
  if (!given(data) && !given(parts)) {
    return { path: "data", rule: "missing_field", detail: "a picture message gives `data` or `parts`" };
  }
  if (given(data) && given(parts)) {
    return { path: "parts", rule: "duplicate_field", detail: "a picture message gives `data` or `parts`, not both" };
  }
  return null;
}

/** A picture's bytes (the server's check_picture_bytes, PAR-21): `data`'s, or the parts 1 to MOST_PICTURE_PARTS long; exactly one is given, as {@link exclusiveBytesFault} has held. */
function pictureBytesFault(message: Extract<PictureMessage, { type: "regis" | "naplps" }>): Fault | null {
  const { data, parts } = message;
  if (given(data)) {
    const bytes = base64Bytes("data", data, MOST_PICTURE_MESSAGE_BYTES);
    return isFault(bytes) ? bytes : null;
  }
  return partsFault("parts", parts ?? [], MOST_PICTURE_MESSAGE_BYTES);
}

/** The detail of a link target that is not one. */
function targetDetail(limits: Limits): string {
  return `not a link target: printable ASCII with no space and no comma, at most ${limits.standard.linkTargetBytes} bytes`;
}

/** The rules a sub-page's picture links are refused under: the message's own, or a group's command's (RULE-35). */
type LinksRule = "invalid_drawing_links" | "invalid_naplps_links" | "invalid_group";

/**
 * Links of a sub-page's picture at `at` (the server's check_picture_links, PAR-20): at most MOST_DRAWING_LINKS, each
 * drawing or object named once, each target the text a link target is made of within the bound `start` gave, refused
 * under `rule`. Whether a target names something is the server's to check.
 */
function linksFault(
  at: string,
  numbers: readonly number[],
  targets: readonly string[],
  what: "drawing" | "object",
  rule: LinksRule,
  limits: Limits,
): Fault | null {
  if (numbers.length > MOST_DRAWING_LINKS) {
    return { path: at, rule, detail: `${numbers.length} links, at most ${MOST_DRAWING_LINKS}` };
  }
  const seen = new Set<number>();
  return firstOf(numbers, (number, index) => {
    if (seen.has(number)) {
      return { path: `${at}[${index}].${what}`, rule, detail: `${what} ${number} is named twice` };
    }
    seen.add(number);
    const target = targets[index] ?? "";
    return target.length <= limits.standard.linkTargetBytes && TARGET_TEXT.test(target)
      ? null
      : { path: `${at}[${index}].target`, rule, detail: targetDetail(limits) };
  });
}

/** A group's command of a sub-page's picture links at `at`, held as the message's links are and refused as a group's command (`invalid_group`); any other command has no such rule here. */
function commandLinksFault(command: Encoded<RuleCommand>, at: string, limits: Limits): Fault | null {
  if (command.type === "regis_links") {
    const { links } = command;
    return linksFault(
      `${at}.links`,
      links.map((link) => link.drawing),
      links.map((link) => link.target),
      "drawing",
      "invalid_group",
      limits,
    );
  }
  if (command.type === "naplps_links") {
    const { links } = command;
    return linksFault(
      `${at}.links`,
      links.map((link) => link.object),
      links.map((link) => link.target),
      "object",
      "invalid_group",
      limits,
    );
  }
  return null;
}

/**
 * The first fault of the picture links a rule table's groups and rules hold (the server's Scope::links_body,
 * PAR-20, RULE-119, RULE-35): each `regis_links` and `naplps_links` command, in the table's named groups and in its
 * rules' `do`, held as the message's links are and refused as `invalid_group`. Every other rule of a table is the
 * server's (DEC-6462), and so is whether a group's links fit one command of MAX_COMMAND_BYTES, which the engine's
 * table check measures on the record it writes.
 */
export function tableLinksFault(table: Encoded<RuleTable> | null, limits: Limits): Fault | null {
  if (table === null) {
    return null;
  }
  const inGroups = firstOf(table.groups ?? [], (group, index) =>
    firstOf(group.commands, (command, place) => commandLinksFault(command, `table.groups[${index}].commands[${place}]`, limits)),
  );
  return (
    inGroups ??
    firstOf(table.rules, (rule, index) => firstOf(rule.do ?? [], (command, place) => commandLinksFault(command, `table.rules[${index}].do[${place}]`, limits)))
  );
}

/** The first fault of a message of a sub-page's picture; null when there is none. */
export function pictureFault(message: PictureMessage, limits: Limits): Fault | null {
  if (message.type === "measure_picture_text") {
    return boundedTextFault("text", message.text, MOST_PART_CHARACTERS);
  }
  const shown = shownSubpageFault(message.sub);
  if (shown !== null) {
    return shown;
  }
  if (message.type === "regis" || message.type === "naplps") {
    return pictureBytesFault(message);
  }
  if (message.type === "regis_links") {
    const { links } = message;
    return linksFault(
      "links",
      links.map((link) => link.drawing),
      links.map((link) => link.target),
      "drawing",
      "invalid_drawing_links",
      limits,
    );
  }
  if (message.type === "naplps_links") {
    const { links } = message;
    return linksFault(
      "links",
      links.map((link) => link.object),
      links.map((link) => link.target),
      "object",
      "invalid_naplps_links",
      limits,
    );
  }
  // A cursor and a kept picture forgotten name their sub-page and nothing more the schema leaves.
  return null;
}

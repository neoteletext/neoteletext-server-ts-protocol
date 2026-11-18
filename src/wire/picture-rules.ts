// The server's rules for what a program says of a sub-page's picture: its
// ReGIS and NAPLPS, given as bytes or as parts (renderer parity PAR-21), its
// drawing and object links and its cursor (the server's REQ-6372, PAR-20),
// a kept picture forgotten (PAR-19) and picture text measured (PAR-22): a
// port of check_regis, check_naplps, check_picture_bytes,
// check_regis_links, check_naplps_links, check_shown_subpage and the
// measure_picture_text arm of the server's
// crates/teletext-runtime/src/protocol/check.rs at neoteletext-app-server
// 25bc0e7. What a text part's language shows, and whether the bytes draw,
// are the server's to say: it encodes and reads them as a receiver would.

import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import type { Encoded } from "./encoded.ts";
import type { PicturePart, ProgramMessage } from "./generated/protocol.js";
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

/** One part: its bytes as `data`'s, or its text 1 to MOST_PART_CHARACTERS characters in normalisation form C with no control or bidirectional formatting character. */
function partFault(part: Encoded<PicturePart>, index: number): Fault | null {
  const at = `parts[${index}]`;
  if ("text" in part) {
    return boundedTextFault(`${at}.text`, part.text, MOST_PART_CHARACTERS);
  }
  const bytes = base64Bytes(`${at}.data`, part.data, MOST_PICTURE_MESSAGE_BYTES);
  return isFault(bytes) ? bytes : null;
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
  const listed = parts ?? [];
  if (listed.length === 0 || listed.length > MOST_PICTURE_PARTS) {
    return { path: "parts", rule: "invalid_picture_parts", detail: `${listed.length} parts, 1 to MOST_PICTURE_PARTS (${MOST_PICTURE_PARTS})` };
  }
  const fault = firstOf(listed, partFault);
  if (fault !== null) {
    return fault;
  }
  // The parts' bytes joined are held as `data`'s; what the text parts add is the server's to count once it has written them.
  const bytes = listed.reduce((sum, part) => sum + ("data" in part ? Buffer.from(part.data, "base64").length : 0), 0);
  return bytes > MOST_PICTURE_MESSAGE_BYTES
    ? { path: "parts", rule: "too_long", detail: `${bytes} bytes of parts, at most ${MOST_PICTURE_MESSAGE_BYTES}` }
    : null;
}

/** The detail of a link target that is not one. */
function targetDetail(limits: Limits): string {
  return `not a link target: printable ASCII with no space and no comma, at most ${limits.standard.linkTargetBytes} bytes`;
}

/**
 * Links of a sub-page's picture (the server's check_regis_links and check_naplps_links, PAR-20): at most
 * MOST_DRAWING_LINKS, each drawing or object named once, each target the text a link target is made of within the
 * bound `start` gave. Whether a target names something is the server's to check.
 */
function linksFault(numbers: readonly number[], targets: readonly string[], what: "drawing" | "object", limits: Limits): Fault | null {
  const rule = what === "drawing" ? "invalid_drawing_links" : "invalid_naplps_links";
  if (numbers.length > MOST_DRAWING_LINKS) {
    return { path: "links", rule, detail: `${numbers.length} links, at most ${MOST_DRAWING_LINKS}` };
  }
  const seen = new Set<number>();
  return firstOf(numbers, (number, index) => {
    if (seen.has(number)) {
      return { path: `links[${index}].${what}`, rule, detail: `${what} ${number} is named twice` };
    }
    seen.add(number);
    const target = targets[index] ?? "";
    return target.length <= limits.standard.linkTargetBytes && TARGET_TEXT.test(target)
      ? null
      : { path: `links[${index}].target`, rule, detail: targetDetail(limits) };
  });
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
      links.map((link) => link.drawing),
      links.map((link) => link.target),
      "drawing",
      limits,
    );
  }
  if (message.type === "naplps_links") {
    const { links } = message;
    return linksFault(
      links.map((link) => link.object),
      links.map((link) => link.target),
      "object",
      limits,
    );
  }
  // A cursor and a kept picture forgotten name their sub-page and nothing more the schema leaves.
  return null;
}

// The server's rules for what a program says of a sub-page's picture
// beside its ReGIS: its drawing links and its cursor drawing (the server's
// REQ-6372), and its NAPLPS (the NAPLPS renderer's REQ-6408 item 3).

import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import type { Encoded } from "./encoded.ts";
import type { ProgramMessage } from "./generated/protocol.js";
import { base64Bytes, isFault } from "./rule-pieces.ts";

/** What a program says of a sub-page's picture beside its ReGIS, as its line carries it: its drawing links, its cursor drawing, and its NAPLPS. */
export type PictureMessage = Extract<Encoded<ProgramMessage>, { type: "regis_links" | "regis_cursor" | "naplps" }>;

/** The sub-code that names no sub-page (EN 300 706 clause 9.6.1). */
const ANY_SUBPAGE = "3F7F";
/** The most drawing links a sub-page has (the server's MOST_DRAWING_LINKS). */
const MOST_DRAWING_LINKS = 64;
/** Printable ASCII with no space and no comma: what a link target is made of. */
const TARGET_TEXT = /^[!-+\--~]+$/u;

/** A sub-page's drawing links: a sub-code that names a sub-page, at most 64 links, each drawing once, and each target the text a link target is made of (the server's check_regis_links). Whether a target names something is the server's to check. */
function regisLinksFault(message: Extract<PictureMessage, { type: "regis_links" }>, limits: Limits): Fault | null {
  if (message.sub === ANY_SUBPAGE) {
    return { path: "sub", rule: "out_of_range", detail: "3F7F names no sub-page" };
  }
  if (message.links.length > MOST_DRAWING_LINKS) {
    return { path: "links", rule: "invalid_drawing_links", detail: `${message.links.length} links, at most ${MOST_DRAWING_LINKS}` };
  }
  const seen = new Set<number>();
  for (const [index, link] of message.links.entries()) {
    if (seen.has(link.drawing)) {
      return { path: `links[${index}].drawing`, rule: "invalid_drawing_links", detail: `drawing ${link.drawing} is named twice` };
    }
    seen.add(link.drawing);
    if (link.target.length > limits.standard.linkTargetBytes || !TARGET_TEXT.test(link.target)) {
      return {
        path: `links[${index}].target`,
        rule: "invalid_drawing_links",
        detail: `not a link target: printable ASCII with no space and no comma, at most ${limits.standard.linkTargetBytes} bytes`,
      };
    }
  }
  return null;
}

/** The most NAPLPS one message carries once decoded: what a `regis` message may (the server's MOST_REGIS_BYTES). */
const MOST_NAPLPS_BYTES = 1024 * 1024;

/** The first fault of a sub-page's drawing links, cursor drawing or NAPLPS; null when there is none. */
export function pictureFault(message: PictureMessage, limits: Limits): Fault | null {
  if (message.type === "regis_links") {
    return regisLinksFault(message, limits);
  }
  if (message.sub === ANY_SUBPAGE) {
    return { path: "sub", rule: "out_of_range", detail: "3F7F names no sub-page" };
  }
  if (message.type === "naplps") {
    // Exact base64 within the bound (the server's check_naplps); the bytes themselves are not read.
    const bytes = base64Bytes("data", message.data, MOST_NAPLPS_BYTES);
    return isFault(bytes) ? bytes : null;
  }
  return null;
}

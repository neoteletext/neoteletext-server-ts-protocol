// The server's rules for what a program says of a ReGIS sub-page's picture
// beside its ReGIS: its drawing links and its cursor drawing (the server's
// REQ-6372).

import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import type { PictureMessage } from "./protocol.ts";

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

/** The first fault of a sub-page's drawing links or cursor drawing; null when there is none. */
export function pictureFault(message: PictureMessage, limits: Limits): Fault | null {
  if (message.type === "regis_links") {
    return regisLinksFault(message, limits);
  }
  return message.sub === ANY_SUBPAGE ? { path: "sub", rule: "out_of_range", detail: "3F7F names no sub-page" } : null;
}

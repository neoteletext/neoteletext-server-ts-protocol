// The server's rules for a page's description for the web, which its
// schema cannot state (REQ-1728 items 3 and 6, renderer parity PAR-26): a
// port of check_description and check_description_picture of the server's
// crates/teletext-runtime/src/protocol/check.rs at neoteletext-app-server
// 25bc0e7, each field checked in the order the server checks it.

import type { Encoded } from "./encoded.ts";
import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import { pageFault } from "./page-rules.ts";
import type { ProgramMessage as WireMessage } from "./generated/protocol.js";
import { base64Bytes, boundedTextFault, given, isFault } from "./rule-pieces.ts";

/** A message as its line carries it. */
type ProgramMessage = Encoded<WireMessage>;

/** The most bytes of a described page's picture once decoded (the server's MOST_DESCRIPTION_PICTURE_BYTES, renderer parity PAR-26). */
const MOST_DESCRIPTION_PICTURE_BYTES = 262_144;
/** The sub-code that names no sub-page (EN 300 706 clause 9.6.1). */
const ANY_SUBPAGE = "3F7F";

/** A described page's picture (the server's check_description_picture, PAR-26): a sub-code that names a sub-page, or bytes within the bound, with objects for NAPLPS only. The objects' own rules are the server's, as `naplps_objects`'s are. */
function descriptionPictureFault(picture: NonNullable<Extract<ProgramMessage, { type: "description" }>["picture"]>): Fault | null {
  if ("kept" in picture) {
    return picture.kept === ANY_SUBPAGE ? { path: "picture.kept", rule: "out_of_range", detail: "3F7F names no sub-page" } : null;
  }
  const bytes = base64Bytes("picture.data", picture.data, MOST_DESCRIPTION_PICTURE_BYTES);
  if (isFault(bytes)) {
    return bytes;
  }
  if (bytes.length > MOST_DESCRIPTION_PICTURE_BYTES) {
    return {
      path: "picture.data",
      rule: "too_long",
      detail: `${bytes.length} bytes, at most MOST_DESCRIPTION_PICTURE_BYTES (${MOST_DESCRIPTION_PICTURE_BYTES})`,
    };
  }
  return given(picture.objects) && picture.language === "regis"
    ? { path: "picture.objects", rule: "unknown_field", detail: "objects are NAPLPS's: a ReGIS picture gives none" }
    : null;
}

/** A public page gives its title, text and sub-page, the sub-page of the page named, and may give a picture; a page that is not public gives nothing (REQ-1728 items 3 and 6, PAR-26; the server's check_description). */
export function descriptionFault(message: Extract<ProgramMessage, { type: "description" }>, limits: Limits): Fault | null {
  const { title, text, content, picture } = message;
  if (!message.public && given(picture)) {
    return { path: "picture", rule: "unknown_field", detail: "a page that is not public gives nothing" };
  }
  const pictured = given(picture) ? descriptionPictureFault(picture) : null;
  if (pictured !== null) {
    return pictured;
  }
  const present = [
    ["title", given(title)],
    ["text", given(text)],
    ["content", given(content)],
  ] as const;
  if (!message.public) {
    const extra = present.find(([, isGiven]) => isGiven);
    return extra === undefined ? null : { path: extra[0], rule: "unknown_field", detail: "a page that is not public gives nothing" };
  }
  const missing = present.find(([, isGiven]) => !isGiven);
  if (missing !== undefined) {
    return { path: missing[0], rule: "missing_field", detail: "a public page gives its title, text and content" };
  }
  return (
    (given(title) ? boundedTextFault("title", title, limits.budgets.titleCharacters) : null) ??
    (given(text) ? boundedTextFault("text", text, limits.budgets.descriptionTextCharacters) : null) ??
    (given(content) && content.page !== message.page
      ? { path: "content.page", rule: "wrong_page", detail: `${content.page}, for the description of ${message.page}` }
      : null) ??
    (given(content) ? pageFault("content", content, limits) : null)
  );
}

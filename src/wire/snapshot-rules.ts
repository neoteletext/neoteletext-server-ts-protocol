// The server's rules for a program's answer to `snapshot`, which its schema
// cannot state (tab-thumbnails.md sections 6.3 and 6.5; REQ-6900): the
// sub-page is checked by every rule a page message's is, and its picture as
// the `regis` and `naplps` messages' are, within the bound of
// `description.picture`, and a kept picture names the answered sub-page
// itself (neoteletext-app-server c5557e4). Whether the page and sub-code
// are the ones asked for, and whether a kept picture is kept, are the
// server's to say: it alone knows what it asked (`wrong_page`, `not_kept`).

import type { Encoded } from "./encoded.ts";
import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import { pageFault } from "./page-rules.ts";
import { partsFault } from "./picture-rules.ts";
import type { ProgramMessage as WireMessage } from "./generated/protocol.js";
import { base64Bytes, given, isFault } from "./rule-pieces.ts";

/** The answer as its line carries it. */
type SnapshotPage = Extract<Encoded<WireMessage>, { type: "snapshot_page" }>;

/** The most bytes of a snapshot's picture once decoded (section 6.3: as `description.picture`'s, the server's MOST_DESCRIPTION_PICTURE_BYTES). */
export const MOST_SNAPSHOT_PICTURE_BYTES = 262_144;
/** The sub-code that names no sub-page (EN 300 706 clause 9.6.1). */
const ANY_SUBPAGE = "3F7F";

/** The answer's picture: the kept picture of the answered sub-page, or bytes or parts within the bound, with objects for NAPLPS only. */
function snapshotPictureFault(picture: NonNullable<SnapshotPage["picture"]>, sub: string): Fault | null {
  if ("kept" in picture) {
    if (picture.kept === ANY_SUBPAGE) {
      return { path: "picture.kept", rule: "out_of_range", detail: "3F7F names no sub-page" };
    }
    return picture.kept === sub ? null : { path: "picture.kept", rule: "wrong_page", detail: `${picture.kept}, for the sub-page ${sub}` };
  }
  const { data, parts } = picture;
  if (given(data) === given(parts)) {
    return given(data)
      ? { path: "picture.parts", rule: "duplicate_field", detail: "a picture gives `data` or `parts`, not both" }
      : { path: "picture.data", rule: "missing_field", detail: "a picture gives `data` or `parts`" };
  }
  if (given(data)) {
    const bytes = base64Bytes("picture.data", data, MOST_SNAPSHOT_PICTURE_BYTES);
    if (isFault(bytes)) {
      return bytes;
    }
    if (bytes.length > MOST_SNAPSHOT_PICTURE_BYTES) {
      return { path: "picture.data", rule: "too_long", detail: `${bytes.length} bytes, at most ${MOST_SNAPSHOT_PICTURE_BYTES}` };
    }
  } else {
    const fault = partsFault("picture.parts", parts ?? [], MOST_SNAPSHOT_PICTURE_BYTES);
    if (fault !== null) {
      return fault;
    }
  }
  return given(picture.objects) && picture.language === "regis"
    ? { path: "picture.objects", rule: "unknown_field", detail: "objects are NAPLPS's: a ReGIS picture gives none" }
    : null;
}

/** The first fault of a `snapshot_page` the schema has passed: its sub-page's, then its picture's. */
export function snapshotPageFault(message: SnapshotPage, limits: Limits): Fault | null {
  return pageFault("page", message.page, limits) ?? (given(message.picture) ? snapshotPictureFault(message.picture, message.page.sub) : null);
}

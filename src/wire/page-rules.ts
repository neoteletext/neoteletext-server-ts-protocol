// The server's rules of one sub-page beyond its schema: the page and its
// sub-code, its rows, its Link Extension links, its packets and its text
// runs, in the order of the server's check_page and check_subpage
// (crates/teletext-runtime/src/protocol/check.rs at neoteletext-app-server
// e6d95f7).

import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import type { Encoded } from "./encoded.ts";
import type { LinkExtension, PackedLine, Page as WirePage } from "./generated/protocol.js";

/** A sub-page as its line carries it, its rows base64. */
type Page = Encoded<WirePage>;
import { HEX, base64Bytes, boundedTextFault, firstOf, given, isFault, textFault } from "./rule-pieces.ts";
import { CODE_MASK, COLUMNS } from "../page/geometry.ts";
import { longestLabel, targetKind } from "../page/link-targets.ts";
import { isReserved } from "../page/page-numbers.ts";

/** The last sub-code a sub-page may have: 3F7F means any sub-page, never one (the engine's limits::LAST_SUBPAGE_CODE). */
export const LAST_SUBPAGE_CODE = 0x3f7e;
/** A nibble is four bits (EN 300 706 clause 9.6). */
const FOUR_BITS = 0x0f;

/** Rows: exact base64 of 40 seven-bit character codes each (the server's check_subpage; EN 300 706 clause 8.2). */
function rowsFault(path: string, rows: readonly (string | null)[]): Fault | null {
  return firstOf(rows, (row, index) => {
    if (row === null) {
      return null;
    }
    const at = `${path}.rows[${index}]`;
    const bytes = base64Bytes(at, row, COLUMNS);
    if (isFault(bytes)) {
      return bytes;
    }
    if (bytes.length !== COLUMNS) {
      return { path: at, rule: "wrong_length", detail: `${bytes.length} bytes, a row is ${COLUMNS}` };
    }
    const column = bytes.findIndex((code) => code > CODE_MASK);
    return column === -1 ? null : { path: at, rule: "out_of_range", detail: `column ${column}: a character code is seven bits` };
  });
}

/** What a target is, said when one is refused. */
function targetForms(longest: number): string {
  return `a target is mpp, mpp:ssss, name:mpp, name:mpp:ssss, an http or https address, or web: and one; printable ASCII without spaces or commas, at most ${longest} bytes`;
}

/** A target's kind, or null for one in no form of Appendix E.1 or longer than `start`'s link_target_bytes (the server's check.rs `target`). */
function kindOf(target: string, longest: number): ReturnType<typeof targetKind> {
  return target.length > longest ? null : targetKind(target);
}

/** The Link Extension's links: each key once, each target in a form of Appendix E.1, labels within their target's bound, no page number to the web, text links within their row (the server's check_link_extension). */
function linksFault(path: string, links: LinkExtension, longest: number): Fault | null {
  return (
    firstOf(links.keys, (link, index) => {
      const at = `${path}.keys[${index}]`;
      if (links.keys.slice(0, index).some((earlier) => earlier.key === link.key)) {
        return { path: `${at}.key`, rule: "duplicate", detail: `${link.key} twice` };
      }
      const kind = kindOf(link.target, longest);
      if (kind === null) {
        return { path: `${at}.target`, rule: "wrong_type", detail: targetForms(longest) };
      }
      if (!given(link.label)) {
        return null;
      }
      if (link.key === "index") {
        return { path: `${at}.label`, rule: "not_listed", detail: "the Index key has no label" };
      }
      return boundedTextFault(`${at}.label`, link.label, longestLabel(kind));
    }) ??
    firstOf(links.numbers, (link, index) => {
      const at = `${path}.numbers[${index}].target`;
      const kind = kindOf(link.target, longest);
      if (kind === null) {
        return { path: at, rule: "wrong_type", detail: targetForms(longest) };
      }
      return kind === "web" ? { path: at, rule: "not_listed", detail: "a page number never leads to web:" } : null;
    }) ??
    firstOf(links.texts, (link, index) => {
      const at = `${path}.texts[${index}]`;
      if (link.column + link.length > COLUMNS) {
        return {
          path: `${at}.length`,
          rule: "out_of_range",
          detail: `column ${link.column} and ${link.length} characters: the run stays within ${COLUMNS} columns`,
        };
      }
      return kindOf(link.target, longest) === null ? { path: `${at}.target`, rule: "wrong_type", detail: targetForms(longest) } : null;
    })
  );
}

/** Each X/26's designation code once (clause 12.3). */
function enhancementsFault(path: string, page: Page): Fault | null {
  return firstOf(page.enhancements, (packet, index) =>
    page.enhancements.slice(0, index).some((earlier) => earlier.designation === packet.designation)
      ? { path: `${path}.enhancements[${index}].designation`, rule: "duplicate", detail: `designation code ${packet.designation} twice` }
      : null,
  );
}

/** X/27's nibbles are four bits each (clause 9.6). */
function packedFault(path: string, packets: readonly PackedLine[]): Fault | null {
  return firstOf(packets, (line, index) => {
    if (line.packet !== "x27_nibbles") {
      return null;
    }
    const place = line.nibbles.findIndex((nibble) => nibble > FOUR_BITS);
    return place === -1 ? null : { path: `${path}.packets[${index}].nibbles[${place}]`, rule: "out_of_range", detail: "four bits" };
  });
}

/** A page names its language or its character set, never both, and each run's text is text (REQ-2214 items 2 and 4; the server's check_text_runs). */
function textRunsFault(path: string, page: Page): Fault | null {
  if (given(page.language) && given(page.character_set)) {
    return { path: `${path}.character_set`, rule: "language_and_character_set", detail: "a page names its language or its character set, never both" };
  }
  return firstOf(page.text ?? [], (run, index) => textFault(`${path}.text[${index}].text`, run.text));
}

/** A sub-page, in the order of the server's check_page and check_subpage. */
export function pageFault(path: string, page: Page, limits: Limits): Fault | null {
  if (isReserved(Number.parseInt(page.page, HEX))) {
    return { path: `${path}.page`, rule: "reserved", detail: `${page.page} is reserved by the standard (EN 300 706 Annex A.10)` };
  }
  if (Number.parseInt(page.sub, HEX) > LAST_SUBPAGE_CODE) {
    return { path: `${path}.sub`, rule: "out_of_range", detail: `${page.sub}: 3F7F means any sub-page, never one` };
  }
  return (
    rowsFault(path, page.rows) ??
    linksFault(`${path}.link_extension`, page.link_extension, limits.standard.linkTargetBytes) ??
    enhancementsFault(path, page) ??
    packedFault(path, page.packets) ??
    textRunsFault(path, page)
  );
}

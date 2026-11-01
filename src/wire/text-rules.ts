// The rules of the server's text that its schema cannot state, checked
// over a message the schema has passed (the server's
// crates/teletext-runtime/src/protocol/check.rs, REQ-1475 item 6): no
// control and no bidirectional formatting character, Unicode normalisation
// form C, a cookie's fields and an author's log line bounded in bytes, and
// a cookie's name not the server's; and a redirect's one form.
// Each field is checked in the order the server checks it, and a fault is
// named at the path the server names it.

import type { Fault } from "./fault.ts";
import type { ProgramMessage, WireMagazine, WirePage, WireSubPageEntry } from "./protocol.ts";

/** A cookie's name, value and path: at most 4,096 bytes each (RFC 6265 section 6.1; the server's COOKIE_BYTES). */
const COOKIE_BYTES = 4096;
/** An author's log line: at most 200 bytes of UTF-8 (the engine's log::MAX_LOG_TEXT_BYTES, `start`'s `author_log_bytes`). */
const AUTHOR_LOG_BYTES = 200;

/** The C0 controls end below the space; DEL and the C1 controls are one run (the engine's policy::is_safe_output_char). */
const C0_END = 0x20;
const DEL = 0x7f;
const C1_LAST = 0x9f;
/** The bidirectional formatting characters: ALM, LRM, RLM, LRE to RLO, LRI to PDI (Unicode Standard Annex 9; the engine's policy::is_safe_output_char). */
const BIDIRECTIONAL: readonly (readonly [number, number])[] = [
  [0x061c, 0x061c],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
/** A code point in a detail as the server writes it: U+ and at least four hexadecimal digits. */
const CODE_POINT_DIGITS = 4;
const HEX = 16;

/** Whether a code point is never in text: a control (C0, DEL, C1) or a bidirectional formatting character. */
function isForbidden(point: number): boolean {
  return point < C0_END || (point >= DEL && point <= C1_LAST) || BIDIRECTIONAL.some(([first, last]) => point >= first && point <= last);
}

/** Text's characters and form (the server's check_text after its length, and check_nfc). */
function textFault(path: string, text: string): Fault | null {
  let place = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    if (isForbidden(point)) {
      return { path, rule: "forbidden_character", detail: `U+${point.toString(HEX).toUpperCase().padStart(CODE_POINT_DIGITS, "0")} at character ${place}` };
    }
    place += 1;
  }
  return text.normalize("NFC") === text ? null : { path, rule: "not_nfc", detail: "not in Unicode normalisation form C" };
}

/** Text of at most `most` bytes of UTF-8. */
function bytesFault(path: string, text: string, most: number): Fault | null {
  const bytes = Buffer.byteLength(text);
  return bytes > most ? { path, rule: "too_long", detail: `${bytes} bytes, at most ${most}` } : null;
}

/** A cookie's field: its characters and form, then its bytes (the server's check_cookie). */
function cookieFault(path: string, text: string): Fault | null {
  return textFault(path, text) ?? bytesFault(path, text, COOKIE_BYTES);
}

/** The first character of a cookie name the server keeps for its own (the server's check_cookie). */
const SERVER_COOKIE_PREFIX = "_";

/** The first fault of `items`, each checked by `check` at its index. */
function firstOf<T>(items: readonly T[], check: (item: T, index: number) => Fault | null): Fault | null {
  for (const [index, item] of items.entries()) {
    const fault = check(item, index);
    if (fault !== null) {
      return fault;
    }
  }
  return null;
}

function magazinesFault(path: string, magazines: readonly WireMagazine[]): Fault | null {
  return firstOf(magazines, (magazine, index) => {
    const at = `${path}[${index}]`;
    return (
      textFault(`${at}.name`, magazine.name) ??
      firstOf(magazine.pages, (entry, place) => {
        const page = `${at}.pages[${place}]`;
        return (
          textFault(`${page}.title`, entry.title) ??
          (entry.section === undefined || entry.section === null ? null : textFault(`${page}.section`, entry.section))
        );
      })
    );
  });
}

function pageFault(path: string, page: WirePage): Fault | null {
  return firstOf(page.link_extension.keys, (link, index) =>
    link.label === undefined || link.label === null ? null : textFault(`${path}.link_extension.keys[${index}].label`, link.label),
  );
}

/** A description's title, text and sub-page, those it gives. */
function descriptionFault(message: Extract<ProgramMessage, { type: "description" }>): Fault | null {
  const { title, text, content } = message;
  return (
    (title === undefined || title === null ? null : textFault("title", title)) ??
    (text === undefined || text === null ? null : textFault("text", text)) ??
    (content === undefined || content === null ? null : pageFault("content", content))
  );
}

function subpagesFault(subpages: readonly WireSubPageEntry[]): Fault | null {
  return firstOf(subpages, (entry, index) => (entry.title === undefined || entry.title === null ? null : textFault(`subpages[${index}].title`, entry.title)));
}

/** The characters of an address in a redirect: printable ASCII with no space (the engine's records::redirect). */
const ADDRESS_FIRST = 0x21;
const ADDRESS_LAST = 0x7e;
const REDIRECT_FORMS = "a redirect names a page and its sub-code, or an address";

/** Whether an optional field was given. */
function named(field: unknown): boolean {
  return field !== undefined && field !== null;
}

/** A redirect names a page and its sub-code, or an address, in the order the server's check_redirect asks. */
function redirectFault(message: Extract<ProgramMessage, { type: "redirect" }>): Fault | null {
  if (!named(message.address)) {
    if (!named(message.page)) {
      return { path: "page", rule: "missing_field", detail: REDIRECT_FORMS };
    }
    return named(message.sub) ? null : { path: "sub", rule: "missing_field", detail: REDIRECT_FORMS };
  }
  for (const path of ["page", "sub"] as const) {
    if (named(message[path])) {
      return { path, rule: "unknown_field", detail: "a redirect names a page or an address, never both" };
    }
  }
  const address = Buffer.from(message.address ?? "");
  const printable = address.length > 0 && address.every((byte) => byte >= ADDRESS_FIRST && byte <= ADDRESS_LAST);
  return printable ? null : { path: "address", rule: "forbidden_character", detail: "an address is printable ASCII with no space" };
}

/** The engine's log::check first, its bytes then its characters, then the form (the server's check_author_log). */
function authorLogFault(text: string): Fault | null {
  return bytesFault("text", text, AUTHOR_LOG_BYTES) ?? textFault("text", text);
}

/** A cookie's fields, in the order the server's check_cookie asks. */
function cookieMessageFault(message: Extract<ProgramMessage, { type: "cookie" }>): Fault | null {
  return (
    cookieFault("name", message.name) ??
    (message.name.startsWith(SERVER_COOKIE_PREFIX) ? { path: "name", rule: "reserved", detail: "names starting _ are the server's" } : null) ??
    cookieFault("value", message.value) ??
    (message.path === undefined || message.path === null ? null : cookieFault("path", message.path))
  );
}

/** The first fault of a message's text, which the schema has passed; null when it has none. */
export function checkText(message: ProgramMessage): Fault | null {
  let fault: Fault | null;
  switch (message.type) {
    case "reply": {
      fault =
        magazinesFault("magazines", message.magazines) ??
        (message.selected === undefined || message.selected === null ? null : pageFault("selected", message.selected));
      break;
    }
    case "page": {
      fault = pageFault("page", message.page);
      break;
    }
    case "subpages": {
      fault = subpagesFault(message.subpages);
      break;
    }
    case "index": {
      fault = magazinesFault("magazines", message.magazines);
      break;
    }
    case "cookie": {
      fault = cookieMessageFault(message);
      break;
    }
    case "author_log": {
      fault = authorLogFault(message.text);
      break;
    }
    case "log": {
      fault = textFault("text", message.text);
      break;
    }
    case "redirect": {
      fault = redirectFault(message);
      break;
    }
    case "description": {
      fault = descriptionFault(message);
      break;
    }
    case "sound":
    case "packets":
    case "denied": {
      fault = null;
      break;
    }
  }
  return fault;
}

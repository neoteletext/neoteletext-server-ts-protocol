// The server's rules beyond its schema for the messages a program sends one
// connection or the browsers' consoles: a cookie, a redirect and an
// author's log line (the server's check_cookie, check_redirect and
// check_author_log, crates/teletext-runtime/src/protocol/check.rs at
// neoteletext-app-server e6d95f7).

import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import type { ProgramMessage } from "./protocol.ts";
import { bytesFault, given, textFault } from "./rule-pieces.ts";

/** A cookie's name, value and path: at most 4,096 bytes each (RFC 6265 section 6.1; the server's COOKIE_BYTES). */
const COOKIE_BYTES = 4096;
/** The first character of a cookie name the server keeps for its own (the server's check_cookie). */
const SERVER_COOKIE_PREFIX = "_";

/** A cookie's field: its characters and form, then its bytes. */
function cookieFieldFault(path: string, text: string): Fault | null {
  return textFault(path, text) ?? bytesFault(path, text, COOKIE_BYTES);
}

/** A cookie's fields, in the order the server's check_cookie asks. */
export function cookieFault(message: Extract<ProgramMessage, { type: "cookie" }>): Fault | null {
  return (
    cookieFieldFault("name", message.name) ??
    (message.name.startsWith(SERVER_COOKIE_PREFIX) ? { path: "name", rule: "reserved", detail: "names starting _ are the server's" } : null) ??
    cookieFieldFault("value", message.value) ??
    (given(message.path) ? cookieFieldFault("path", message.path) : null)
  );
}

/** The engine's log::check first, its bytes then its characters, then the form (the server's check_author_log). */
export function authorLogFault(text: string, limits: Limits): Fault | null {
  return bytesFault("text", text, limits.budgets.authorLogBytes) ?? textFault("text", text);
}

/** A redirect names a page and its sub-code, or an address, in the order the server's check_redirect asks. */
const REDIRECT_FORMS = "a redirect names a page and its sub-code, or an address";
/** The characters of an address in a redirect: printable ASCII with no space (the engine's records::redirect). */
const ADDRESS_FIRST = 0x21;
const ADDRESS_LAST = 0x7e;

export function redirectFault(message: Extract<ProgramMessage, { type: "redirect" }>): Fault | null {
  if (given(message.address) && given(message.query)) {
    return { path: "query", rule: "unknown_field", detail: "a query goes with a page: an address holds its own" };
  }
  if (!given(message.address)) {
    if (!given(message.page)) {
      return { path: "page", rule: "missing_field", detail: REDIRECT_FORMS };
    }
    return given(message.sub) ? null : { path: "sub", rule: "missing_field", detail: REDIRECT_FORMS };
  }
  for (const path of ["page", "sub"] as const) {
    if (given(message[path])) {
      return { path, rule: "unknown_field", detail: "a redirect names a page or an address, never both" };
    }
  }
  const address = Buffer.from(message.address);
  const printable = address.length > 0 && address.every((byte) => byte >= ADDRESS_FIRST && byte <= ADDRESS_LAST);
  return printable ? null : { path: "address", rule: "forbidden_character", detail: "an address is printable ASCII with no space" };
}

// The pieces of the server's rules that every message's check uses: text's
// characters and form, bounds in characters and bytes, base64's exactness
// (the server's crates/teletext-runtime/src/protocol/check.rs at
// neoteletext-app-server e6d95f7: check_text, check_nfc, check_base64).

import type { Fault } from "./fault.ts";

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
/** Numbers in a detail as the server writes them: a code point as U+ and at least four hexadecimal digits, a page in three, a sub-code in four. */
export const HEX = 16;
export const CODE_POINT_DIGITS = 4;
export const PAGE_DIGITS = 3;
/** Base64 writes 4 characters for each 3 bytes (RFC 4648 section 4). */
const BASE64_GROUP_BYTES = 3;
const BASE64_GROUP_CHARACTERS = 4;
const BASE64_ALPHABET = /^[A-Za-z0-9+/=]*$/u;

/** Whether a code point is never in text: a control (C0, DEL, C1) or a bidirectional formatting character. */
function isForbidden(point: number): boolean {
  return point < C0_END || (point >= DEL && point <= C1_LAST) || BIDIRECTIONAL.some(([first, last]) => point >= first && point <= last);
}

export function hex(value: number, digits: number): string {
  return value.toString(HEX).toUpperCase().padStart(digits, "0");
}

/** Text's characters and form (the server's check_text after its length, and check_nfc). */
export function textFault(path: string, text: string): Fault | null {
  let place = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    if (isForbidden(point)) {
      return { path, rule: "forbidden_character", detail: `U+${hex(point, CODE_POINT_DIGITS)} at character ${place}` };
    }
    place += 1;
  }
  return text.normalize("NFC") === text ? null : { path, rule: "not_nfc", detail: "not in Unicode normalisation form C" };
}

/** Text of at most `most` characters, then its characters and form (the server's check_text). */
export function boundedTextFault(path: string, text: string, most: number): Fault | null {
  const count = Array.from(text).length;
  return count > most ? { path, rule: "too_long", detail: `${count} characters, at most ${most}` } : textFault(path, text);
}

/** Text of at most `most` bytes of UTF-8. */
export function bytesFault(path: string, text: string, most: number): Fault | null {
  const bytes = Buffer.byteLength(text);
  return bytes > most ? { path, rule: "too_long", detail: `${bytes} bytes, at most ${most}` } : null;
}

/** The first fault of `items`, each checked by `check` at its index. */
export function firstOf<T>(items: readonly T[], check: (item: T, index: number) => Fault | null): Fault | null {
  for (const [index, item] of items.entries()) {
    const fault = check(item, index);
    if (fault !== null) {
      return fault;
    }
  }
  return null;
}

/** Whether an optional field was given. */
export function given<T>(field: T | null | undefined): field is T {
  return field !== undefined && field !== null;
}

/** Whether a check of bytes found a fault rather than the bytes. */
export function isFault(found: Buffer | Fault): found is Fault {
  return !Buffer.isBuffer(found);
}

/** Exact base64's bytes: its alphabet, then its decoded length within `most`, then canonical, the text its bytes encode to (the server's check_base64; RFC 4648 section 4). */
export function base64Bytes(path: string, text: string, most: number): Buffer | Fault {
  if (!BASE64_ALPHABET.test(text)) {
    return { path, rule: "not_base64", detail: "a character outside base64's alphabet (RFC 4648 section 4)" };
  }
  if (text.length > Math.ceil(most / BASE64_GROUP_BYTES) * BASE64_GROUP_CHARACTERS) {
    return { path, rule: "too_long", detail: `over ${most} bytes once decoded` };
  }
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64") === text ? bytes : { path, rule: "not_base64", detail: "not the canonical base64 of its bytes" };
}

/** Whole things of `size` bytes, at least one, in exact base64 within `most` bytes. */
export function wholeFault(path: string, text: string, most: number, size: number, what: string): Buffer | Fault {
  const bytes = base64Bytes(path, text, most);
  if (isFault(bytes)) {
    return bytes;
  }
  return bytes.length === 0 || bytes.length % size !== 0 ? { path, rule: "wrong_length", detail: `${bytes.length} bytes: whole ${what} of ${size}` } : bytes;
}

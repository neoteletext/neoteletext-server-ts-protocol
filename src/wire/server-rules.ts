// The server's rules that its schema cannot state, checked over a message
// the schema has passed: a port of the server's
// crates/teletext-runtime/src/protocol/check.rs at neoteletext-app-server
// e6d95f7 (REQ-1475, REQ-1477, REQ-1478, REQ-1479; DEC-1482 item 7). Text
// has no control and no bidirectional formatting character and is in
// Unicode normalisation form C; base64 is exact and decodes to whole rows,
// samples and packets; orders, duplicates, reserved pages and the forms of
// link targets are the server's; and every bound `start` gives is taken
// from the limits it gave, so the kit holds none of its own (REQ-1033).
// Each field is checked in the order the server checks it, and a fault is
// named at the path the server names it, with its rule.

import { authorLogFault, cookieFault, redirectFault } from "./connection-rules.ts";
import type { Fault } from "./fault.ts";
import type { Limits } from "./limits.ts";
import { LAST_SUBPAGE_CODE, pageFault } from "./page-rules.ts";
import type { ProgramMessage, WireConnections, WireMagazine, WireSound, WireSubPageEntry } from "./protocol.ts";
import { CODE_POINT_DIGITS, HEX, PAGE_DIGITS, base64Bytes, boundedTextFault, firstOf, given, hex, isFault, textFault } from "./rule-pieces.ts";
import { PACKET_BYTES, isValidStreamPacket } from "./stream-packets.ts";
import { isReserved } from "../page/page-numbers.ts";
import { opusRefusal } from "../sound/opus-packet.ts";
import { MOST_SAMPLES, OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES, SAMPLE_BYTES } from "../sound/profile.ts";

/** A page number's magazine: its first hexadecimal digit (EN 300 706 clause 7.1.2). */
const MAGAZINE_SHIFT = 8;
/** The first magazine, which alone reserves 1BE and 1F0 too (Annex A.10). */
const FIRST_MAGAZINE = 1;
/** The most bytes of raw packets one message may carry: a megabyte (the server's MOST_RAW_BYTES). */
const MOST_RAW_BYTES = 1024 * 1024;
/** The most bytes of samples and of Opus packets one sound may carry: two minutes of either (the server's MOST_PCM_BYTES and MOST_OPUS_BYTES). */
const MOST_PCM_BYTES = MOST_SAMPLES * SAMPLE_BYTES;
const MOST_OPUS_BYTES = (MOST_SAMPLES / OPUS_FRAME_SAMPLES) * OPUS_PACKET_BYTES;

/** A message naming a selection's number names exactly one connection (the server's check_answer; DEC-1759 lesson 13). */
function answerFault(connections: WireConnections, request: number | null | undefined): Fault | null {
  if (!given(request) || (connections !== "all" && connections.length === 1)) {
    return null;
  }
  return { path: "connections", rule: "one_connection", detail: "a selection's number names one connection" };
}

/** The pages a magazine may have, as `start` says: magazine 1 reserves 1BE and 1F0 too (Annex A.10). */
function mostPages(magazine: number, limits: Limits): number {
  return magazine === FIRST_MAGAZINE ? limits.standard.pagesInMagazine1 : limits.standard.pagesPerMagazine;
}

/** A page of the index, in its magazine (the server's check_magazines). */
function entryFault(at: string, entry: WireMagazine["pages"][number], magazine: number, before: number, limits: Limits): Fault | null {
  const page = Number.parseInt(entry.page, HEX);
  if (page >> MAGAZINE_SHIFT !== magazine) {
    return { path: `${at}.page`, rule: "wrong_magazine", detail: `${entry.page} is not in magazine ${magazine}` };
  }
  if (isReserved(page)) {
    return { path: `${at}.page`, rule: "reserved", detail: `${entry.page} is reserved by the standard (EN 300 706 Annex A.10)` };
  }
  if (page <= before) {
    return { path: `${at}.page`, rule: page === before ? "duplicate" : "not_ascending", detail: `${entry.page} after ${hex(before, PAGE_DIGITS)}` };
  }
  const most = limits.budgets.titleCharacters;
  return (
    boundedTextFault(`${at}.title`, entry.title, most) ??
    (given(entry.section) ? boundedTextFault(`${at}.section`, entry.section, most) : null) ??
    (entry.subpages > limits.standard.subpages
      ? { path: `${at}.subpages`, rule: "out_of_range", detail: `${entry.subpages}, 1 to ${limits.standard.subpages}` }
      : null)
  );
}

/** The magazines of an index: ascending, each with its pages ascending, in it and not reserved (the server's check_magazines). */
function magazinesFault(path: string, magazines: readonly WireMagazine[], limits: Limits): Fault | null {
  let lastMagazine = 0;
  return firstOf(magazines, (magazine, index) => {
    const at = `${path}[${index}]`;
    const number = magazine.magazine;
    if (number <= lastMagazine) {
      return { path: `${at}.magazine`, rule: number === lastMagazine ? "duplicate" : "not_ascending", detail: `${number} after ${lastMagazine}` };
    }
    lastMagazine = number;
    const named = boundedTextFault(`${at}.name`, magazine.name, limits.budgets.titleCharacters);
    if (named !== null) {
      return named;
    }
    const most = mostPages(number, limits);
    if (magazine.pages.length > most) {
      return { path: `${at}.pages`, rule: "too_long", detail: `${magazine.pages.length} pages, at most ${most}` };
    }
    let lastPage = 0;
    return firstOf(magazine.pages, (entry, place) => {
      const fault = entryFault(`${at}.pages[${place}]`, entry, number, lastPage, limits);
      lastPage = Number.parseInt(entry.page, HEX);
      return fault;
    });
  });
}
/** A page's sub-page list: not of a reserved page, at most `start`'s sub-pages, each sub-code a sub-page's, ascending (the server's check_subpages). */
function subpagesFault(message: Extract<ProgramMessage, { type: "subpages" }>, limits: Limits): Fault | null {
  if (isReserved(Number.parseInt(message.page, HEX))) {
    return { path: "page", rule: "reserved", detail: `${message.page} is reserved by the standard (EN 300 706 Annex A.10)` };
  }
  const most = limits.standard.subpages;
  if (message.subpages.length > most) {
    return { path: "subpages", rule: "out_of_range", detail: `${message.subpages.length} sub-pages, 1 to ${most}` };
  }
  let before = -1;
  return firstOf(message.subpages, (entry: WireSubPageEntry, index) => {
    const at = `subpages[${index}]`;
    const sub = Number.parseInt(entry.sub, HEX);
    if (sub > LAST_SUBPAGE_CODE) {
      return { path: `${at}.sub`, rule: "out_of_range", detail: `${entry.sub}: 3F7F means any sub-page, never one` };
    }
    if (sub <= before) {
      return sub === before
        ? { path: `${at}.sub`, rule: "duplicate", detail: `${entry.sub} twice` }
        : { path: `${at}.sub`, rule: "not_ascending", detail: `${entry.sub} after ${hex(before, CODE_POINT_DIGITS)}` };
    }
    before = sub;
    return given(entry.title) ? textFault(`${at}.title`, entry.title) : null;
  });
}

/** A reply's index, then its sub-page, which is of a page of the index (the server's check_reply). */
function replyFault(message: Extract<ProgramMessage, { type: "reply" }>, limits: Limits): Fault | null {
  const index = magazinesFault("magazines", message.magazines, limits);
  if (index !== null || !given(message.selected)) {
    return index;
  }
  const selected = message.selected;
  const listed = message.magazines.some((magazine) => magazine.pages.some((entry) => entry.page === selected.page));
  return (
    pageFault("selected", selected, limits) ?? (listed ? null : { path: "selected.page", rule: "not_in_index", detail: `${selected.page} is not in magazines` })
  );
}

/** A public page gives its title, text and sub-page, the sub-page of the page named; a page that is not public gives nothing (REQ-1728 items 3 and 6; the server's check_description). */
function descriptionFault(message: Extract<ProgramMessage, { type: "description" }>, limits: Limits): Fault | null {
  const { title, text, content } = message;
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

/** Whole things of `size` bytes, at least one, in exact base64 within `most` bytes. */
function wholeFault(path: string, text: string, most: number, size: number, what: string): Buffer | Fault {
  const bytes = base64Bytes(path, text, most);
  if (isFault(bytes)) {
    return bytes;
  }
  return bytes.length === 0 || bytes.length % size !== 0 ? { path, rule: "wrong_length", detail: `${bytes.length} bytes: whole ${what} of ${size}` } : bytes;
}

/** Every packet is the profile's, as the engine's decoder judges it before decoding (the server's Sounds::check_opus, which names no path). */
function profileFault(bytes: Buffer, packetBytes: number): Fault | null {
  for (let index = 0; index * packetBytes < bytes.length; index += 1) {
    const refusal = opusRefusal(bytes.subarray(index * packetBytes, (index + 1) * packetBytes));
    if (refusal !== null) {
      return { path: "", rule: "outside_profile", detail: `packet ${index} is outside the Opus profile: ${refusal}` };
    }
  }
  return null;
}

/** A sound's samples or packets: exact base64 of whole 16-bit samples or whole packets of `packet_bytes` (the server's check_sound). */
function soundFault(sound: WireSound): Fault | null {
  if (sound.kind === "opus" || sound.kind === "opus_packets") {
    const bytes = wholeFault("packets", sound.packets, MOST_OPUS_BYTES, sound.packet_bytes, "packets");
    return isFault(bytes) ? bytes : profileFault(bytes, sound.packet_bytes);
  }
  if (sound.kind === "object" || sound.kind === "blocks") {
    const bytes = base64Bytes("pcm", sound.pcm, MOST_PCM_BYTES);
    if (isFault(bytes)) {
      return bytes;
    }
    return bytes.length % SAMPLE_BYTES === 0 ? null : { path: "pcm", rule: "wrong_length", detail: "16-bit samples: an even number of bytes" };
  }
  return null;
}

/** Raw packets: exact base64 of whole 42-byte packets, each one a stream may carry (the server's check_packets; REQ-1462). */
function packetsFault(text: string): Fault | null {
  const bytes = wholeFault("packets", text, MOST_RAW_BYTES, PACKET_BYTES, "packets");
  if (isFault(bytes)) {
    return bytes;
  }
  for (let index = 0; index * PACKET_BYTES < bytes.length; index += 1) {
    if (!isValidStreamPacket(bytes.subarray(index * PACKET_BYTES, (index + 1) * PACKET_BYTES))) {
      return { path: `packets[${index}]`, rule: "invalid_packet", detail: "its address does not decode, or it is a kind the stream may not carry" };
    }
  }
  return null;
}

/** A sound's or raw packets' bytes; a denial has none. */
function bytesMessageFault(message: Extract<ProgramMessage, { type: "sound" | "packets" | "denied" }>): Fault | null {
  if (message.type === "sound") {
    return soundFault(message);
  }
  return message.type === "packets" ? packetsFault(message.packets) : null;
}

/** The first fault of a message the schema has passed, by the server's rules and `start`'s limits; null when it has none. */
export function checkRules(message: ProgramMessage, limits: Limits): Fault | null {
  let fault: Fault | null;
  switch (message.type) {
    case "reply": {
      fault = replyFault(message, limits);
      break;
    }
    case "page":
    case "measure": {
      fault = (message.type === "page" ? answerFault(message.connections, message.request) : null) ?? pageFault("page", message.page, limits);
      break;
    }
    case "subpages": {
      fault = answerFault(message.connections, message.request) ?? subpagesFault(message, limits);
      break;
    }
    case "index": {
      fault = magazinesFault("magazines", message.magazines, limits);
      break;
    }
    case "cookie": {
      fault = cookieFault(message);
      break;
    }
    case "author_log": {
      fault = authorLogFault(message.text, limits);
      break;
    }
    case "log": {
      fault = boundedTextFault("text", message.text, limits.budgets.logCharacters);
      break;
    }
    case "redirect": {
      fault = redirectFault(message);
      break;
    }
    case "description": {
      fault = descriptionFault(message, limits);
      break;
    }
    case "sound":
    case "packets":
    case "denied": {
      fault = bytesMessageFault(message);
      break;
    }
  }
  return fault;
}

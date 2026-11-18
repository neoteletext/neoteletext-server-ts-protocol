// The server's rules beyond its schema, which the kit holds a program's
// messages to before they are written (REQ-1479, REQ-1475; TODO-1550, the
// server's crates/teletext-runtime/src/protocol/check.rs at
// neoteletext-app-server e6d95f7): each bound accepted, and one past it
// refused with the server's path and rule. Each refusal here was written by
// the kit before this module, and the server refused it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { blankContent, checkProgram, type Limits } from "../src/index.ts";
import type { KeyLink, NumberLink, Page, TextLink, Triplet } from "../src/protocol.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";

const PAGE: Page = { page: "100", sub: "0000", ...blankContent() };
/** Hamming 8/4 of 0 to 15 (EN 300 706 clause 8.2, Table 3). */
const HAMMING = [0x15, 0x02, 0x49, 0x5e, 0x64, 0x73, 0x38, 0x2f, 0xd0, 0xc7, 0x8c, 0x9b, 0xa1, 0xb6, 0xfd, 0xea];
/** A TOC byte of the Opus profile: configuration 15, hybrid fullband 20 ms, one mono frame (RFC 6716 section 3.1). */
const PROFILE_TOC = 15 << 3;
const TRIPLETS: Triplet[] = Array.from({ length: 13 }, () => ({ address: 0, mode: 0, data: 0 }));

/** `fault` is null, or the path and rule of the fault found. */
function expectRefused(message: unknown, path: string, rule: string, limits: Limits = SERVER_LIMITS): void {
  const fault = checkProgram(message, limits);
  assert.deepEqual(fault === null ? null : { path: fault.path, rule: fault.rule }, { path, rule }, JSON.stringify(message).slice(0, 300));
}

function expectAccepted(message: unknown, limits: Limits = SERVER_LIMITS): void {
  assert.equal(checkProgram(message, limits), null, JSON.stringify(message).slice(0, 300));
}

/** A page message with `page`'s fields, as its line carries them: rows as base64. */
function pageMessage(page: Readonly<Record<string, unknown>>): unknown {
  return { type: "page", connections: [1], page: { ...PAGE, ...page } };
}

function links(keys: KeyLink[], numbers: NumberLink[] = [], texts: TextLink[] = []): unknown {
  return pageMessage({ link_extension: { keys, numbers, texts } });
}

/** A packet as a stream carries it: magazine and packet number in Hamming 8/4, then 40 spaces (clause 7.1.2). */
function packet(magazine: number, number: number): number[] {
  const first = (magazine % 8) | ((number & 1) << 3);
  return [HAMMING[first] ?? 0, HAMMING[number >> 1] ?? 0, ...Array.from({ length: 40 }, () => 0x20)];
}

function packets(bytes: number[]): unknown {
  return { type: "packets", connections: [1], packets: Buffer.from(bytes).toString("base64") };
}

function index(magazines: unknown[]): unknown {
  return { type: "index", connections: "all", magazines };
}

function entry(page: number): unknown {
  return { page: page.toString(16).toUpperCase(), title: "", subpages: 1 };
}

/** `count` pages of `magazine`, ascending from its 00, passing over those the standard reserves. */
function pagesOf(magazine: number, count: number): unknown[] {
  const reserved = new Set([0x1be, 0x1f0]);
  const pages: unknown[] = [];
  for (let page = magazine * 0x100; pages.length < count; page += 1) {
    if (!reserved.has(page) && (page & 0xff) < 0xfd) {
      pages.push(entry(page));
    }
  }
  return pages;
}

/** X/27/1's thirty-nine nibbles, the last `last`. */
const nibblesEndingIn = (last: number): number[] => [...Array.from({ length: 38 }, () => 0), last];

/** An X/26 of designation code `designation`. */
const enhancementOf = (designation: number): unknown => ({ designation, triplets: TRIPLETS });

/** A sub-page list of page 100 with `subs`. */
const subpageList = (subs: string[]): unknown => ({ type: "subpages", connections: [1], page: "100", version: 0, subpages: subs.map((sub) => ({ sub })) });

/** A page whose row 0 is `bytes` in base64. */
const rowOf = (bytes: number[]): unknown => pageMessage({ rows: [Buffer.from(bytes).toString("base64"), ...Array.from({ length: 24 }, () => null)] });

/** A page whose row 0 is `text`. */
const rawRow = (text: string): unknown => pageMessage({ rows: [text, ...Array.from({ length: 24 }, () => null)] });

/** A stored sound of `bytes` bytes of samples. */
const pcmSound = (bytes: number): unknown => ({
  type: "sound",
  connections: [1],
  kind: "object",
  handle: 0,
  generation: 0,
  rate: 8000,
  pcm: Buffer.alloc(bytes).toString("base64"),
});

/** A stored Opus sound of `bytes` bytes of 40-byte packets. */
const opusSound = (bytes: number): unknown => ({
  type: "sound",
  connections: [1],
  kind: "opus",
  handle: 0,
  generation: 0,
  packet_bytes: 40,
  samples: 960,
  packets: Buffer.alloc(bytes, PROFILE_TOC).toString("base64"),
});

test("TODO-1550 item 1: a link target is one of Appendix E.1's forms, as the engine reads it", () => {
  for (const target of ["101", "1a0:0002", "bbc-news:101", "bbc:101:3F7E", "https://example.com/a?b=c", "HTTP://EXAMPLE.COM", "web:https://example.com"]) {
    expectAccepted(links([{ key: "red", target }]));
  }
  for (const target of [
    "zzz",
    "901",
    "10",
    "1000",
    "101:12345",
    "a:b:c:d",
    "web:ftp://example.com",
    "ftp://example.com",
    "bad_name:101",
    `${"n".repeat(33)}:101`,
  ]) {
    expectRefused(links([{ key: "red", target }]), "page.link_extension.keys[0].target", "wrong_type");
    expectRefused(links([], [{ number: "200", target }]), "page.link_extension.numbers[0].target", "wrong_type");
    expectRefused(links([], [], [{ row: 1, column: 0, length: 1, target }]), "page.link_extension.texts[0].target", "wrong_type");
  }
  expectRefused(links([], [{ number: "200", target: "web:https://example.com" }]), "page.link_extension.numbers[0].target", "not_listed");
  expectAccepted(links([], [{ number: "200", target: "https://example.com" }]));
});

test("TODO-1550 item 2: a key's label is 9 characters for this service, 8 elsewhere; the Index key has none, and a key is linked once", () => {
  expectAccepted(links([{ key: "red", target: "101", label: "123456789" }]));
  expectAccepted(links([{ key: "red", target: "bbc:101", label: "12345678" }]));
  expectRefused(links([{ key: "red", target: "bbc:101", label: "123456789" }]), "page.link_extension.keys[0].label", "too_long");
  expectRefused(links([{ key: "red", target: "web:https://example.com", label: "123456789" }]), "page.link_extension.keys[0].label", "too_long");
  expectRefused(links([{ key: "index", target: "100", label: "Index" }]), "page.link_extension.keys[0].label", "not_listed");
  expectRefused(
    links([
      { key: "red", target: "101" },
      { key: "red", target: "102" },
    ]),
    "page.link_extension.keys[1].key",
    "duplicate",
  );
});

test("TODO-1550 item 3: a text link stays within its row's 40 columns", () => {
  expectAccepted(links([], [], [{ row: 1, column: 35, length: 5, target: "101" }]));
  expectRefused(links([], [], [{ row: 1, column: 35, length: 6, target: "101" }]), "page.link_extension.texts[0].length", "out_of_range");
});

test("TODO-1550 items 4 and 5: X/27's nibbles are four bits, and an X/26 designation code comes once", () => {
  expectAccepted(pageMessage({ packets: [{ packet: "x27_nibbles", designation: 1, nibbles: nibblesEndingIn(15) }] }));
  expectRefused(
    pageMessage({ packets: [{ packet: "x27_nibbles", designation: 1, nibbles: nibblesEndingIn(16) }] }),
    "page.packets[0].nibbles[38]",
    "out_of_range",
  );
  expectAccepted(pageMessage({ enhancements: [enhancementOf(0), enhancementOf(1)] }));
  expectRefused(pageMessage({ enhancements: [enhancementOf(0), enhancementOf(0)] }), "page.enhancements[1].designation", "duplicate");
});

test("TODO-1550 item 6: a sub-page's sub-code is never 3F7F, and a list's sub-codes ascend once each", () => {
  expectAccepted(pageMessage({ sub: "3F7E" }));
  expectRefused(pageMessage({ sub: "3F7F" }), "page.sub", "out_of_range");
  expectAccepted(subpageList(["0001", "0002", "3F7E"]));
  expectRefused(subpageList(["0001", "3F7F"]), "subpages[1].sub", "out_of_range");
  expectRefused(subpageList(["0002", "0002"]), "subpages[1].sub", "duplicate");
  expectRefused(subpageList(["0002", "0001"]), "subpages[1].sub", "not_ascending");
});

test("TODO-1550 item 7: an index's magazines and pages ascend, each page in its magazine and not reserved, within start's pages a magazine", () => {
  expectAccepted(
    index([
      { magazine: 1, name: "", pages: [entry(0x100), entry(0x101)] },
      { magazine: 2, name: "", pages: [entry(0x200)] },
    ]),
  );
  expectRefused(
    index([
      { magazine: 2, name: "", pages: [entry(0x200)] },
      { magazine: 1, name: "", pages: [entry(0x100)] },
    ]),
    "magazines[1].magazine",
    "not_ascending",
  );
  expectRefused(
    index([
      { magazine: 1, name: "", pages: [entry(0x100)] },
      { magazine: 1, name: "", pages: [entry(0x101)] },
    ]),
    "magazines[1].magazine",
    "duplicate",
  );
  expectRefused(index([{ magazine: 1, name: "", pages: [entry(0x200)] }]), "magazines[0].pages[0].page", "wrong_magazine");
  for (const page of [0x1fd, 0x1fe, 0x1ff, 0x1be, 0x1f0, 0x8ff]) {
    expectRefused(index([{ magazine: page >> 8, name: "", pages: [entry(page)] }]), "magazines[0].pages[0].page", "reserved");
  }
  expectRefused(index([{ magazine: 1, name: "", pages: [entry(0x101), entry(0x100)] }]), "magazines[0].pages[1].page", "not_ascending");
  expectRefused(index([{ magazine: 1, name: "", pages: [entry(0x101), entry(0x101)] }]), "magazines[0].pages[1].page", "duplicate");
  expectAccepted(index([{ magazine: 1, name: "", pages: pagesOf(1, 251) }]));
  expectAccepted(index([{ magazine: 2, name: "", pages: pagesOf(2, 253) }]));
  expectRefused(index([{ magazine: 1, name: "", pages: [...pagesOf(1, 251), entry(0x1be)] }]), "magazines[0].pages", "too_long");
  expectRefused(index([{ magazine: 2, name: "", pages: [...pagesOf(2, 253), entry(0x2fd)] }]), "magazines[0].pages", "too_long");
  expectRefused(pageMessage({ page: "1F0" }), "page.page", "reserved");
  expectRefused({ type: "subpages", connections: [1], page: "2FF", version: 0, subpages: [{ sub: "0001" }] }, "page", "reserved");
  const reply = (page: string): unknown => ({
    type: "reply",
    connection: 1,
    request: 1,
    magazines: [{ magazine: 1, name: "", pages: [entry(0x100)] }],
    selected: { ...PAGE, page },
  });
  expectAccepted(reply("100"));
  expectRefused(reply("101"), "selected.page", "not_in_index");
});

test("TODO-1550 item 8: base64 is exact, a row is 40 seven-bit codes, samples and packets are whole", () => {
  const spaces = Array.from({ length: 40 }, () => 0x20);
  expectAccepted(rowOf(spaces));
  expectRefused(rowOf(spaces.slice(1)), "page.rows[0]", "wrong_length");
  expectRefused(rowOf([...spaces.slice(1), 0x80]), "page.rows[0]", "out_of_range");
  expectRefused(rawRow("!!!!"), "page.rows[0]", "not_base64");
  expectRefused(rawRow(Buffer.from(spaces).toString("base64").replaceAll("=", "")), "page.rows[0]", "not_base64");
  expectRefused(rawRow(" ".repeat(4)), "page.rows[0]", "not_base64");
  expectRefused(rawRow("A".repeat(60)), "page.rows[0]", "too_long");

  // TS-17: a sound's samples and packets are held to the schema alone; whole samples and whole packets of the profile are the server's to refuse.
  expectAccepted(pcmSound(4));
  expectAccepted(pcmSound(3));
  expectAccepted(opusSound(80));
  expectAccepted(opusSound(79));
  expectAccepted(opusSound(0));
});

test("TODO-1550 item 8: raw packets are whole 42-byte packets a stream may carry, as the engine's is_valid_stream_packet says", () => {
  expectAccepted(packets([...packet(1, 0), ...packet(8, 29), ...packet(8, 30), ...packet(4, 31), ...packet(2, 28)]));
  const corrected = packet(1, 0);
  corrected[0] = (corrected[0] ?? 0) ^ 0x80;
  expectAccepted(packets(corrected));
  expectRefused(packets([]), "packets", "wrong_length");
  expectRefused(packets(packet(1, 0).slice(1)), "packets", "wrong_length");
  expectRefused(packets([...packet(1, 0), ...packet(1, 30)]), "packets[1]", "invalid_packet");
  expectRefused(packets(packet(1, 31)), "packets[0]", "invalid_packet");
  const broken = packet(1, 0);
  broken[1] = (broken[1] ?? 0) ^ 0x03;
  expectRefused(packets(broken), "packets[0]", "invalid_packet");
});

test("a selection's number names one connection; a page names its language or its character set; a description is whole or nothing", () => {
  expectAccepted({ type: "page", connections: [1], request: 1, page: PAGE });
  expectRefused({ type: "page", connections: "all", request: 1, page: PAGE }, "connections", "one_connection");
  expectRefused({ type: "page", connections: [1, 2], request: 1, page: PAGE }, "connections", "one_connection");
  expectRefused({ type: "subpages", connections: "all", request: 1, page: "100", version: 0, subpages: [{ sub: "0001" }] }, "connections", "one_connection");
  expectRefused(pageMessage({ language: "ru", character_set: { region: null, national_option: 0 } }), "page.character_set", "language_and_character_set");
  const description = (fields: object): unknown => ({ type: "description", page: "100", public: true, title: "T", text: "X", content: PAGE, ...fields });
  expectAccepted(description({}));
  expectAccepted({ type: "description", page: "100", public: false });
  expectRefused({ type: "description", page: "100", public: false, title: "T" }, "title", "unknown_field");
  expectRefused(description({ text: null }), "text", "missing_field");
  expectRefused(description({ content: { ...PAGE, page: "101" } }), "content.page", "wrong_page");
  expectRefused({ type: "redirect", connection: 1, request: 1, address: "https://example.com", query: "a=1" }, "query", "unknown_field");
  // SRV-3: a sound's every kind is closed in the server's schema, as its reader is.
  expectAccepted({ type: "sound", connections: [1], kind: "stop", channel: 0, fade_ms: 0 });
  expectRefused({ type: "sound", connections: [1], kind: "stop", channel: 0, fade_ms: 0, loudness: 1 }, "", "unknown_field");
});

test("REQ-1033: the bounds start gives are the ones the kit holds a message to, not figures of its own", () => {
  const tighter: Limits = {
    standard: { ...SERVER_LIMITS.standard, pagesPerMagazine: 2, pagesInMagazine1: 1, subpages: 2 },
    budgets: { ...SERVER_LIMITS.budgets, authorLogBytes: 4, titleCharacters: 3, logCharacters: 2 },
  };
  expectAccepted({ type: "author_log", connections: "all", level: "I", text: "abcd", page: null }, tighter);
  expectRefused({ type: "author_log", connections: "all", level: "I", text: "abcde", page: null }, "text", "too_long", tighter);
  expectRefused(index([{ magazine: 1, name: "", pages: pagesOf(1, 2) }]), "magazines[0].pages", "too_long", tighter);
  expectRefused(index([{ magazine: 2, name: "", pages: pagesOf(2, 3) }]), "magazines[0].pages", "too_long", tighter);
  expectRefused(index([{ magazine: 1, name: "abcd", pages: pagesOf(1, 1) }]), "magazines[0].name", "too_long", tighter);
  expectRefused(
    { type: "subpages", connections: [1], page: "100", version: 0, subpages: [{ sub: "0001" }, { sub: "0002" }, { sub: "0003" }] },
    "subpages",
    "out_of_range",
    tighter,
  );
  expectRefused({ type: "log", level: "info", event: "e", text: "abc" }, "text", "too_long", tighter);
});

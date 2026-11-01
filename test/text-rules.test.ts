// The server's rules the schema cannot state, which the kit holds a
// program's messages to before they are written (REQ-1475 items 5 and 6,
// REQ-1479; the server's crates/teletext-runtime/src/protocol/check.rs at
// neoteletext-app-server 165a2c1; DEC-1548): text in Unicode normalisation
// form C, no control or bidirectional formatting character, a cookie's
// fields and an author's log line bounded in bytes; and the bounds the
// schema does state, at the paths the server names.

import assert from "node:assert/strict";
import { test } from "node:test";

import { App, blankContent, checkProgram, checkServer, fitText, ProtocolError, type WirePage, type WireTriplet } from "../src/index.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";

const PAGE: WirePage = { page: "100", sub: "0000", ...blankContent() };
/** "é" as one code point, which is NFC, and as "e" and a combining acute accent, which is not. */
const COMPOSED = "\u00E9";
const DECOMPOSED = "e\u0301";
/** The largest whole number every JSON reader holds exactly: 2^53 less one. */
const SAFE_LIMIT = Number.MAX_SAFE_INTEGER;

function index(name: string, title: string, section: string | null): unknown {
  return { type: "index", connections: "all", magazines: [{ magazine: 1, name, pages: [{ page: "100", title, section, subpages: 1 }] }] };
}

function labelled(label: string): WirePage {
  return { ...PAGE, link_extension: { keys: [{ key: "red", target: "101", label }], numbers: [], texts: [] } };
}

function cookie(fields: Readonly<Record<string, unknown>>): unknown {
  return { type: "cookie", connection: 1, name: "seen", value: "1", path: "/", max_age: null, same_site: null, secure: false, http_only: false, ...fields };
}

function authorLog(text: string): unknown {
  return { type: "author_log", connections: "all", level: "W", text, page: null };
}

/** X/27's thirteen triplets and thirty-nine nibbles (EN 300 706 clause 9.6). */
const TRIPLETS: WireTriplet[] = Array.from({ length: 13 }, () => ({ address: 0, mode: 0, data: 0 }));
const NIBBLES: number[] = Array.from({ length: 39 }, () => 0);

function nibbles(designation: number): unknown {
  return { type: "page", connections: [1], page: { ...PAGE, packets: [{ packet: "x27_nibbles", designation, nibbles: NIBBLES }] } };
}

function tripletLine(designation: number): unknown {
  return { type: "page", connections: [1], page: { ...PAGE, packets: [{ packet: "x27", designation, triplets: TRIPLETS }] } };
}

/** A redirect of connection 1 with `fields`. */
function redirectWith(fields: object): unknown {
  return { type: "redirect", connection: 1, ...fields };
}

test("REQ-1688: a redirect names a page and its sub-code, or an address, in the fault's own place", () => {
  const address = "https://elsewhere.example/channel/302";
  assert.equal(checkProgram(redirectWith({ page: "100", sub: "3F7F" })), null);
  assert.equal(checkProgram(redirectWith({ address })), null);
  const faults: readonly (readonly [object, string, string])[] = [
    [{}, "page", "missing_field"],
    [{ sub: "3F7F" }, "page", "missing_field"],
    [{ page: "100" }, "sub", "missing_field"],
    [{ page: "100", sub: "3F7F", address }, "page", "unknown_field"],
    [{ sub: "3F7F", address }, "sub", "unknown_field"],
    [{ address: "" }, "address", "forbidden_character"],
    [{ address: "https://elsewhere.example/a b" }, "address", "forbidden_character"],
    [{ address: "https://élsewhere.example/" }, "address", "forbidden_character"],
  ];
  for (const [fields, path, rule] of faults) {
    const fault = checkProgram(redirectWith(fields));
    assert.deepEqual([fault?.path, fault?.rule], [path, rule], JSON.stringify(fields));
  }
});

function redirect(connection: number): unknown {
  return { type: "redirect", connection, page: "100", sub: "3F7F" };
}

function pageFor(connection: number): unknown {
  return { type: "page", connections: [connection], page: PAGE };
}

/** Each text field a program sends, with `text` in it, and the path the server names it by. */
function everyTextField(text: string): [unknown, string][] {
  return [
    [index(text, "Index", null), "magazines[0].name"],
    [index("News", text, null), "magazines[0].pages[0].title"],
    [index("News", "Index", text), "magazines[0].pages[0].section"],
    [{ type: "page", connections: [1], page: labelled(text) }, "page.link_extension.keys[0].label"],
    [{ type: "subpages", connections: [1], page: "100", version: 0, subpages: [{ sub: "0001", title: text }] }, "subpages[0].title"],
    [cookie({ name: text }), "name"],
    [cookie({ value: text }), "value"],
    [cookie({ path: text }), "path"],
    [{ type: "author_log", connections: "all", level: "I", text, page: null }, "text"],
    [{ type: "log", level: "info", event: "application", text }, "text"],
  ];
}

test("REQ-1475: text not in normalisation form C is refused not_nfc at its path, in every text field; the same text composed passes", () => {
  for (const [message, path] of everyTextField(`x${DECOMPOSED}`)) {
    assert.deepEqual(checkProgram(message), { path, rule: "not_nfc", detail: "not in Unicode normalisation form C" }, JSON.stringify(message).slice(0, 200));
  }
  for (const [message] of everyTextField(`x${COMPOSED}`)) {
    assert.equal(checkProgram(message), null, JSON.stringify(message).slice(0, 200));
  }
  const reply = {
    type: "reply",
    connection: 1,
    magazines: [{ magazine: 1, name: "News", pages: [{ page: "100", title: "Index", section: null, subpages: 1 }] }],
    selected: labelled(DECOMPOSED),
  };
  assert.equal(checkProgram(reply)?.path, "selected.link_extension.keys[0].label");
  assert.equal(checkProgram(reply)?.rule, "not_nfc");
});

test("REQ-1475: a control (C0, DEL, C1) or a bidirectional formatting character is refused forbidden_character in every text field", () => {
  for (const point of [0x00, 0x09, 0x1f, 0x7f, 0x80, 0x9f, 0x061c, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069]) {
    const character = String.fromCodePoint(point);
    for (const [message, path] of everyTextField(`a${character}`)) {
      const fault = checkProgram(message);
      assert.equal(fault?.path, path, `U+${point.toString(16)} ${JSON.stringify(message).slice(0, 120)}`);
      assert.equal(fault?.rule, "forbidden_character", `U+${point.toString(16)} at ${path}`);
      assert.match(fault.detail, /^U\+[0-9A-F]{4} at character 1$/u);
    }
  }
  // The joiners and the soft hyphen are format characters, but not bidirectional ones: the server takes them.
  for (const [message] of everyTextField("a\u200Db\u00ADc")) {
    assert.equal(checkProgram(message), null, JSON.stringify(message).slice(0, 120));
  }
});

test("REQ-1475: a cookie's name, value and path are bounded in bytes, as RFC 6265 section 6.1 bounds them (the server's 165a2c1)", () => {
  for (const field of ["name", "value", "path"]) {
    assert.equal(checkProgram(cookie({ [field]: "a".repeat(4096) })), null, `${field}: 4,096 bytes`);
    assert.equal(checkProgram(cookie({ [field]: COMPOSED.repeat(2048) })), null, `${field}: 2,048 two-byte characters are 4,096 bytes`);
    assert.deepEqual(checkProgram(cookie({ [field]: COMPOSED.repeat(2049) })), { path: field, rule: "too_long", detail: "4098 bytes, at most 4096" }, field);
    assert.equal(checkProgram(cookie({ [field]: "a".repeat(4097) }))?.rule, "too_long", `${field}: the schema bounds the characters by the same figure`);
  }
  assert.deepEqual(checkProgram(cookie({ name: "_session" })), { path: "name", rule: "reserved", detail: "names starting _ are the server's" });
});

test("REQ-1475: an author's log line is at most 200 bytes of UTF-8", () => {
  assert.equal(SERVER_LIMITS.budgets.authorLogBytes, 200);
  assert.equal(checkProgram(authorLog(COMPOSED.repeat(100))), null);
  assert.deepEqual(checkProgram(authorLog(COMPOSED.repeat(101))), { path: "text", rule: "too_long", detail: "202 bytes, at most 200" });
});

test("REQ-1475: X/27 carries nibbles at designation codes 1 to 3 and triplets at 4 to 15, each refused out_of_range at its path", () => {
  for (const designation of [1, 3]) {
    assert.equal(checkProgram(nibbles(designation)), null, `nibbles at ${designation}`);
  }
  for (const designation of [4, 15]) {
    assert.equal(checkProgram(tripletLine(designation)), null, `triplets at ${designation}`);
  }
  for (const [message, designation] of [
    [nibbles(0), 0],
    [nibbles(4), 4],
    [tripletLine(3), 3],
    [tripletLine(16), 16],
  ] as const) {
    const fault = checkProgram(message);
    assert.equal(fault?.path, "page.packets[0].designation", `designation ${designation}`);
    assert.equal(fault?.rule, "out_of_range", `designation ${designation}`);
  }
});

test("REQ-1475: a connection's number is 1 to 2^53 less one, alone or named in a list", () => {
  for (const connection of [1, SAFE_LIMIT]) {
    assert.equal(checkProgram(redirect(connection)), null, `${connection}`);
    assert.equal(checkProgram(pageFor(connection)), null, `${connection}`);
  }
  for (const connection of [0, SAFE_LIMIT + 1]) {
    assert.equal(checkProgram(redirect(connection))?.path, "connection", `${connection}`);
    assert.equal(checkProgram(redirect(connection))?.rule, "out_of_range", `${connection}`);
    assert.equal(checkProgram(pageFor(connection))?.path, "connections[0]", `${connection}`);
    assert.equal(checkProgram(pageFor(connection))?.rule, "out_of_range", `${connection}`);
  }
});

test("REQ-1475: a message with text not in NFC is never written; the call throws with the server's path and rule", () => {
  const lines: string[] = [];
  const app = new App((line) => {
    lines.push(line);
  });
  app.started(SERVER_LIMITS);
  assert.throws(
    () => {
      app.send({ type: "log", level: "info", event: "application", text: DECOMPOSED });
    },
    (error: unknown) => error instanceof ProtocolError && error.fault.rule === "not_nfc" && error.fault.path === "text",
  );
  assert.deepEqual(lines, []);
});

test("REQ-1479: a refusal for text not in NFC is a message the kit reads, with its path", () => {
  assert.equal(
    checkServer({ type: "refused", message: "index", path: "magazines[0].name", rule: "not_nfc", detail: "not in Unicode normalisation form C" }),
    null,
  );
  assert.equal(checkServer({ type: "refused", message: "index", path: "", rule: "not_a_rule", detail: "" })?.rule, "not_listed");
});

test("the kit's titles are fitted in NFC, so a title it fits is one the server takes", () => {
  assert.equal(fitText(`caf${DECOMPOSED}`, 120), `caf${COMPOSED}`);
  assert.equal(fitText(`${DECOMPOSED}${DECOMPOSED}`, 1), COMPOSED, "the cut is counted in composed characters");
  assert.equal(checkProgram(index(fitText(`a\u202E${DECOMPOSED}`, 120), "Index", null)), null);
});

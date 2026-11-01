// DEC-1730: a viewer's query arrives with a selection, and an application
// hears it as a request: the path, the query read and as written, and the
// connection's cookies.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANY_SUB,
  type Application,
  checkServer,
  type Context,
  dispatch,
  type PageEntry,
  type PageRequest,
  readMessage,
  type ServerEvents,
} from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";
import { screen } from "./recorder.ts";

const PAGES = [0x100, 0x302, 0x303];
const SUB = 2;

/** An event no test here should hear. */
function ignored(): void {
  assert.fail("no other event");
}

/** An application of `PAGES` calling `heard` with every request and with every page opened. */
function hearing(heard: (text: string, request?: PageRequest | null) => void): Application {
  const application: Application = {
    pages: () => PAGES.map((page): PageEntry => ({ page, title: "Page" })),
    start: (context) => {
      for (const page of PAGES) {
        context.publish("channel", page, screen("Page"));
      }
    },
    request: (session, page, request) => {
      heard(`request ${session} ${page.toString(16)} ${request?.queryText ?? null}`, request);
    },
    opened: (session, page) => {
      heard(`opened ${session} ${page.toString(16)}`);
    },
  };
  return application;
}

/** The one request heard when connection 1 selects page 302 with `query`. */
function requestFor(query: string): PageRequest {
  const heard: PageRequest[] = [];
  const harness = new Harness([
    hearing((_text, request) => {
      if (request !== undefined && request !== null) {
        heard.push(request);
      }
    }),
  ]);
  harness.join(1, 0x100);
  heard.length = 0;
  harness.open(1, 0x302, ANY_SUB, query);
  const [request] = heard;
  assert.ok(request !== undefined);
  return request;
}

test("DEC-1730 item 9: an application hears a selection as a request, with its path, query and cookies", () => {
  const heard: (PageRequest | null | undefined)[] = [];
  const harness = new Harness([
    hearing((_text, request) => {
      if (request !== undefined) {
        heard.push(request);
      }
    }),
  ]);
  harness.channel.connected(1, 1, 1, null, [
    { name: "theme", value: "dark" },
    { name: "seen", value: "1" },
  ]);
  heard.length = 0;
  harness.channel.selected(1, 2, { page: 0x302, sub: SUB }, "302/0002", "a=1");
  assert.deepEqual(heard, [null, { method: "GET", path: "302/0002", query: { a: "1" }, queryText: "a=1", cookies: { theme: "dark", seen: "1" } }]);
});

test("DEC-1730 item 9: a query is read as URLSearchParams reads it, and kept as written", () => {
  const written = "a=1&b=%20x&c+d=e+f&empty&=no+name&r=%C3%A9&bad=%zz&broken=%ff&a=2";
  const request = requestFor(written);
  assert.equal(request.queryText, written);
  assert.deepEqual(request.query, {
    a: "2",
    b: " x",
    "c d": "e f",
    empty: "",
    "": "no name",
    r: "é",
    bad: "%zz",
    broken: "�",
  });
  assert.deepEqual([...new URLSearchParams(request.queryText).getAll("a")], ["1", "2"], "a name given twice is whole in the text");
});

test("DEC-1730 item 9: a viewer's names are plain names, in a query and in cookies", () => {
  const { query } = requestFor("__proto__=x&constructor=y");
  assert.equal(Object.getPrototypeOf(query), Object.prototype, "the query's prototype is its own still");
  assert.deepEqual(Object.keys(query), ["__proto__", "constructor"]);

  let cookies: Readonly<Record<string, string>> | undefined;
  const harness = new Harness([
    hearing((_text, request) => {
      cookies = request?.cookies ?? cookies;
    }),
  ]);
  harness.channel.connected(1, 1, 1, null, [
    { name: "__proto__", value: "x" },
    { name: "a", value: "1" },
    { name: "a", value: "2" },
  ]);
  harness.open(1, 0x302, ANY_SUB, "q=1");
  assert.deepEqual(Object.keys(cookies ?? {}), ["__proto__", "a"]);
  assert.equal(cookies?.["a"], "2");
});

test("an application hears a request before the page opens, and null when another selection leaves it behind", () => {
  const heard: string[] = [];
  const harness = new Harness([
    hearing((text) => {
      heard.push(text);
    }),
  ]);
  harness.join(1, 0x100);
  heard.length = 0;
  harness.open(1, 0x302, ANY_SUB, "a=1&b=%20x");
  harness.open(1, 0x302, ANY_SUB, "a=1&b=%20x");
  harness.open(1, 0x302, ANY_SUB, "a=2");
  harness.open(1, 0x303);
  assert.deepEqual(heard, [
    "request 1 100 null",
    "request 1 302 a=1&b=%20x",
    "opened 1 302",
    "request 1 302 a=1&b=%20x",
    "request 1 302 a=2",
    "request 1 302 null",
    "request 1 303 ",
    "opened 1 303",
  ]);
});

test("TODO-1731 item 4: every selection is heard, so request.path is never stale", () => {
  const paths: string[] = [];
  const harness = new Harness([
    hearing((_text, request) => {
      if (request !== undefined && request !== null) {
        paths.push(`${request.path} ${request.queryText}`);
      }
    }),
  ]);
  harness.join(1, 0x100);
  paths.length = 0;
  harness.open(1, 0x302, 1, "a=1");
  harness.open(1, 0x302, SUB, "a=1");
  harness.open(1, 0x302, SUB);
  assert.deepEqual(paths, ["302/0001 a=1", "302/0002 a=1", "302/0002 "]);
});

test("TODO-1731 item 5: a sub-page the page lacks moves the viewer to the page, with its query", () => {
  const harness = new Harness([hearing(() => {})]);
  harness.join(1, 0x100);
  harness.sent.length = 0;
  harness.open(1, 0x302, 9, "a=1");
  const redirect = harness.sent.find((message) => message["type"] === "redirect");
  assert.deepEqual(redirect, { type: "redirect", connection: 1, request: 2, page: "302", sub: "3F7F", query: "a=1" });
});

test("DEC-1759 lesson 13: what answers a selection carries its number, and a change carries none", () => {
  let context: Context | undefined;
  const application: Application = {
    ...hearing(() => {}),
    opened: (_session, _page, given) => {
      context = given;
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  harness.open(1, 0x302);
  const answers = harness.sent.filter((message) => message["type"] === "page" || message["type"] === "reply");
  assert.deepEqual(
    answers.map((message) => message["request"]),
    [1, 2],
  );
  harness.sent.length = 0;
  context?.publish("channel", 0x302, screen("Changed"));
  const change = harness.sent.find((message) => message["type"] === "page");
  assert.equal(change?.["request"], null);
});

test("DEC-1759 lesson 12: a page nobody published ends its selection with DENIED 404 at once, not at the deadline", () => {
  const harness = new Harness([hearing(() => {})]);
  harness.join(1, 0x100);
  harness.sent.length = 0;
  harness.open(1, 0x8fc);
  assert.deepEqual(harness.sent, [{ type: "denied", connection: 1, request: 2, status: 404 }]);
});

test("the viewer's going leaves the request behind on the page it came with", () => {
  const heard: string[] = [];
  const harness = new Harness([
    hearing((text) => {
      heard.push(text);
    }),
  ]);
  harness.join(1, 0x100);
  harness.open(1, 0x302, ANY_SUB, "a=1");
  heard.length = 0;
  harness.close(1);
  assert.deepEqual(heard, ["request 1 302 null"]);
});

test("a program that starts again hears the request of a connection's selection, as connected names it", () => {
  const heard: (PageRequest | null | undefined)[] = [];
  const harness = new Harness([
    hearing((_text, request) => {
      if (request !== undefined) {
        heard.push(request);
      }
    }),
  ]);
  harness.channel.connected(1, 1, 1, { page: 0x302, sub: SUB }, [{ name: "theme", value: "dark" }], "302/0002", "a=1");
  assert.deepEqual(heard, [{ method: "GET", path: "302/0002", query: { a: "1" }, queryText: "a=1", cookies: { theme: "dark" } }]);
});

test("a query reaches no application on a connection that selected nothing it serves", () => {
  const heard: string[] = [];
  const harness = new Harness([
    hearing((text) => {
      heard.push(text);
    }),
  ]);
  harness.channel.connected(1, 1, 1, null, [], null, "a=1");
  harness.channel.connected(2, 2, 1, { page: 0x777, sub: ANY_SUB }, [], "777", "a=1");
  assert.deepEqual(heard, ["request 1 100 ", "opened 1 100", "request 2 100 ", "opened 2 100"]);
});

test("schema 6: connected and selected carry a number, a path and a query, and the old fields are refused", () => {
  const connected = { type: "connected", connection: 1, session: 1, request: 1, cookies: [] };
  const selected = { type: "selected", connection: 1, request: 2, path: "302/0002", page: "302", sub: "0002" };
  assert.equal(checkServer({ ...connected, selection: { page: "302", sub: "0002" }, path: "302/0002", query: "a=1" }), null);
  assert.equal(checkServer({ ...selected, query: "a=1" }), null);
  assert.equal(checkServer({ ...selected, parameters: "a=1" })?.rule, "unknown_field");
  assert.equal(checkServer({ ...connected, parameters: "a=1" })?.rule, "unknown_field");
  const missing = checkServer({ type: "selected", connection: 1, request: 2, page: "302", sub: "0002" });
  assert.equal(missing?.rule, "missing_field");
  assert.match(missing?.detail ?? "", /'path'/u);
});

test("DEC-1759 lesson 16: a message of an unknown type, or with an unknown field, is refused and not half-taken", () => {
  assert.equal(typeof readMessage('{"type":"nothing"}'), "string");
  const known = '{"type":"selected","connection":1,"request":2,"path":"100","page":"100","sub":"3F7F"}';
  assert.notEqual(typeof readMessage(known), "string");
  const refused = readMessage(known.replace("}", ',"later":1}'));
  assert.ok(typeof refused === "string" && refused.includes("unknown_field"), JSON.stringify(refused));
  assert.equal(typeof readMessage(known.replace('"request":2,', "")), "string", "and a number is not optional");
});

test("the server's lines reach the events with their path and query", () => {
  const heard: unknown[] = [];
  const events: ServerEvents = {
    start: ignored,
    input: ignored,
    left: ignored,
    closed: ignored,
    stats: ignored,
    refused: ignored,
    describe: ignored,
    connected: (_connection, _session, request, selection, _cookies, path, query) => {
      heard.push(["connected", request, selection, path, query]);
    },
    selected: (_connection, request, selection, path, query) => {
      heard.push(["selected", request, selection, path, query]);
    },
  };
  for (const line of [
    '{"type":"connected","connection":1,"session":1,"request":1,"cookies":[],"selection":{"page":"302","sub":"0002"},"path":"302/0002","query":"a=1"}',
    '{"type":"connected","connection":2,"session":1,"request":1,"cookies":[]}',
    '{"type":"selected","connection":1,"request":2,"path":"303","page":"303","sub":"3F7F","query":"b=2"}',
    '{"type":"selected","connection":1,"request":3,"path":"304","page":"304","sub":"3F7F"}',
  ]) {
    const message = readMessage(line);
    assert.ok(typeof message !== "string", line);
    dispatch(message, events);
  }
  assert.deepEqual(heard, [
    ["connected", 1, { page: 0x302, sub: SUB }, "302/0002", "a=1"],
    ["connected", 1, null, null, null],
    ["selected", 2, { page: 0x303, sub: ANY_SUB }, "303", "b=2"],
    ["selected", 3, { page: 0x304, sub: ANY_SUB }, "304", null],
  ]);
});

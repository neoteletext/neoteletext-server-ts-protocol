// DEC-1730: a viewer's query arrives with a selection, and an application
// hears it as a request: the path, the query read and as written, and the
// connection's cookies.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ANY_SUB, type Application, checkServer, dispatch, type PageEntry, type PageRequest, readMessage, type ServerEvents } from "../src/index.ts";
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
  harness.channel.connected(1, 1, null, [
    { name: "theme", value: "dark" },
    { name: "seen", value: "1" },
  ]);
  harness.channel.selected(1, { page: 0x302, sub: SUB }, "302/0002", "a=1");
  assert.deepEqual(heard, [{ method: "GET", path: "302/0002", query: { a: "1" }, queryText: "a=1", cookies: { theme: "dark", seen: "1" } }]);
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
  harness.channel.connected(1, 1, null, [
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
  assert.deepEqual(heard, ["request 1 302 a=1&b=%20x", "opened 1 302", "request 1 302 a=2", "request 1 302 null", "opened 1 303"]);
});

test("a selection without a query has nothing to leave behind on a page that had none", () => {
  const heard: string[] = [];
  const harness = new Harness([
    hearing((text) => {
      heard.push(text);
    }),
  ]);
  harness.join(1, 0x100);
  heard.length = 0;
  harness.open(1, 0x302);
  harness.open(1, 0x302, SUB);
  assert.deepEqual(heard, ["opened 1 302"]);
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
  harness.channel.connected(1, 1, { page: 0x302, sub: SUB }, [{ name: "theme", value: "dark" }], "302/0002", "a=1");
  assert.deepEqual(heard, [{ method: "GET", path: "302/0002", query: { a: "1" }, queryText: "a=1", cookies: { theme: "dark" } }]);
});

test("a query reaches no application on a connection that selected nothing it serves", () => {
  const heard: string[] = [];
  const harness = new Harness([
    hearing((text) => {
      heard.push(text);
    }),
  ]);
  harness.channel.connected(1, 1, null, [], null, "a=1");
  harness.channel.connected(2, 2, { page: 0x777, sub: ANY_SUB }, [], "777", "a=1");
  assert.deepEqual(heard, ["opened 1 100", "opened 2 100"]);
});

test("schema 5: connected and selected carry a path and a query, and the old fields are refused", () => {
  const connected = { type: "connected", connection: 1, session: 1, cookies: [] };
  const selected = { type: "selected", connection: 1, path: "302/0002", page: "302", sub: "0002" };
  assert.equal(checkServer({ ...connected, selection: { page: "302", sub: "0002" }, path: "302/0002", query: "a=1" }), null);
  assert.equal(checkServer({ ...selected, query: "a=1" }), null);
  assert.equal(checkServer({ ...selected, parameters: "a=1" })?.rule, "unknown_field");
  assert.equal(checkServer({ ...connected, parameters: "a=1" })?.rule, "unknown_field");
  const missing = checkServer({ type: "selected", connection: 1, page: "302", sub: "0002" });
  assert.equal(missing?.rule, "missing_field");
  assert.match(missing?.detail ?? "", /'path'/u);
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
    connected: (_connection, _session, selection, _cookies, path, query) => {
      heard.push(["connected", selection, path, query]);
    },
    selected: (_connection, selection, path, query) => {
      heard.push(["selected", selection, path, query]);
    },
  };
  for (const line of [
    '{"type":"connected","connection":1,"session":1,"cookies":[],"selection":{"page":"302","sub":"0002"},"path":"302/0002","query":"a=1"}',
    '{"type":"connected","connection":2,"session":1,"cookies":[]}',
    '{"type":"selected","connection":1,"path":"303","page":"303","sub":"3F7F","query":"b=2"}',
    '{"type":"selected","connection":1,"path":"304","page":"304","sub":"3F7F"}',
  ]) {
    const message = readMessage(line);
    assert.ok(typeof message !== "string", line);
    dispatch(message, events);
  }
  assert.deepEqual(heard, [
    ["connected", { page: 0x302, sub: SUB }, "302/0002", "a=1"],
    ["connected", null, null, null],
    ["selected", { page: 0x303, sub: ANY_SUB }, "303", "b=2"],
    ["selected", { page: 0x304, sub: ANY_SUB }, "304", null],
  ]);
});

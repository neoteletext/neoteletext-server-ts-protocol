// A page's description for the web (REQ-1728): nothing is public by default,
// and what is public is built with no session in scope.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type Context, type PageDescription, type PageEntry, readMessage } from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";
import { SERVER_LIMITS } from "../src/testing/server-limits.ts";
import { screen } from "./recorder.ts";

const PAGE = 0x100;
const OTHER = 0x101;
const SESSION = 1;
const NOT_PUBLIC = { type: "description", page: "100", public: false };
const PUBLIC: PageDescription = { public: true, title: "A title", text: "Its words." };

/** An application of one page, with a copy for each viewer that says who they are. */
class Story implements Application {
  pages(): PageEntry[] {
    return [{ page: PAGE, title: "Story" }];
  }

  start(context: Context): void {
    context.publish("channel", PAGE, screen("for everyone"));
  }

  joined(session: number, context: Context): void {
    context.publish(session, PAGE, screen(`private to ${session}`));
  }
}

/** The channel of a story that describes itself so. */
function described(describe: NonNullable<Application["describe"]>): Harness {
  const story = new Story();
  return new Harness([Object.assign(story, { describe })]);
}

test("`describe` is read from its line and carries a page and nothing else", () => {
  assert.deepEqual(readMessage('{"type":"describe","page":"100"}'), { type: "describe", page: PAGE });
  const withViewer = readMessage('{"type":"describe","page":"100","session":1}');
  assert.ok(typeof withViewer === "string" && withViewer.includes("unknown_field"), JSON.stringify(withViewer));
});

test("a page is not public by default: an application that says nothing publishes nothing", () => {
  assert.deepEqual(new Harness([new Story()]).describe(PAGE), NOT_PUBLIC);
});

test("a page no application serves, and one it answers nothing for, are not public", () => {
  const harness = described(() => null);
  assert.deepEqual(harness.describe(PAGE), NOT_PUBLIC);
  assert.deepEqual(harness.describe(OTHER), { ...NOT_PUBLIC, page: "101" });
});

test("only `public` true makes a page public, whatever else a program's answer holds", () => {
  const unsaid = Object.assign({}, PUBLIC, { public: false });
  assert.deepEqual(described(() => unsaid).describe(PAGE), NOT_PUBLIC);
});

test("a public page gives its title, its text and the channel's copy", () => {
  const answer = described(() => PUBLIC).describe(PAGE);
  assert.equal(answer["public"], true);
  assert.equal(answer["title"], "A title");
  assert.equal(answer["text"], "Its words.");
  assert.match(JSON.stringify(answer["content"]), /^\{"page":"100"/u);
});

test("a description is given the page number and nothing else, and shows the channel's copy with a viewer on the page", () => {
  const given: unknown[][] = [];
  const harness = described((...arguments_: unknown[]) => {
    given.push(arguments_);
    return PUBLIC;
  });
  const shared = harness.describe(PAGE)["content"];
  harness.join(SESSION, PAGE);
  assert.notDeepEqual(harness.own(SESSION, PAGE), harness.shared(PAGE), "the viewer has a copy of their own");
  assert.deepEqual(harness.describe(PAGE)["content"], shared, "and no answer holds it");
  assert.deepEqual(given, [[PAGE], [PAGE]]);
});

test("a description that fails is reported, and the page is not public", () => {
  const harness = described(() => {
    throw new Error("no such article");
  });
  assert.deepEqual(harness.describe(PAGE), NOT_PUBLIC);
  assert.match(harness.errors.join(""), /describing 100 failed/u);
});

test("a title or a text with nothing in it is no public page", () => {
  assert.deepEqual(described(() => ({ ...PUBLIC, title: "  " })).describe(PAGE), NOT_PUBLIC);
  assert.deepEqual(described(() => ({ ...PUBLIC, text: "\n" })).describe(PAGE), NOT_PUBLIC);
});

test("a title and a text are fitted to what the server takes: one line, form C, no controls, within its bounds", () => {
  const long = "é ".repeat(SERVER_LIMITS.budgets.descriptionTextCharacters);
  const answer = described(() => ({ public: true, title: `line\nbreak‮${long}`, text: `tab\there  ${long}` })).describe(PAGE);
  const title = String(answer["title"]);
  const text = String(answer["text"]);
  assert.ok(title.startsWith("line break é"), title.slice(0, 20));
  assert.ok(text.startsWith("tab here é"), text.slice(0, 20));
  assert.ok(Array.from(title).length <= SERVER_LIMITS.budgets.titleCharacters);
  assert.ok(Array.from(text).length <= SERVER_LIMITS.budgets.descriptionTextCharacters);
});

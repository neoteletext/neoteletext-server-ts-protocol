// Snapshots (REQ-6901; tab-thumbnails.md section 7.1): the server asks for a
// page drawn for no one in particular, and the kit runs the page's own
// selection for a stranger on a connection of its own, answering with the
// sub-page that connection would be shown first and the picture sent to it
// alone, or declining. Every line is checked against the schema as it is
// written (the harness's App), and nothing else addressed to the snapshot's
// connection is ever written.

// oxlint-disable max-lines -- one test of each of REQ-6901's verification list, and the rules of the answer's line
import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type Context, type PageEntry, type PageRequest, Timeline } from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";
import type { Sent } from "../src/testing/sent.ts";
import { isFields } from "../src/wire/fields.ts";
import { checkProgram, readServer } from "../src/wire/validate.ts";
import { dispatch } from "../src/wire/server-events.ts";
import { SERVER_LIMITS } from "../src/testing/server-limits.ts";
import { screen } from "./recorder.ts";

const PAGE = 0x200;
const OTHER = 0x300;
/** 3F7F: the page as a whole (EN 300 706 clause 9.6.1). */
const WHOLE = 0x3f7f;
const FIRST_SUB = 0x0001;
const SECOND_SUB = 0x0002;
const SNAPSHOT = 17;
const FORBIDDEN = 403;
/** The bound of a snapshot's picture, decoded (tab-thumbnails.md section 6.3). */
const MOST_PICTURE_BYTES = 262_144;

/** A NAPLPS object, as the shared wire vectors' macro object 301 (animation.md ANIM-11). */
const OBJECTS = [
  {
    number: 301,
    kind: "macro",
    shown: true,
    detectable: true,
    layer: 2,
    order: 0,
    x: 10,
    y: 50,
    width: 64,
    height: 32,
    origin_x: 0,
    origin_y: 0,
    frames: [32],
  },
] as const;

/** The selection of `page` and `sub` as the server's `snapshot` names it. */
function selection(page: number, sub: number): { readonly page: number; readonly sub: number } {
  return { page, sub };
}

/** The path the server writes for a place: `200` or `200/0001`. */
function pathOf(page: number, sub: number): string {
  const text = page.toString(16).toUpperCase();
  return sub === WHOLE ? text : `${text}/${sub.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Asks for a snapshot of `page` and `sub`: the lines written while it was answered. */
function snapshot(harness: Harness, page: number, sub = WHOLE, number = SNAPSHOT): Sent[] {
  const before = harness.sent.length;
  harness.channel.snapshot(number, selection(page, sub), pathOf(page, sub));
  return harness.sent.slice(before);
}

/** The one answer among `lines`, which must be all that was written. */
function answerOf(lines: readonly Sent[]): Sent {
  assert.equal(lines.length, 1, `one line answers a snapshot, not ${JSON.stringify(lines.map((line) => line["type"]))}`);
  const [answer] = lines;
  assert.ok(answer !== undefined);
  return answer;
}

/** A field of a line's object field, such as its page's sub-code. */
function fieldOf(value: unknown, name: string): unknown {
  return isFields(value) ? value[name] : undefined;
}

/** A line's page's rows, each as the text its bytes are. */
function rowsText(page: unknown): string {
  const rows = typeof page === "object" && page !== null && "rows" in page && Array.isArray(page.rows) ? page.rows : [];
  return rows.map((row: unknown) => (typeof row === "string" ? Buffer.from(row, "base64").toString("latin1") : "")).join("\n");
}

/** An application of one page with two sub-pages, the given handlers added. */
function twoSubpages(handlers: Partial<Application> = {}, entry: Partial<PageEntry> = {}): Application {
  return {
    pages: (): PageEntry[] => [{ page: PAGE, title: "Pictured", ...entry }],
    start: (context): void => {
      context.publishSubpages("channel", PAGE, [{ screen: screen("first") }, { screen: screen("second") }]);
    },
    ...handlers,
  };
}

test("REQ-6901: a_snapshot_runs_the_pages_selection_for_a_stranger_and_answers_its_first_sub_page", () => {
  const heard: string[] = [];
  const harness = new Harness([
    twoSubpages({
      joined: (connection): void => {
        heard.push(`joined ${connection}`);
      },
      request: (connection, page, request: PageRequest | null): void => {
        heard.push(`request ${connection} ${page.toString(16)} ${request === null ? "ended" : `${request.path} "${request.queryText}"`}`);
      },
      opened: (connection, page): void => {
        heard.push(`opened ${connection} ${page.toString(16)}`);
      },
      leftPage: (connection, page): void => {
        heard.push(`left ${connection} ${page.toString(16)}`);
      },
      gone: (connection): void => {
        heard.push(`gone ${connection}`);
      },
    }),
  ]);
  const whole = answerOf(snapshot(harness, PAGE));
  assert.equal(whole["type"], "snapshot_page");
  assert.equal(whole["snapshot"], SNAPSHOT);
  assert.deepEqual([fieldOf(whole["page"], "page"), fieldOf(whole["page"], "sub")], ["200", "0001"], "3F7F answers the first in ascending order (DEC-1526)");
  assert.match(rowsText(whole["page"]), /first/u);
  assert.equal(whole["picture"], undefined, "no picture was sent");
  assert.deepEqual(heard, [
    `joined -${SNAPSHOT}`,
    `request -${SNAPSHOT} 200 200 ""`,
    `opened -${SNAPSHOT} 200`,
    `request -${SNAPSHOT} 200 ended`,
    `left -${SNAPSHOT} 200`,
    `gone -${SNAPSHOT}`,
  ]);
  const second = answerOf(snapshot(harness, PAGE, SECOND_SUB, SNAPSHOT + 1));
  assert.deepEqual([fieldOf(second["page"], "sub"), second["snapshot"]], ["0002", SNAPSHOT + 1], "a sub-page asked for answers itself (DEC-6599)");
  assert.match(rowsText(second["page"]), /second/u);
  assert.equal(answerOf(snapshot(harness, PAGE, 0x0005, SNAPSHOT + 2))["type"], "snapshot_declined", "a sub-page the page does not have");
  assert.deepEqual(harness.errors, []);
});

test("REQ-6901: a_snapshot_connection_has_no_viewer_and_is_a_snapshot", () => {
  const seen: unknown[] = [];
  const look = (connection: number, context: Context): void => {
    seen.push([connection, context.viewer(connection), context.remembered(connection), context.isSnapshot(connection), context.connection()]);
  };
  const harness = new Harness([
    twoSubpages({
      joined: look,
      opened: (connection, _page, context): void => {
        look(connection, context);
      },
    }),
  ]);
  const viewer = harness.join(harness.viewer("alice"), PAGE);
  answerOf(snapshot(harness, PAGE));
  const [first] = seen;
  assert.equal(Array.isArray(first) ? first.at(3) : undefined, false, "a viewer's connection is no snapshot");
  assert.deepEqual(seen.slice(2), [
    [-SNAPSHOT, null, false, true, -SNAPSHOT],
    [-SNAPSHOT, null, false, true, -SNAPSHOT],
  ]);
  assert.ok(viewer > 0);
});

test("REQ-6901: a_page_drawn_for_each_viewer_is_pictured_as_a_stranger_sees_it", () => {
  const perViewer: Application = {
    pages: (): PageEntry[] => [{ page: PAGE, title: "Yours" }],
    start: (context): void => {
      context.publish("channel", PAGE, screen("shared"));
    },
    opened: (connection, page, context): void => {
      const viewer = context.viewer(connection);
      context.publish(connection, page, screen(viewer === null ? "hello stranger" : `hello ${viewer.handle.slice(0, 8)}`));
    },
  };
  const harness = new Harness([perViewer]);
  harness.join(harness.viewer("alice"), PAGE);
  const answer = answerOf(snapshot(harness, PAGE));
  assert.equal(answer["type"], "snapshot_page");
  assert.match(rowsText(answer["page"]), /hello stranger/u, "the connection's own copy, drawn with no viewer");
  assert.doesNotMatch(rowsText(answer["page"]), /shared/u);
});

test("REQ-6901: a_page_whose_request_handler_denies_strangers_is_declined", () => {
  const members = twoSubpages({
    request: (connection, _page, request, context): void => {
      if (request !== null && context.viewer(connection) === null) {
        context.deny(connection, FORBIDDEN);
      }
    },
  });
  const harness = new Harness([members]);
  assert.deepEqual(snapshot(harness, PAGE), [{ type: "snapshot_declined", snapshot: SNAPSHOT }], "declined, and no denied written");
});

test("REQ-6901: snapshots_false_declines_without_calling_the_application", () => {
  const heard: string[] = [];
  const quiet = twoSubpages(
    {
      joined: (): void => {
        heard.push("joined");
      },
      request: (): void => {
        heard.push("request");
      },
    },
    { snapshots: false },
  );
  const harness = new Harness([quiet]);
  assert.deepEqual(snapshot(harness, PAGE), [{ type: "snapshot_declined", snapshot: SNAPSHOT }]);
  assert.deepEqual(snapshot(harness, OTHER, WHOLE, SNAPSHOT + 1), [{ type: "snapshot_declined", snapshot: SNAPSHOT + 1 }], "a page no application serves");
  assert.deepEqual(heard, []);
});

test("REQ-6901: a_redirect_declines", () => {
  for (const [name, redirect] of [
    [
      "to a page",
      (connection: number, _page: number, context: Context): void => {
        context.redirect(connection, OTHER);
      },
    ],
    [
      "to another channel",
      (connection: number, _page: number, context: Context): void => {
        context.redirect(connection, "news.example");
      },
    ],
  ] as const) {
    const harness = new Harness([twoSubpages({ opened: redirect })]);
    assert.deepEqual(snapshot(harness, PAGE), [{ type: "snapshot_declined", snapshot: SNAPSHOT }], name);
  }
});

test("REQ-6901: a_picture_sent_to_the_snapshot_connection_goes_with_the_page", () => {
  const harness = new Harness([
    twoSubpages({
      opened: (connection, page, context): void => {
        context.regis({ connection }, page, SECOND_SUB, "stale");
        context.regis({ connection }, page, FIRST_SUB, "P[0,0]", { restart: true });
        context.regis({ connection }, page, FIRST_SUB, "V[10,10]");
      },
    }),
  ]);
  const regis = answerOf(snapshot(harness, PAGE));
  assert.deepEqual(regis["picture"], { language: "regis", data: Buffer.from("P[0,0]V[10,10]").toString("base64") }, "a restart, then what adds to it");

  const naplps = new Harness([
    twoSubpages({
      opened: (connection, page, context): void => {
        context.naplps({ connection }, page, FIRST_SUB, Uint8Array.from([0x0e, 0x20]), { restart: true });
        context.naplps({ connection }, page, FIRST_SUB, [Uint8Array.from([0x21]), { text: "Play" }]);
        context.naplpsObjects({ connection }, page, FIRST_SUB, OBJECTS);
      },
    }),
  ]);
  const answer = answerOf(snapshot(naplps, PAGE));
  assert.deepEqual(answer["picture"], {
    language: "naplps",
    parts: [{ data: Buffer.from([0x0e, 0x20, 0x21]).toString("base64") }, { text: "Play" }],
    objects: OBJECTS,
  });

  const large = new Harness([
    twoSubpages({
      opened: (connection, page, context): void => {
        context.regis({ connection }, page, FIRST_SUB, new Uint8Array(MOST_PICTURE_BYTES), { restart: true });
        context.regis({ connection }, page, FIRST_SUB, new Uint8Array(1));
      },
    }),
  ]);
  assert.deepEqual(snapshot(large, PAGE), [{ type: "snapshot_declined", snapshot: SNAPSHOT }], "a picture past 262,144 bytes declines");
});

test("REQ-6901: a_picture_sent_to_a_list_naming_the_snapshot_among_viewers_is_not_gathered", () => {
  let viewer = 0;
  const harness = new Harness([
    twoSubpages({
      opened: (connection, page, context): void => {
        if (!context.isSnapshot(connection)) {
          return;
        }
        // What a list naming viewers carries may be meant for them: a stranger's snapshot holds only what is addressed to a stranger.
        const both = { connections: [connection, viewer] };
        context.regis(both, page, FIRST_SUB, "P[1,1]", { restart: true });
        context.naplps(both, page, SECOND_SUB, Uint8Array.from([0x0e, 0x20]), { restart: true });
        context.naplpsObjects(both, page, SECOND_SUB, OBJECTS);
      },
    }),
  ]);
  viewer = harness.join(1, PAGE);
  const first = snapshot(harness, PAGE);
  assert.deepEqual(
    first.map((line) => [line["type"], line["connections"]]),
    [
      ["regis", [viewer]],
      ["naplps", [viewer]],
      ["naplps_objects", [viewer]],
      ["snapshot_page", undefined],
    ],
    "the list's pictures go to the viewer alone",
  );
  assert.equal(first.at(-1)?.["picture"], undefined, "nothing sent to the list is the snapshot's picture");
  assert.equal(snapshot(harness, PAGE, SECOND_SUB, SNAPSHOT + 1).at(-1)?.["picture"], undefined, "nor the NAPLPS picture of another sub-page");
  assert.deepEqual(harness.errors, []);
});

test("REQ-6901: a_kept_picture_is_named_by_its_sub_code", () => {
  let channel: Context | null = null;
  let keepAtStart = true;
  const harness = new Harness([
    twoSubpages({
      start: (context): void => {
        channel = context;
        context.publishSubpages("channel", PAGE, [{ screen: screen("first") }, { screen: screen("second") }]);
        if (keepAtStart) {
          context.regis({ kept: true }, PAGE, FIRST_SUB, "P[0,0]", { restart: true });
        }
      },
    }),
  ]);
  assert.deepEqual(answerOf(snapshot(harness, PAGE))["picture"], { kept: "0001" });
  assert.equal(answerOf(snapshot(harness, PAGE, SECOND_SUB, SNAPSHOT + 1))["picture"], undefined, "kept for its own sub-page alone (DEC-6599)");
  const call = channel as Context | null;
  assert.ok(call !== null);
  call.forgetPicture(PAGE, FIRST_SUB);
  assert.equal(answerOf(snapshot(harness, PAGE, WHOLE, SNAPSHOT + 2))["picture"], undefined, "forgotten");
  call.regis({ kept: true }, PAGE, FIRST_SUB, "P[0,0]", { restart: true });
  harness.join(1, PAGE);
  call.regis({ connections: "all" }, PAGE, FIRST_SUB, "P[1,1]", { restart: true });
  assert.equal(answerOf(snapshot(harness, PAGE, WHOLE, SNAPSHOT + 3))["picture"], undefined, "a restart to another audience ends it");
  call.regis({ kept: true }, PAGE, FIRST_SUB, "P[0,0]", { restart: true });
  keepAtStart = false;
  harness.restart();
  assert.equal(answerOf(snapshot(harness, PAGE, WHOLE, SNAPSHOT + 4))["picture"], undefined, "start forgets every kept picture");
});

test("REQ-6901: nothing_else_addressed_to_a_snapshot_connection_is_sent", () => {
  let viewer = 0;
  const everything = (connection: number, page: number, context: Context): void => {
    if (!context.isSnapshot(connection)) {
      return;
    }
    const to = { connection };
    const both = { connections: [connection, viewer] };
    const sub = FIRST_SUB;
    context.sound(to, { kind: "play", channel: 0, handle: 1, generation: 1, gain: 100, fade_ms: 0, loop: false, after: false, duck: 0 });
    context.authorLog(to, "I", "a stranger arrived");
    context.packets(to, new Uint8Array());
    context.rules(to, page, sub, null);
    void context.queryState(connection, page, sub).catch(() => null);
    context.localMidi(to, page, sub, 0, { event: "note_on", channel: 0, key: 60, velocity: 100 });
    context.variable(to, page, sub, { op: "set", variable: "v0", value: 1 });
    context.timer(to, page, sub, "start", "t0");
    context.report(to, page, sub, null);
    context.run(to, page, sub, "go");
    context.sequence(to, page, sub, "start", "go");
    context.frame(to, page, sub, () => {
      context.animate(to, page, sub, [{ action: "show", target: { object: 10 } }]);
    });
    context.animate(to, page, sub, [{ action: "hide", target: { object: 10 } }]);
    context.sprites(to, page, sub, []);
    context.spriteSheet(to, page, sub, "regis", "P[0,0]", true);
    context.objectPage(to, page, sub, { page: 0x1c0, s1: 2, global: false, last: true, objects: [] });
    context.stopTimeline(to, page, sub, context.playTimeline(to, page, sub, new Timeline()));
    context.regisLinks(to, page, sub, [{ drawing: 3, target: "201" }]);
    context.regisCursor(to, page, sub, 3);
    context.naplpsLinks(to, page, sub, [{ object: 7, target: "200" }]);
    context.naplpsCursor(to, page, sub, 7);
    context.requestState(connection);
    context.offerRemember(connection);
    context.release(connection, page);
    context.authorLog(both, "I", "to the viewer alone");
  };
  const harness = new Harness([twoSubpages({ opened: everything })]);
  viewer = harness.join(1, PAGE);
  const lines = snapshot(harness, PAGE);
  assert.deepEqual(
    lines.map((line) => [line["type"], line["connections"]]),
    [
      ["author_log", [viewer]],
      ["snapshot_page", undefined],
    ],
    "a list naming the snapshot and others goes to the others alone; the rest is not written",
  );
  assert.deepEqual(harness.errors, []);
});

test("REQ-6901: a_message_to_all_and_a_published_page_never_reach_a_snapshot_connection", () => {
  const harness = new Harness([
    twoSubpages({
      opened: (connection, page, context): void => {
        if (context.isSnapshot(connection)) {
          context.authorLog({ connections: "all" }, "I", "to everyone");
          context.authorLog({ page }, "I", "to the page's viewers");
          context.publishSubpages("channel", page, [{ screen: screen("changed") }, { screen: screen("second") }]);
        }
      },
    }),
  ]);
  const viewer = harness.join(1, PAGE);
  const lines = snapshot(harness, PAGE);
  const named = lines.flatMap((line) => {
    const connections = line["connections"];
    return Array.isArray(connections) ? connections.map((connection: unknown) => connection) : [];
  });
  assert.ok(
    named.every((connection) => connection === viewer),
    `only the viewer is named: ${JSON.stringify(named)}`,
  );
  assert.deepEqual(
    lines.map((line) => line["type"]),
    ["author_log", "author_log", "page", "snapshot_page"],
  );
  assert.match(rowsText(lines.at(-1)?.["page"]), /changed/u, "the channel's copy as it now is");
});

test("REQ-6901: request_state_on_a_snapshot_is_refused_stateless", () => {
  const refused: unknown[] = [];
  const harness = new Harness([
    twoSubpages({
      opened: (connection, _page, context): void => {
        context.requestState(connection);
        refused.push("asked");
      },
      stateRefused: (connection, reason): void => {
        refused.push([connection, reason]);
      },
    }),
  ]);
  const lines = snapshot(harness, PAGE);
  assert.deepEqual(refused, [[-SNAPSHOT, "stateless"], "asked"], "at once, before the call that asked returns");
  assert.equal(answerOf(lines)["type"], "snapshot_page");
});

test("REQ-6901: the_snapshot_connection_is_forgotten_after_its_answer", () => {
  let later: Context | null = null;
  const harness = new Harness([
    twoSubpages({
      opened: (connection, page, context): void => {
        context.publish(connection, page, screen("own"));
      },
      input: (_connection, _page, _input, context): boolean => {
        later = context;
        return true;
      },
    }),
  ]);
  answerOf(snapshot(harness, PAGE));
  assert.equal(harness.channel.copy(-SNAPSHOT, PAGE), undefined, "its own copy went with it");
  const viewer = harness.join(1, PAGE);
  harness.typeText(viewer, "x");
  const call = later as Context | null;
  assert.ok(call !== null);
  assert.equal(call.isSnapshot(-SNAPSHOT), false);
  assert.match(rowsText(answerOf(snapshot(harness, PAGE, WHOLE, SNAPSHOT + 1))["page"]), /own/u, "the next snapshot is drawn afresh");
});

test("REQ-6901: a_handler_that_throws_declines", () => {
  const harness = new Harness([
    twoSubpages({
      opened: (): void => {
        throw new Error("drawing failed");
      },
    }),
  ]);
  assert.deepEqual(snapshot(harness, PAGE), [{ type: "snapshot_declined", snapshot: SNAPSHOT }]);
  assert.equal(harness.errors.length, 1);
  assert.match(harness.errors[0] ?? "", /drawing failed/u);
});

test("REQ-6901: the server's snapshot reaches ServerEvents.snapshot with its page, sub-code and path, and nothing else is a field of it", () => {
  const harness = new Harness([twoSubpages()]);
  const message = readServer({ type: "snapshot", snapshot: SNAPSHOT, page: "200", sub: "0002", path: "200/0002" });
  assert.ok("type" in message);
  const before = harness.sent.length;
  dispatch(message, harness.channel);
  const answer = answerOf(harness.sent.slice(before));
  assert.deepEqual([answer["type"], answer["snapshot"], fieldOf(answer["page"], "sub")], ["snapshot_page", SNAPSHOT, "0002"]);
  const withConnection = readServer({ type: "snapshot", snapshot: SNAPSHOT, page: "200", sub: "3F7F", path: "200", connection: 1 });
  assert.ok(!("type" in withConnection), "a snapshot names no connection");
});

test("REQ-6901: the answer's line is held to the server's rules for its page and picture", () => {
  const pageOf = new Harness([twoSubpages()]);
  const answer = answerOf(snapshot(pageOf, PAGE));
  assert.equal(checkProgram(answer, SERVER_LIMITS), null);
  assert.equal(checkProgram({ ...answer, picture: { kept: "3F7F" } }, SERVER_LIMITS)?.rule, "out_of_range");
  assert.equal(checkProgram({ ...answer, picture: { kept: "0002" } }, SERVER_LIMITS)?.rule, "wrong_page", "a kept picture is the answered sub-page's");
  assert.equal(checkProgram({ ...answer, picture: { kept: "0001" } }, SERVER_LIMITS), null);
  assert.equal(checkProgram({ ...answer, picture: { language: "regis", data: "AA==", objects: [] } }, SERVER_LIMITS)?.rule, "unknown_field");
  assert.equal(
    checkProgram({ ...answer, picture: { language: "regis", data: Buffer.alloc(MOST_PICTURE_BYTES + 1).toString("base64") } }, SERVER_LIMITS)?.rule,
    "too_long",
  );
  assert.equal(checkProgram({ ...answer, connection: 1 }, SERVER_LIMITS)?.rule, "unknown_field", "an answer names no connection");
  assert.equal(checkProgram({ type: "snapshot_declined", snapshot: 0 }, SERVER_LIMITS)?.rule, "out_of_range", "a snapshot's number is 1 or more");
  assert.equal(checkProgram({ type: "snapshot_declined", snapshot: SNAPSHOT }, SERVER_LIMITS), null);
});

test("REQ-6901: the harness's snapshot asks as the server does, numbering each from 1, and gives the one answer", () => {
  const harness = new Harness([twoSubpages({}, {})]);
  const whole = harness.snapshot(PAGE);
  const second = harness.snapshot(PAGE, SECOND_SUB);
  harness.restart();
  const none = harness.snapshot(OTHER);
  assert.deepEqual(
    [whole, second, none].map((answer) => [answer["type"], answer["snapshot"], fieldOf(answer["page"], "sub") ?? null]),
    [
      ["snapshot_page", 1, "0001"],
      ["snapshot_page", 2, "0002"],
      ["snapshot_declined", 3, null],
    ],
  );
});

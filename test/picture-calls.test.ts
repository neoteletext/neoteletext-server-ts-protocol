// The calls of renderer parity (PAR-38): the audience `{ kept: true }` on the
// seven picture calls alone (PAR-16), naplpsLinks and naplpsCursor (PAR-20),
// forgetPicture (PAR-19), a picture's bytes as parts (PAR-21),
// measurePictureText (PAR-22) and a described page's picture (PAR-26). Each
// message is written through the kit's own sending, so the schema of
// 25bc0e7 (9059c09 adds only the rule table's picture commands) and the
// server's rules hold it as it is written.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Context, type PageDescription, type PageEntry, PictureTextRefusedError, ProtocolError, checkProgram } from "../src/index.ts";
import type { ServerMessageMeasuredPictureText, ServerMessageRefused } from "../src/protocol.ts";
import { Harness, SERVER_LIMITS } from "../src/testing/index.ts";
import { pictureFault } from "../src/wire/picture-rules.ts";
import { descriptionFault } from "../src/wire/description-rules.ts";
import { screen } from "./recorder.ts";

const PAGE = 0x200;
const SUB = 1;
const KEPT = { kept: true } as const;

/** A harness whose one application keeps its context from `start`, for the test to call. */
function started(describe?: () => PageDescription): { readonly harness: Harness; readonly context: () => Context } {
  let kept: Context | null = null;
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: PAGE, title: "Pictures" }],
      start: (context): void => {
        kept = context;
        context.publish("channel", PAGE, screen("beneath"));
      },
      joined: (_connection, context): void => {
        kept = context;
      },
      ...(describe === undefined ? {} : { describe }),
    },
  ]);
  return {
    harness,
    context: (): Context => {
      assert.ok(kept !== null);
      return kept;
    },
  };
}

/** The messages written of `types` since `before`. */
function sentOf(harness: Harness, before: number, ...types: readonly string[]): Record<string, unknown>[] {
  return harness.sent.slice(before).filter((message) => types.includes(String(message["type"])));
}

test('PAR-16: the seven picture calls take { kept: true } and write "kept", with no connection open', () => {
  const { harness, context } = started();
  const before = harness.sent.length;
  const call = context();
  call.regis(KEPT, PAGE, SUB, "P[0,0]V[10,10]", { restart: true });
  call.regisLinks(KEPT, PAGE, SUB, [{ drawing: 3, target: "201" }]);
  call.regisCursor(KEPT, PAGE, SUB, 3);
  call.naplps(KEPT, PAGE, SUB, Uint8Array.from([0x0e, 0x20, 0x7f, 0x7f]), { restart: true });
  call.naplpsObjects(KEPT, PAGE, SUB, []);
  call.naplpsLinks(KEPT, PAGE, SUB, [{ object: 7, target: "200" }]);
  call.naplpsCursor(KEPT, PAGE, SUB, 7);
  const sent = sentOf(harness, before, "regis", "regis_links", "regis_cursor", "naplps", "naplps_objects", "naplps_links", "naplps_cursor");
  assert.deepEqual(
    sent.map((message) => [message["type"], message["connections"], message["page"], message["sub"]]),
    ["regis", "regis_links", "regis_cursor", "naplps", "naplps_objects", "naplps_links", "naplps_cursor"].map((type) => [type, "kept", "200", "0001"]),
  );
  assert.deepEqual(sent[5]?.["links"], [{ object: 7, target: "200" }]);
  assert.equal(sent[6]?.["object"], 7);
});

test("PAR-16: { kept: true } is refused by the type checker for every other call, and by the schema on the wire", () => {
  const { context } = started();
  const call = context();
  // At run time the kept audience names no connection for them, so nothing is sent.
  // @ts-expect-error -- only the seven picture calls take the kept audience
  call.packets(KEPT, new Uint8Array());
  // @ts-expect-error -- only the seven picture calls take the kept audience
  call.authorLog(KEPT, "I", "kept");
  const page = { type: "frame", connections: "kept", page: "200", sub: "0001", mark: "begin" };
  assert.equal(checkProgram(page, SERVER_LIMITS)?.path, "connections");
});

test("PAR-19: forgetPicture writes the page and sub-code together and nothing else", () => {
  const { harness, context } = started();
  const before = harness.sent.length;
  context().forgetPicture(PAGE, SUB);
  assert.deepEqual(sentOf(harness, before, "forget_picture"), [{ type: "forget_picture", page: "200", sub: "0001" }]);
  assert.equal(pictureFault({ type: "forget_picture", page: "200", sub: "3F7F" }, SERVER_LIMITS)?.rule, "out_of_range");
  assert.equal(checkProgram({ type: "forget_picture", page: "200", sub: "0001", connections: "all" }, SERVER_LIMITS)?.rule, "unknown_field");
});

test("PAR-20: object links are held as drawing links are, refused as invalid_naplps_links, and a cursor of 0 is none", () => {
  const good = { type: "naplps_links", connections: "all", page: "200", sub: "0001", links: [{ object: 7, target: "200" }] } as const;
  const withLinks = (links: readonly { object: number; target: string }[]): ReturnType<typeof pictureFault> => pictureFault({ ...good, links }, SERVER_LIMITS);
  assert.equal(pictureFault(good, SERVER_LIMITS), null);
  assert.equal(withLinks([]), null);
  const many = Array.from({ length: 65 }, (_unused, index) => ({ object: index + 1, target: "200" }));
  assert.deepEqual([withLinks(many)?.path, withLinks(many)?.rule], ["links", "invalid_naplps_links"]);
  assert.equal(withLinks(many.slice(0, 64)), null);
  assert.deepEqual(
    [withLinks([...good.links, { object: 7, target: "300" }])?.path, withLinks([{ object: 7, target: "2 00" }])?.path],
    ["links[1].object", "links[0].target"],
  );
  assert.equal(checkProgram({ ...good, links: [{ object: 0, target: "200" }] }, SERVER_LIMITS)?.path, "links[0].object");
  assert.equal(checkProgram({ type: "naplps_cursor", connections: "all", page: "200", sub: "0001", object: 0 }, SERVER_LIMITS), null);
  assert.equal(checkProgram({ type: "naplps_cursor", connections: "all", page: "200", sub: "0001", object: 65_536 }, SERVER_LIMITS)?.rule, "out_of_range");
});

test("PAR-21: a list goes as parts, bytes that stand together joined, text with its language and outside only when given", () => {
  const { harness, context } = started();
  harness.join(1, PAGE);
  const before = harness.sent.length;
  context().regis({ connections: "all" }, PAGE, SUB, [
    "P[0,0]",
    Uint8Array.from([0x56]),
    { text: "Καλημέρα", language: "el" },
    "T(A0)",
    { text: "Hi", outside: true },
  ]);
  context().naplps({ connections: "all" }, PAGE, SUB, [Uint8Array.from([0x0e]), { text: "Hi" }]);
  const [regis, naplps] = sentOf(harness, before, "regis", "naplps");
  assert.deepEqual(regis?.["parts"], [
    { data: Buffer.from("P[0,0]V").toString("base64") },
    { text: "Καλημέρα", language: "el" },
    { data: Buffer.from("T(A0)").toString("base64") },
    { text: "Hi", outside: true },
  ]);
  assert.equal(regis?.["data"], undefined, "a list is never data");
  assert.deepEqual(naplps?.["parts"], [{ data: "Dg==" }, { text: "Hi" }]);
  // The line both kits write (DEC-6462, DEC-6792 item 3): the bytes in the place `data` has always taken, before `restart`.
  assert.equal(
    JSON.stringify(naplps),
    '{"type":"naplps","connections":"all","page":"200","sub":"0001","parts":[{"data":"Dg=="},{"text":"Hi"}],"restart":false}',
  );
});

test("PAR-21: exactly one of data and parts, 1 to 64 parts, each part's text and bytes held as the server holds them", () => {
  const base = { type: "regis", connections: "all", page: "200", sub: "0001", restart: false } as const;
  assert.deepEqual(checkProgram(base, SERVER_LIMITS), { path: "data", rule: "missing_field", detail: "a picture message gives `data` or `parts`" });
  assert.equal(checkProgram({ ...base, data: "", parts: [{ text: "a" }] }, SERVER_LIMITS)?.rule, "duplicate_field");
  assert.equal(checkProgram({ ...base, parts: [] }, SERVER_LIMITS)?.path, "parts");
  const many = Array.from({ length: 65 }, () => ({ text: "a" }));
  assert.equal(pictureFault({ ...base, parts: many }, SERVER_LIMITS)?.rule, "invalid_picture_parts");
  assert.equal(pictureFault({ ...base, parts: many.slice(0, 64) }, SERVER_LIMITS), null);
  assert.deepEqual(
    [pictureFault({ ...base, parts: [{ text: "é" }] }, SERVER_LIMITS)?.rule, pictureFault({ ...base, parts: [{ text: "a‮b" }] }, SERVER_LIMITS)?.path],
    ["not_nfc", "parts[0].text"],
  );
  assert.equal(pictureFault({ ...base, parts: [{ data: "not base64!" }] }, SERVER_LIMITS)?.path, "parts[0].data");
  const half = Buffer.alloc(512 * 1024 + 1).toString("base64");
  assert.deepEqual(pictureFault({ ...base, parts: [{ data: half }, { text: "a" }, { data: half }] }, SERVER_LIMITS)?.path, "parts", "the parts' bytes joined");
  assert.notEqual(checkProgram({ ...base, parts: [{ text: "a", colour: 1 }] }, SERVER_LIMITS), null, "a part of neither form");
  assert.equal(checkProgram({ ...base, parts: [{ text: "a".repeat(1001) }] }, SERVER_LIMITS)?.rule, "too_long");
  const { harness, context } = started();
  harness.join(1, PAGE);
  assert.throws(() => {
    context().naplps({ connections: "all" }, PAGE, SUB, []);
  }, ProtocolError);
});

const ANSWER: ServerMessageMeasuredPictureText = {
  type: "measured_picture_text",
  request: 0,
  cells: 12,
  regis_bytes: 96,
  naplps_bytes: 40,
  sets: ["G0-Arabic-Plain"],
  stand_ins: 0,
};

test("PAR-22: measurePictureText asks with a number of its own and resolves to the server's answer in the kit's names", async () => {
  const { harness, context } = started();
  const before = harness.sent.length;
  const first = context().measurePictureText("مرحبا", { language: "ar" });
  const second = context().measurePictureText("Hi");
  assert.deepEqual(sentOf(harness, before, "measure_picture_text"), [
    { type: "measure_picture_text", request: 0, text: "مرحبا", language: "ar" },
    { type: "measure_picture_text", request: 1, text: "Hi" },
  ]);
  harness.channel.measuredPictureText({ ...ANSWER, request: 1, cells: 2, sets: ["G0-Latin-English"] });
  harness.channel.measuredPictureText(ANSWER);
  assert.deepEqual(await first, { cells: 12, regisBytes: 96, naplpsBytes: 40, sets: ["G0-Arabic-Plain"], standIns: 0 });
  assert.equal((await second).cells, 2, "each answer settles the measure of its number");
  harness.channel.measuredPictureText(ANSWER);
  assert.match(harness.errors.at(-1) ?? "", /nothing waits/u);
});

test("PAR-22: a refusal of the measure rejects it; a page's measure of the same number is not its", async () => {
  const { harness, context } = started();
  const measured = context().measurePictureText("中", { language: "en" });
  const refusal: ServerMessageRefused = { type: "refused", message: "measure_picture_text", request: 0, path: "text", rule: "text_unshown", detail: "U+4E2D" };
  harness.channel.refused({ ...refusal, message: "measure" });
  assert.equal(harness.errors.length, 1, "a measure's refusal of the same number is reported, not taken for this one");
  harness.channel.refused(refusal);
  await assert.rejects(measured, (error: unknown) => error instanceof PictureTextRefusedError && error.refusal.rule === "text_unshown");
  assert.equal(pictureFault({ type: "measure_picture_text", request: 2, text: "é" }, SERVER_LIMITS)?.path, "text");
});

const PUBLIC: PageDescription = { public: true, title: "A picture", text: "Its words." };

test("PAR-26: a public page's description carries its picture, kept by sub-code or as bytes", () => {
  const kept = started(() => ({ ...PUBLIC, picture: { kept: SUB } })).harness.describe(PAGE);
  assert.deepEqual(kept["picture"], { kept: "0001" });
  const bytes = started(() => ({ ...PUBLIC, picture: { language: "regis", data: "P[0,0]" } })).harness.describe(PAGE);
  assert.deepEqual(bytes["picture"], { language: "regis", data: Buffer.from("P[0,0]").toString("base64") });
  const none = started(() => PUBLIC).harness.describe(PAGE);
  assert.equal("picture" in none, false);
});

test("PAR-26: a description's picture is held as the server holds it", () => {
  const message = { type: "description", page: "200", public: true, title: "A", text: "B", content: null } as const;
  const fault = (picture: unknown, publicPage = true): ReturnType<typeof checkProgram> =>
    checkProgram({ ...message, public: publicPage, ...(publicPage ? {} : { title: null, text: null }), picture }, SERVER_LIMITS);
  assert.deepEqual([fault({ kept: "0001" }, false)?.path, fault({ kept: "0001" }, false)?.rule], ["picture", "unknown_field"]);
  assert.equal(fault({ kept: "3F7F" })?.path, "picture.kept");
  assert.equal(fault({ language: "regis", data: "", objects: [] })?.path, "picture.objects");
  assert.equal(fault({ language: "teletext", data: "" })?.path, "picture.language");
  const tooMany = Buffer.alloc(262_145).toString("base64");
  assert.equal(fault({ language: "naplps", data: tooMany })?.path, "picture.data");
  // The picture is held before the page beneath, as the server holds it.
  assert.equal(descriptionFault({ ...message, picture: { kept: "0001" } }, SERVER_LIMITS)?.path, "content");
});

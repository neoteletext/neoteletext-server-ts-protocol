// A sub-page's ReGIS (the server's REQ-6338): `context.regis` sends the
// commands as a `regis` message of exact base64, to the audience named,
// with `restart` when asked; and what the server would refuse for its form
// is refused before it is sent.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, Screen } from "../src/index.ts";
import { Harness, SERVER_LIMITS } from "../src/testing/index.ts";
import { checkRules } from "../src/wire/server-rules.ts";

/** A square outlined as numbered drawing 1, then shown. */
const SQUARE = "D(B1)V[0,0][19,0][19,19][0,19][0,0]D(E)D(S1(X100,Y50),C)";

test("regis sends the commands as base64, a restart when asked and none otherwise", () => {
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Picture" }],
    start: (context): void => {
      context.publish("channel", 0x100, new Screen());
    },
    input: (_session, _page, _input, context): void => {
      context.regis({ connections: "all" }, 0x100, 0, SQUARE, { restart: true });
      context.regis({ connections: "all" }, 0x100, 0, new TextEncoder().encode("D(S1(X120),C)"));
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  const before = harness.sent.length;
  harness.typeText(1, "x");
  const sent = harness.sent.slice(before).filter((message) => message["type"] === "regis");
  assert.deepEqual(sent, [
    { type: "regis", connections: "all", page: "100", sub: "0000", restart: true, data: Buffer.from(SQUARE, "latin1").toString("base64") },
    { type: "regis", connections: "all", page: "100", sub: "0000", restart: false, data: Buffer.from("D(S1(X120),C)", "latin1").toString("base64") },
  ]);
});

test("regis for no sub-page, or not exact base64, is refused before it is sent", () => {
  const good = { type: "regis", connections: "all", page: "100", sub: "0000", restart: true, data: Buffer.from(SQUARE).toString("base64") } as const;
  assert.equal(checkRules(good, SERVER_LIMITS), null);
  assert.equal(checkRules({ ...good, data: "" }, SERVER_LIMITS), null, "a restart with nothing drawn yet");
  assert.equal(checkRules({ ...good, sub: "3F7F" }, SERVER_LIMITS)?.rule, "out_of_range");
  assert.equal(checkRules({ ...good, data: "not base64!" }, SERVER_LIMITS)?.rule, "not_base64");
});

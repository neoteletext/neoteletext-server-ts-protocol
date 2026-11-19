// One call for every sound (typescript.md TS-19), bytes as bytes (TS-21),
// and what the server says back reaching an application (TS-22, TS-23).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { type Application, type Context, MeasureRefusedError, type PageEntry, Screen } from "../src/index.ts";
import type { ServerMessageRefused, SoundMember } from "../src/protocol.ts";
import { Harness, SERVER_LIMITS } from "../src/testing/index.ts";
import { MEMBERS } from "./sound-members.ts";

const INDEX = 0x100;

/** A channel whose index page sends what `send` sends when connection 1 types. */
function sending(send: (context: Context) => void, handlers: Partial<Application> = {}): Harness {
  return new Harness([
    {
      pages: (): PageEntry[] => [{ page: INDEX, title: "Index" }],
      start: (context): void => {
        context.publish("channel", INDEX, new Screen());
      },
      input: (_connection, _page, _input, context): void => {
        send(context);
      },
      ...handlers,
    },
  ]);
}

/** The sound lines written, parsed. */
function soundLines(harness: Harness): Readonly<Record<string, unknown>>[] {
  return harness.sent.filter((line) => line["type"] === "sound");
}

test("TS-19: a member of every kind is written as built, with type and connections added and nothing else", () => {
  const harness = sending((context) => {
    for (const member of MEMBERS) {
      context.sound({ connection: 1 }, member);
    }
  });
  harness.join(1, INDEX);
  harness.typeText(1, "x");
  const lines = soundLines(harness);
  assert.equal(lines.length, MEMBERS.length);
  lines.forEach((line, index) => {
    const { type, connections, ...rest } = line;
    assert.equal(type, "sound");
    assert.deepEqual(connections, [1]);
    assert.deepEqual(Object.keys(rest), Object.keys(MEMBERS[index] ?? {}), "the member's own fields, in its order");
  });
  assert.deepEqual(harness.sounds(1), MEMBERS, "read back, each is the member built, bytes as bytes");
});

test("TS-19, RULE-61: the members are one of every kind the schema gives, the local sounds among them, in its order", () => {
  // Read as text, as the language tags' test reads the schema: the kinds are the consts of the schema's SoundKind.
  const schema = readFileSync(join(import.meta.dirname, "..", "schema", "protocol-16.json"), "utf8");
  const kinds = /"SoundKind": \{.*?\n {4}\},\n/su.exec(schema)?.[0] ?? "";
  assert.deepEqual(
    MEMBERS.map((member) => member.kind),
    [...kinds.matchAll(/"const": "(\w+)"/gu)].map((found) => found[1]),
  );
});

test("RULE-61: a local sound and its play are written as the document's JSON, field for field", () => {
  const harness = sending((context) => {
    const everyone = { connections: "all" } as const;
    context.sound(everyone, {
      kind: "synth106_local",
      handle: 1,
      generation: 1,
      banks: [2],
      setup: [{ event: "program_change", channel: 1, program: 0, time_us: 0 }],
    });
    context.sound(everyone, { kind: "play", channel: 0, handle: 1, generation: 1, gain: 100, fade_ms: 5, duck: 0, loop: false, after: false, page: "101" });
  });
  harness.join(1, INDEX);
  harness.typeText(1, "x");
  // The document's two lines; the kit writes `connections` before the member's own fields (TS-19), so they are compared as values.
  assert.deepEqual(soundLines(harness), [
    JSON.parse(
      '{"type":"sound","kind":"synth106_local","connections":"all","handle":1,"generation":1,"banks":[2],"setup":[{"event":"program_change","channel":1,"program":0,"time_us":0}]}',
    ),
    JSON.parse(
      '{"type":"sound","kind":"play","connections":"all","channel":0,"handle":1,"generation":1,"gain":100,"fade_ms":5,"duck":0,"loop":false,"after":false,"page":"101"}',
    ),
  ]);
});

test("TS-19: an audience is chunked by start's named_connections, lines in the order of the calls, nothing for no connection", () => {
  const stop: SoundMember = { kind: "stop", channel: 0, fade_ms: 0 };
  const gain: SoundMember = { kind: "gain", channel: 1, gain: 10, fade_ms: 0 };
  const harness = new Harness(
    [
      {
        pages: (): PageEntry[] => [{ page: INDEX, title: "Index" }],
        start: (context): void => {
          context.publish("channel", INDEX, new Screen());
        },
        input: (connection, _page, _input, context): void => {
          context.sound({ connections: [1, 2, 3, 4, 5] }, stop);
          context.sound({ page: INDEX }, gain);
          context.sound({ connections: [] }, stop);
          context.sound({ page: 0x200 }, stop);
          context.sound({ connection: 99 }, stop);
          context.sound({ connections: "all" }, gain);
          context.sound({ connection }, stop);
        },
      },
    ],
    { limits: { ...SERVER_LIMITS, budgets: { ...SERVER_LIMITS.budgets, namedConnections: 2 } } },
  );
  for (const connection of [1, 2, 3, 4, 5]) {
    harness.join(connection, INDEX);
  }
  harness.typeText(1, "x");
  assert.deepEqual(
    soundLines(harness).map((line) => [line["kind"], line["connections"]]),
    [
      ["stop", [1, 2]],
      ["stop", [3, 4]],
      ["stop", [5]],
      ["gain", [1, 2]],
      ["gain", [3, 4]],
      ["gain", [5]],
      ["gain", "all"],
      ["stop", [1]],
    ],
  );
  assert.deepEqual(harness.soundsToEveryone(), [gain]);
});

test("TS-21: bytes are written as their exact base64, RFC 4648 section 10's vectors as the standard gives them", () => {
  const vectors: readonly [string, string][] = [
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg=="],
    ["fooba", "Zm9vYmE="],
    ["foobar", "Zm9vYmFy"],
  ];
  const harness = sending((context) => {
    for (const [text] of vectors) {
      context.sound(
        { connection: 1 },
        { kind: "synth7_bank", handle: 1, generation: 0, bank: { form: "patches", patches: [{ form: "bytes", bytes: new TextEncoder().encode(text) }] } },
      );
    }
  });
  harness.join(1, INDEX);
  harness.typeText(1, "x");
  assert.deepEqual(
    soundLines(harness).map(
      (line) =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a synth7_bank line held to the schema
        (line["bank"] as { patches: { bytes: string }[] }).patches[0]?.bytes,
    ),
    vectors.map(([, base64]) => base64),
  );
});

test("TS-21: a synth7 patch given as bytes is written as the exact base64 of the bytes", () => {
  const bytes = Uint8Array.from({ length: 163 }, (_, index) => index);
  const harness = sending((context) => {
    context.sound({ connection: 1 }, { kind: "synth7_bank", handle: 1, generation: 0, bank: { form: "patches", patches: [{ form: "bytes", bytes }] } });
  });
  harness.join(1, INDEX);
  harness.typeText(1, "x");
  assert.deepEqual(soundLines(harness)[0]?.["bank"], { form: "patches", patches: [{ form: "bytes", bytes: Buffer.from(bytes).toString("base64") }] });
});

/** An application that records the refusals and reports it hears. */
function hearing(heard: unknown[]): Partial<Application> {
  return {
    refused: (refusal): void => {
      heard.push(refusal);
    },
    soundBuilt: (report): void => {
      heard.push(report);
    },
  };
}

test("TS-22: a refusal of a sound reaches every application's refused, typed and unchanged, in their order", () => {
  const first: unknown[] = [];
  const second: unknown[] = [];
  const play: SoundMember = { kind: "play", channel: 0, handle: 4, generation: 0, gain: 80, fade_ms: 0, loop: false, after: false, duck: 0 };
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: INDEX, title: "Index" }],
      start: (context): void => {
        context.publish("channel", INDEX, new Screen());
      },
      joined: (connection, context): void => {
        context.sound({ connection }, play);
      },
      ...hearing(first),
    },
    { pages: (): PageEntry[] => [], start: (): void => undefined, ...hearing(second) },
  ]);
  harness.join(1, INDEX);
  harness.refuse(play, "", "unknown_live_sound", "no sound 4 of generation 0");
  const refusal: ServerMessageRefused = {
    type: "refused",
    message: "sound",
    path: "",
    rule: "unknown_live_sound",
    detail: "no sound 4 of generation 0",
    sound: { kind: "play", handle: 4, generation: 0 },
  };
  assert.deepEqual(first, [refusal]);
  assert.deepEqual(second, [refusal]);
  assert.deepEqual(harness.errors, []);
});

test("TS-22: with no refused handler a refusal is reported as before, and a measure's refusal rejects its promise and reaches no handler", async () => {
  const play: SoundMember = { kind: "play", channel: 0, handle: 4, generation: 0, gain: 80, fade_ms: 0, loop: false, after: false, duck: 0 };
  let measured: Promise<unknown> | null = null;
  const unheard = sending((context) => {
    context.sound({ connection: 1 }, play);
    measured = context.measure(INDEX, new Screen());
  }, {});
  unheard.join(1, INDEX);
  unheard.typeText(1, "x");
  unheard.refuse(play, "", "unknown_live_sound", "no such sound");
  assert.match(unheard.errors.at(-1) ?? "", /the server refused sound: the message: unknown_live_sound \(no such sound\)/u);
  const heard: unknown[] = [];
  const harness = sending((context) => {
    measured = context.measure(INDEX, new Screen());
  }, hearing(heard));
  harness.join(1, INDEX);
  harness.typeText(1, "x");
  harness.channel.refused({ type: "refused", message: "measure", request: 0, path: "page", rule: "reserved", detail: "d" });
  await assert.rejects(measured ?? Promise.resolve(), MeasureRefusedError);
  assert.deepEqual(heard, []);
});

test("TS-23: a report of a sound reaches soundBuilt unchanged, and one no application hears is passed over without a word", () => {
  const sound: SoundMember = {
    kind: "synth7",
    handle: 41,
    generation: 0,
    banks: [9],
    lift_banks: [],
    length: { tail_us: 0 },
    music: { form: "events", events: [] },
  };
  const report = {
    blocks: 1,
    bytes: 0,
    longest_block: 0,
    banks_lifted: [],
    dropped: { not_taken: 0, unmapped_channel: 0, system_messages: 0, escapes: 0, meta_events: 0 },
  };
  const heard: unknown[] = [];
  const harness = sending((context) => {
    context.sound({ connection: 1 }, sound);
  }, hearing(heard));
  harness.join(1, INDEX);
  harness.typeText(1, "x");
  harness.report(sound, report);
  assert.deepEqual(heard, [{ type: "sound_built", kind: "synth7", handle: 41, generation: 0, ...report }]);
  const quiet = sending((context) => {
    context.sound({ connection: 1 }, sound);
  });
  quiet.join(1, INDEX);
  quiet.typeText(1, "x");
  quiet.report(sound, report);
  assert.deepEqual(quiet.errors, []);
});

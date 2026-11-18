// A sound is held to the schema before it is written, and to nothing else
// (typescript.md TS-16, TS-17): what the schema states is thrown where the
// program makes the mistake, in the server's words; what only the server's
// rules say is written unchanged, for the server's refusal.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProgram, ProtocolError } from "../src/index.ts";
import type { SoundMember } from "../src/protocol.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";
import { App } from "../src/wire/app.ts";
import { encodeBytes } from "../src/wire/bytes.ts";
import { MEMBERS } from "./sound-members.ts";

/** A member's line as its line carries it, with `change` made to it. */
function lineOf(member: SoundMember, change: (line: Record<string, unknown>) => Record<string, unknown>): unknown {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a sound message as its line carries it, an object
  const line = encodeBytes({ type: "sound", connections: [1], ...member }, "ProgramMessage") as Record<string, unknown>;
  return change(line);
}

/** A line's first event. */
function firstEvent(line: Readonly<Record<string, unknown>>): object {
  const events = line["events"];
  const [event] = Array.isArray(events) ? (events as unknown[]) : [];
  return typeof event === "object" && event !== null ? event : {};
}

function faultOf(line: unknown): { readonly path: string; readonly rule: string } | null {
  const fault = checkProgram(line, SERVER_LIMITS);
  return fault === null ? null : { path: fault.path, rule: fault.rule };
}

const SYNTHESIZERS = MEMBERS.filter((member) => member.kind.startsWith("synth"));

test("TS-16: for each synthesizer kind, a missing field, a wrong type and a value out of range are refused at the server's path and rule", () => {
  assert.equal(SYNTHESIZERS.length, 51, "the 42 synthesizer kinds of SRV-3 and the 9 local sounds of page-rules.md RULE-61");
  for (const member of SYNTHESIZERS) {
    assert.deepEqual(faultOf(lineOf(member, ({ handle: _handle, ...rest }) => rest)), { path: "", rule: "missing_field" }, `${member.kind} without its handle`);
    assert.deepEqual(faultOf(lineOf(member, (line) => ({ ...line, handle: "3" }))), { path: "handle", rule: "wrong_type" }, member.kind);
    assert.deepEqual(faultOf(lineOf(member, (line) => ({ ...line, handle: 256 }))), { path: "handle", rule: "out_of_range" }, member.kind);
  }
});

test("TS-16: an unknown field in an event and a list longer than the schema's bound are refused", () => {
  for (const member of SYNTHESIZERS) {
    if ("banks" in member) {
      assert.deepEqual(
        faultOf(lineOf(member, (line) => ({ ...line, banks: Array.from({ length: 11 }, () => 1) }))),
        { path: "banks", rule: "too_long" },
        member.kind,
      );
    }
    if ("events" in member) {
      const fault = faultOf(lineOf(member, (line) => ({ ...line, events: [{ ...firstEvent(line), bogus: 1 }] })));
      assert.deepEqual(fault, { path: "events[0]", rule: "unknown_field" }, member.kind);
    }
  }
});

test("TS-16: a sound the schema refuses throws a ProtocolError and nothing is written", () => {
  const lines: string[] = [];
  const app = new App((line) => {
    lines.push(line);
  });
  app.started(SERVER_LIMITS, []);
  assert.throws(
    () => {
      app.send({ type: "sound", connections: [1], kind: "stop", channel: 4, fade_ms: 0 });
    },
    (error: unknown) => error instanceof ProtocolError && error.fault.path === "channel" && error.fault.rule === "out_of_range",
  );
  assert.deepEqual(lines, []);
});

/** Members that break a rule only the server holds, one of each item of TS-17's list. */
const UNCHECKED: readonly SoundMember[] = [
  // Events out of time order, and past the sound's length.
  {
    kind: "synth7",
    handle: 1,
    generation: 0,
    banks: [9],
    lift_banks: [],
    length: { length_us: 1 },
    music: {
      form: "events",
      events: [
        { event: "note_on", time_us: 5_000_000, channel: 1, key: 60, velocity: 1 },
        { event: "note_on", time_us: 0, channel: 1, key: 60, velocity: 1 },
      ],
    },
  },
  // An until_us that does not pass its events.
  { kind: "synth106_events", handle: 1, generation: 0, until_us: 5, events: [{ event: "note_on", time_us: 10, channel: 1, key: 60, velocity: 1 }] },
  // A bank's bytes that are no dump, and a bank of the wrong family named.
  { kind: "synth53_bank", handle: 2, generation: 0, bank: { form: "bytes", bytes: new Uint8Array([1, 2, 3]) } },
  {
    kind: "synth80",
    handle: 1,
    generation: 0,
    banks: [2],
    lift_banks: [7, 8].map((handle) => ({ handle, generation: 0 })),
    length: { tail_us: 0 },
    music: { form: "events", events: [] },
  },
  // A Standard MIDI File that is not one.
  {
    kind: "synthd",
    handle: 1,
    generation: 0,
    banks: [1],
    lift_banks: [],
    length: { tail_us: 0 },
    music: {
      form: "midi_file",
      bytes: new Uint8Array([0]),
      channel_map: [1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    },
  },
  // A stored synth6581 sound that does not begin with a full register update.
  {
    kind: "synth6581",
    handle: 1,
    generation: 0,
    clock: "pal",
    length: { tail_us: 0 },
    music: { form: "events", events: [{ event: "register_update", time_us: 0, registers: { voice1_control: 1 } }] },
  },
  // Samples of an odd number of bytes, and an Opus packet of no profile.
  { kind: "object", handle: 1, generation: 0, rate: 8_000, pcm: new Uint8Array([1, 2, 3]) },
  { kind: "opus", handle: 1, generation: 0, packet_bytes: 40, samples: 1, packets: new Uint8Array(7) },
];

test("TS-17: what only the server's rules say is written unchanged", () => {
  for (const member of UNCHECKED) {
    assert.equal(faultOf(lineOf(member, (line) => line)), null, member.kind);
  }
});

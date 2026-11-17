// REQ-1033: the kit holds no limit of its own. Every bound the server gives
// in `start` is read from the limits it gave, so no number in the kit's
// source equals one of `start`'s figures, except where the same number
// means something else, each named here with what it is (TODO-2056 item 3).
// The figures the test harness stands in for the server with
// (src/testing) and the validators generated from the schema are left out.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import type { Budgets, Standard } from "../src/index.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";

const SOURCE = new URL("../src/", import.meta.url).pathname;
/** What is not the kit's own code: the server's stand-in for tests, and Ajv's output. */
const LEFT_OUT = new Set(["testing", "generated"]);
/** The smallest figure looked for: below it, a number is a count of columns, links or bits far more often than a limit. */
const SMALLEST = 100;

/** Numbers equal to one of start's figures that are not that figure, by file and the name they are given. */
const NOT_LIMITS: ReadonlyMap<string, string> = new Map([
  ["page/page-numbers.ts RESERVED_IN_EVERY_MAGAZINE", "page mFD, 0xFD, a page number Annex A.10 reserves, not the 253 pages a magazine may have"],
  ["sound/synth7-slot.ts ALL_SOUND_OFF", "MIDI's controller 120, All Sound Off, not a title's characters"],
  ["sound/ffmpeg-opus.ts MILLISECOND_US", "microseconds in a millisecond"],
  ["sound/midi-file.ts MICROSECONDS_A_MS", "microseconds in a millisecond"],
  ["sound/ogg-opus.ts LONGEST_HEADER", "the longest Ogg Opus header the reader takes (RFC 7845), not the connections a message may name"],
  ["sound/profile.ts SAMPLE_RATES", "the sample rates the server takes, 16,000 among them"],
  ["sound/profile.ts MOST_SAMPLES", "120 seconds of samples, not a title's characters"],
  ["sound/profile.ts SECOND_MS", "milliseconds in a second"],
  ["sound/profile.ts OPUS_BITRATE", "the Opus profile's 16,000 bits a second (the engine's DEC-647)"],
  ["wire/connection-rules.ts COOKIE_BYTES", "a cookie field's 4,096 bytes (RFC 6265 section 6.1), which start does not give"],
  [
    "wire/socket.ts FIRST_PAUSE_MS",
    "the first pause before connecting to the server's socket again, one second as the server's own FIRST_PAUSE, not a log line's characters",
  ],
  ["wire/protocol.ts WireSampleRate", "the sample rates the server takes, 16,000 among them"],
]);

function figures(): Set<number> {
  const standard: Readonly<Record<keyof Standard, number>> = SERVER_LIMITS.standard;
  const budgets: Readonly<Record<keyof Budgets, number>> = SERVER_LIMITS.budgets;
  const all = [...Object.values(standard), ...Object.values(budgets)];
  return new Set(all.filter((figure) => figure >= SMALLEST));
}

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return LEFT_OUT.has(entry.name) ? [] : sources(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** A line's code, without its comment. */
function code(line: string): string {
  return line.trimStart().startsWith("*") ? "" : line.replace(/\/\/.*$/u, "").replaceAll(/\/\*.*?\*\//gu, "");
}

test("REQ-1033: no number in the kit's source is one of start's figures, but those that mean something else", () => {
  const limits = figures();
  const found: string[] = [];
  for (const path of sources(SOURCE)) {
    const file = relative(SOURCE, path);
    for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
      const text = code(line);
      const name = /(?:const|type) (\w+)/u.exec(text)?.[1] ?? "";
      for (const literal of text.matchAll(/(?<![\w.])(0x[0-9a-fA-F_]+|\d[\d_]*)(?![\w.])/gu)) {
        const value = Number((literal[1] ?? "").replaceAll("_", ""));
        if (limits.has(value) && !NOT_LIMITS.has(`${file} ${name}`)) {
          found.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      }
    }
  }
  assert.deepEqual(found, []);
});

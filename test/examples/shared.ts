// What every worked example's test shares (typescript.md section 4.0, TS-43):
// the lines of the shared fixture, test/fixtures/examples.jsonl, a copy of
// neoteletext-common's docs/audio/examples.jsonl that both kits' examples must
// write; the example's input files; and the sound lines a channel wrote.
//
// The inputs of section 4.0 that are files (a synth7 voice dump, two synth53
// program dumps, synthD's 60 and synth80's 85 values, a Standard MIDI File)
// were built by neoteletext-common from the family documents with a script
// that is not kept, and the fixture carries their bytes: they are taken from
// it here, each checked against the length section 4.0 gives it, so that the
// example reads a file as a program would.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Screen, type Application, type PageEntry } from "../../src/index.ts";
import type { Harness, Sent } from "../../src/testing/index.ts";

/** One line of the fixture. */
interface FixtureLine {
  readonly example: string;
  readonly message: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A line of the fixture: exactly `example` and `message` (TS-2 item 2). */
function isFixtureLine(value: unknown): value is FixtureLine {
  return isRecord(value) && Object.keys(value).length === 2 && typeof value["example"] === "string" && isRecord(value["message"]);
}

function fixture(): FixtureLine[] {
  const text = readFileSync(join(import.meta.dirname, "..", "fixtures", "examples.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      assert.ok(isFixtureLine(parsed), line);
      return parsed;
    });
}

/** The messages the fixture holds for `example`, in order. */
export function expected(example: string): Readonly<Record<string, unknown>>[] {
  const lines = fixture()
    .filter((line) => line.example === example)
    .map((line) => line.message);
  assert.ok(lines.length > 0, `the fixture has no lines of ${example}`);
  return lines;
}

/** The `sound` lines the channel wrote, in order, as parsed JSON. */
export function soundLines(harness: Harness): Sent[] {
  return harness.sent.filter((line) => line["type"] === "sound");
}

/** What `step` names in `container`: an index of a list, or a field of an object. */
function stepInto(container: unknown, step: string | number): unknown {
  if (Array.isArray(container)) {
    const items: readonly unknown[] = container;
    return typeof step === "number" ? items[step] : undefined;
  }
  return isRecord(container) ? container[String(step)] : undefined;
}

/** The bytes at `path` (property names and indexes) of the fixture's line `index` of `example`: an input the fixture carries. */
export function inputOf(example: string, index: number, path: readonly (string | number)[], length: number): Uint8Array {
  let at: unknown = expected(example)[index];
  for (const step of path) {
    at = stepInto(at, step);
    assert.notEqual(at, undefined, `${example}: ${path.join(".")}`);
  }
  assert.equal(typeof at, "string", `${example}: ${path.join(".")} is base64`);
  const bytes = new Uint8Array(Buffer.from(String(at), "base64"));
  assert.equal(bytes.length, length, `${example}: the input is ${length} bytes (section 4.0)`);
  return bytes;
}

/** `bytes` as a file named `name`, for an example that reads its input from a file as a program does. */
export function inputFile(name: string, bytes: Uint8Array): string {
  const file = join(mkdtempSync(join(tmpdir(), "kit-example-")), name);
  writeFileSync(file, bytes);
  return file;
}

/** The index page every example's channel has, so that a connection is answered with a page. */
export const INDEX = 0x100;

/** An application of the example's pages, each published with its number, around the example's own handlers. */
export function serving(pages: readonly number[], handlers: Omit<Application, "pages" | "start">): Application {
  return {
    pages: (): PageEntry[] => [INDEX, ...pages].map((page) => ({ page, title: page.toString(16) })),
    start: (context): void => {
      for (const page of [INDEX, ...pages]) {
        const screen = new Screen();
        screen.text(1, 0, page.toString(16));
        context.publish("channel", page, screen);
      }
    },
    ...handlers,
  };
}

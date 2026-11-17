// What the program wrote, as the harness reads it back: each line parsed.

import { PAGE_RADIX } from "../page/page-numbers.ts";
import type { ReadPage } from "../page/content.ts";
import { isFields } from "../wire/fields.ts";

/** A line the program wrote, parsed. */
export type Sent = Readonly<Record<string, unknown>>;

/** A page as the protocol writes it, "1A0", as a number. */
export function pageOf(value: unknown): number | undefined {
  return typeof value === "string" ? Number.parseInt(value, PAGE_RADIX) : undefined;
}

export function last(pages: readonly ReadPage[]): ReadPage {
  const page = pages.at(-1);
  if (page === undefined) {
    throw new Error("a publication with no sub-page");
  }
  return page;
}

/** A line the program wrote, parsed; a line that is not a JSON object fails the test that drew it. */
export function parseSent(line: string): Sent {
  const message: unknown = JSON.parse(line);
  if (!isFields(message)) {
    throw new TypeError(`the program wrote a line that is not a JSON object: ${line}`);
  }
  return message;
}

/** Whether a message's `connections` name `connection`, or are every connection. */
export function isFor(connections: unknown, connection: number): boolean {
  return connections === "all" || (Array.isArray(connections) && connections.includes(connection));
}

/** The fields of a sound line that carry bytes, by kind: a synth6581 sound's images, a synth7 sound's blocks, a bank's patches, Opus packets and samples. */
const BYTE_FIELDS = ["images", "blocks", "patches", "packets", "pcm"] as const;

/** The bytes a sound line carries, as the program gave them: a `synth6581` line's images, a `synth7` line's blocks, a `synth7_bank` line's patches, an Opus line's packets or a line of samples' 16-bit little-endian PCM. A line that carries none, such as a command, fails the test that asked. */
export function soundBytes(sent: Sent): Uint8Array {
  for (const field of BYTE_FIELDS) {
    const text = sent[field];
    if (typeof text === "string") {
      return new Uint8Array(Buffer.from(text, "base64"));
    }
  }
  throw new TypeError(`a ${String(sent["kind"])} line carries no bytes`);
}

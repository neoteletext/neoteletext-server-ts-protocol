// The line loop: standard input to the program's events. Standard output
// carries protocol lines and nothing else; anything for a person goes to
// standard error, which the server logs.

import { PROTOCOL } from "./limits.ts";
import { LineSplitter } from "./line-splitter.ts";
import { type ServerEvents, dispatch } from "./server-events.ts";
import { readMessage } from "./server-message.ts";

/** Where a program reads and writes: the process's own streams, or a test's. */
export interface Streams {
  readonly input: NodeJS.ReadableStream;
  readonly output: (line: string) => void;
  readonly errors: (text: string) => void;
}

/** The process's standard input, output and error. */
export function processStreams(): Streams {
  return {
    input: process.stdin,
    output: (line) => {
      process.stdout.write(`${line}\n`);
    },
    errors: (text) => {
      process.stderr.write(`${text}\n`);
    },
  };
}

/**
 * The line loop: hands each valid line from `streams.input` to `events`,
 * reports each bad one on `streams.errors`, and resolves when the input
 * ends, which is the server going away.
 */
export function serveLines(events: ServerEvents, streams: Streams): Promise<void> {
  const splitter = new LineSplitter(
    (line) => {
      const message = readMessage(line);
      if (typeof message === "string") {
        streams.errors(`refused a line from the server: ${message}`);
        return;
      }
      if (message.type === "start" && message.protocol !== PROTOCOL) {
        streams.errors(`the server speaks protocol ${message.protocol}; this kit speaks ${PROTOCOL}`);
      }
      dispatch(message, events);
    },
    (why) => {
      streams.errors(`refused a line from the server: ${why}`);
    },
  );
  return new Promise((resolve) => {
    streams.input.on("data", (chunk: Buffer | string) => {
      splitter.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    streams.input.on("end", () => {
      splitter.end();
      resolve();
    });
  });
}

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

/**
 * The process's standard input, output and error.
 *
 * Each line is written the moment it is sent, as REQ-1348 asks: Node keeps
 * no output buffer of its own, and on a pipe `write` hands the line to the
 * operating system within the call, queueing in libuv only what a full pipe
 * will not take, until the reader drains it. Measured on macOS with Node 24,
 * a line reached the reader while the writer's event loop was blocked;
 * test/pipe.test.ts holds the kit to it.
 */
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

/** The server speaks another protocol than the kit: the program stops before it sends anything (REQ-2215 item 3). */
export class ProtocolVersionError extends Error {
  readonly server: number;

  constructor(server: number) {
    super(`the server speaks protocol ${server}; this kit speaks protocol ${PROTOCOL}, and stops`);
    this.name = "ProtocolVersionError";
    this.server = server;
  }
}

/**
 * The protocol a `start` line names when it is not the kit's, read before
 * the schema, which would refuse it only as a value not listed; null for
 * any other line.
 */
function otherProtocol(line: string): number | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !("type" in value) || value.type !== "start" || !("protocol" in value)) {
    return null;
  }
  const { protocol } = value;
  return typeof protocol === "number" && protocol !== PROTOCOL ? protocol : null;
}

/**
 * The line loop: hands each valid line from `streams.input` to `events`,
 * reports each bad one on `streams.errors`, and resolves when the input
 * ends or closes, which is the server going away. A `start` of another protocol
 * stops it at once, nothing handed on: it rejects with a
 * {@link ProtocolVersionError} naming both versions.
 */
export function serveLines(events: ServerEvents, streams: Streams): Promise<void> {
  return new Promise((resolve, reject) => {
    let stopped = false;
    const splitter = new LineSplitter(
      (line) => {
        if (stopped) {
          return;
        }
        const other = otherProtocol(line);
        if (other !== null) {
          stopped = true;
          const error = new ProtocolVersionError(other);
          streams.errors(error.message);
          streams.input.removeAllListeners("data");
          streams.input.removeAllListeners("end");
          streams.input.pause();
          reject(error);
          return;
        }
        const message = readMessage(line);
        if (typeof message === "string") {
          streams.errors(`refused a line from the server: ${message}`);
          return;
        }
        dispatch(message, events);
      },
      (why) => {
        streams.errors(`refused a line from the server: ${why}`);
      },
    );
    streams.input.on("data", (chunk: Buffer | string) => {
      splitter.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    streams.input.on("end", () => {
      splitter.end();
      resolve();
    });
    // A socket that fails closes without ending: the server is gone as
    // surely, and a line it cut short is not a line.
    streams.input.on("close", () => {
      resolve();
    });
  });
}

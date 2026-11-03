// A program that runs as a service of its own reaches its channel over a
// Unix domain socket the server listens on (the server's REQ-1043, its
// decision 17): the same lines as over standard input and output, and a
// connection made again whenever the server goes.

import { connect, type Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { type ServerEvents } from "./server-events.ts";
import { serveLines } from "./streams.ts";

/**
 * The environment variable that names the socket a program connects to, a
 * path (DEC-2452). Unset or empty, the program speaks on its standard input
 * and output, as a program the server starts does.
 */
export const SOCKET_VARIABLE = "NEOTELETEXT_SOCKET";

/**
 * The pause before connecting again after a connection that failed or that
 * went before `start` came, doubled each time up to {@link LONGEST_PAUSE_MS}.
 * The server's own pauses before starting a program again, `FIRST_PAUSE` and
 * `LONGEST_PAUSE` in neoteletext-app-server's `crates/teletext-native/src/apps.rs`.
 */
const FIRST_PAUSE_MS = 1000;
/** The longest pause before connecting again. */
const LONGEST_PAUSE_MS = 30_000;

/** The socket `environment` names, or null when the program speaks on its standard streams. */
export function socketPath(environment: NodeJS.ProcessEnv): string | null {
  const path = environment[SOCKET_VARIABLE];
  return path === undefined || path === "" ? null : path;
}

/** A connection to `path`, or the reason none was made. */
function connectTo(path: string): Promise<Socket | Error> {
  return new Promise((resolve) => {
    const socket = connect({ path });
    const failed = (error: Error): void => {
      socket.destroy();
      resolve(error);
    };
    socket.once("error", failed);
    socket.once("connect", () => {
      socket.off("error", failed);
      resolve(socket);
    });
  });
}

/** Where a connection's lines go, or null while none is open. */
type SetOutput = (write: ((line: string) => void) | null) => void;

/** Nothing: over a socket the program's lines go through {@link SetOutput}, not the streams. */
function unused(): void {
  // The line loop never writes; it only reads.
}

/**
 * One connection to `path`, served until it goes: true when the server said
 * `start` on it, false when it failed or went before `start`.
 */
async function serveConnection(events: ServerEvents, path: string, setOutput: SetOutput, errors: (text: string) => void): Promise<boolean> {
  const socket = await connectTo(path);
  if (socket instanceof Error) {
    errors(`cannot connect to ${path}: ${socket.message}`);
    return false;
  }
  let heardStart = false;
  socket.on("error", (error) => {
    errors(`the connection to ${path} failed: ${error.message}`);
  });
  setOutput((line) => {
    if (socket.writable) {
      socket.write(`${line}\n`);
    }
  });
  const heard: ServerEvents = {
    ...events,
    start(epochMs, limits, languages): void {
      heardStart = true;
      events.start(epochMs, limits, languages);
    },
  };
  try {
    await serveLines(heard, { input: socket, output: unused, errors });
  } finally {
    setOutput(null);
    socket.destroy();
  }
  return heardStart;
}

/**
 * One connection to `path` and, when it did not hear `start`, the pause
 * after it: the pause to take after the next failure.
 */
async function attempt(events: ServerEvents, path: string, setOutput: SetOutput, errors: (text: string) => void, pause: number): Promise<number> {
  if (await serveConnection(events, path, setOutput, errors)) {
    errors(`the server closed ${path}; connecting again`);
    return FIRST_PAUSE_MS;
  }
  errors(`connecting to ${path} again in ${pause} ms`);
  await sleep(pause);
  return Math.min(pause * 2, LONGEST_PAUSE_MS);
}

/**
 * Serves `events` over the Unix domain socket at `path`, never ending of
 * itself: it connects, hears the server's lines until the connection goes,
 * and connects again. After a connection that heard `start` it connects
 * again at once, since the server went after serving it; after one that
 * failed, or that the server closed before `start` (a second program is
 * closed, one at a time), it waits, longer each time, up to
 * {@link LONGEST_PAUSE_MS}. Each connection is a session afresh: the server
 * sends `start` on it, which ends every session the program knew (REQ-1056).
 * Lines written while no connection is open are dropped, as the server drops
 * those that waited for a program that went. Rejects only as
 * {@link serveLines} does, on a `start` of another protocol.
 */
export async function serveSocket(events: ServerEvents, path: string, setOutput: SetOutput, errors: (text: string) => void): Promise<never> {
  let pause = FIRST_PAUSE_MS;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each connection follows the one before it went: one at a time, as the server takes them
    pause = await attempt(events, path, setOutput, errors, pause);
  }
}

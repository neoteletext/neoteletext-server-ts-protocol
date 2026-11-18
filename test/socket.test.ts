// The server's REQ-1043 (TODO-1299): a program that runs as a service of its
// own reaches its channel over the Unix domain socket NEOTELETEXT_SOCKET
// names. The test listens there as the server does, and the fixture channel
// runs as a child: it connects, hears `start` and a viewer, and answers; the
// connection is closed, as when the server goes, and the program connects
// again, hears `start` afresh and answers the same viewer number again. A kit
// that speaks only its standard streams never connects.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";

import { parseSent, type Sent } from "../src/testing/sent.ts";
import { SOCKET_VARIABLE } from "../src/wire/socket.ts";
import { START_LINE } from "./fixtures/start-line.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
/**
 * The repository's scratch folder, ignored by git, named from the working
 * directory, which the program started below shares: a socket's path may be
 * no longer than 104 bytes on macOS and 108 on Linux, which the folder's
 * whole path passes in a checkout that lies deep, such as a worktree.
 */
const SCRATCH = relative(process.cwd(), join(import.meta.dirname, "..", "tmp"));
/**
 * The ceiling on a connection or a line. Node's start and the kit's import
 * take well under a second on this machine, and the program connects again
 * at once after a connection that heard `start`, so each wait ends as soon
 * as its event comes and the ceiling is reached only by a kit that does not.
 */
const ARRIVES_WITHIN_MS = 10_000;
/** A viewer connecting with no selection, which the channel answers with one reply. */
const CONNECTED_LINE = '{"type":"connected","connection":1,"request":1,"remembered":false,"selection":null}';

/** `promise`, or a failure naming `what` once the ceiling passes. */
async function within<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const ceiling = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} did not arrive within ${ARRIVES_WITHIN_MS} ms`));
    }, ARRIVES_WITHIN_MS);
  });
  try {
    return await Promise.race([promise, ceiling]);
  } finally {
    clearTimeout(timer);
  }
}

/** The server's side of one connection: says `start` and a viewer, and answers the program's first line. */
async function startAndHearReply(connection: Socket, what: string): Promise<Sent> {
  const lines = createInterface({ input: connection })[Symbol.asyncIterator]();
  connection.write(`${START_LINE}\n${CONNECTED_LINE}\n`);
  const line = await within(lines.next(), what);
  assert.equal(line.done, false, `the connection ended before ${what}`);
  return parseSent(line.value);
}

/** A socket listened on as the server listens, handing over each program that connects, in order. */
class Listener {
  readonly folder = mkdtempSync(join(SCRATCH, "socket-"));
  readonly path = join(this.folder, "channel.sock");
  readonly #arrivals: Socket[] = [];
  readonly #waiting: ((connection: Socket) => void)[] = [];
  readonly #server = createServer((connection) => {
    const taker = this.#waiting.shift();
    if (taker === undefined) {
      this.#arrivals.push(connection);
    } else {
      taker(connection);
    }
  });

  listen(): Promise<void> {
    return new Promise((resolve) => {
      this.#server.listen(this.path, resolve);
    });
  }

  /** The next program to connect. */
  next(): Promise<Socket> {
    return new Promise((resolve) => {
      const ready = this.#arrivals.shift();
      if (ready === undefined) {
        this.#waiting.push(resolve);
      } else {
        resolve(ready);
      }
    });
  }

  close(): void {
    this.#server.close();
    rmSync(this.folder, { recursive: true, force: true });
  }
}

/** Nothing: the program's end is reported by the waits it cuts short. */
function ignore(): void {
  // A rejection after the test is over has nobody to tell.
}

test("REQ-1043: a program connects to the socket NEOTELETEXT_SOCKET names, answers there, and connects again when the server goes", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const listener = new Listener();
  await listener.listen();
  const child = spawn(process.execPath, [join(FIXTURES, "hello.ts")], {
    env: { ...process.env, [SOCKET_VARIABLE]: listener.path },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const exited = new Promise<never>((_resolve, reject) => {
    child.once("exit", (code) => {
      reject(new Error(`the program ended (${code}) without connecting`));
    });
  });
  exited.catch(ignore);
  const nextConnection = (what: string): Promise<Socket> => within(Promise.race([listener.next(), exited]), what);
  try {
    const first = await nextConnection("the program's connection");
    const reply = await startAndHearReply(first, "the reply to connected");
    assert.deepEqual([reply["type"], reply["connection"], reply["request"]], ["reply", 1, 1]);

    // The server goes: the program connects again and is a channel afresh,
    // so the same viewer number is a new viewer it answers.
    first.destroy();
    const second = await nextConnection("the program's second connection");
    const again = await startAndHearReply(second, "the reply on the second connection");
    assert.deepEqual([again["type"], again["connection"], again["request"]], ["reply", 1, 1]);
    second.destroy();
  } finally {
    child.kill();
    listener.close();
  }
});

// REQ-1348: a program flushes each line it writes. The fixture channel runs
// as a child on real pipes, as the server runs a program, and each line it
// writes must reach this end while it waits for the next line from the
// server: not when its output fills a buffer, when more output follows, or
// when it exits. A kit that held its lines back until the program ended
// passes fixture.test.ts, which reads the output whole, and fails here.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";

import { parseSent, type Sent } from "../src/testing/sent.ts";
import { START_LINE } from "./fixtures/start-line.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
/**
 * The ceiling on a line's arrival. Node's start and the kit's import take
 * well under a second on this machine, and each wait ends as soon as its
 * line comes, so the ceiling is only reached by a kit that holds the line.
 */
const ARRIVES_WITHIN_MS = 10_000;
/** A viewer connecting with no selection, which the channel answers with one reply. */
const CONNECTED_LINE = '{"type":"connected","connection":1,"session":1,"request":1,"cookies":[],"selection":null}';
/** The viewer selecting page 102, which the channel answers with that one page. */
const SELECTED_LINE = '{"type":"selected","connection":1,"request":2,"path":"102","page":"102","sub":"3F7F"}';

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

test("REQ-1348: each line a program writes reaches the pipe's other end while the program waits", async () => {
  const child = spawn(process.execPath, [join(FIXTURES, "hello.ts")], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", resolve);
  });
  try {
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const next = async (what: string): Promise<Sent> => {
      const line = await within(lines.next(), what);
      assert.equal(line.done, false, `the program's output ended before ${what}`);
      assert.equal(child.exitCode, null, `the program ended before ${what} was read`);
      return parseSent(line.value);
    };

    child.stdin.write(`${START_LINE}\n${CONNECTED_LINE}\n`);
    const reply = await next("the reply to connected");
    assert.equal(reply["type"], "reply");

    // The program has written all it has to say and waits on its input: the
    // next line arrives only because the server spoke again.
    child.stdin.write(`${SELECTED_LINE}\n`);
    const page = await next("page 102");
    assert.equal(page["type"], "page");
    assert.equal(page["request"], 2);

    child.stdin.end();
    assert.equal(await within(exited, "the program's end"), 0);
  } finally {
    child.kill();
  }
});

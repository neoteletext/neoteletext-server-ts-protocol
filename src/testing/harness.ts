// Driving a channel as the server drives it, on protocol version 6, for
// tests: sessions that connect (one connection each, numbered as the
// session), select pages, type, press keys, click and turn the wheel, a
// clock the test moves, and what the program wrote, every line checked
// against the schema as it was written; and the pages the channel keeps,
// read back as rows, links and cursor.

// oxlint-disable import/max-dependencies -- the harness stands in for the server, so it meets every part a program uses: the channel, input, pages, the wire and the limits start gives
import type { Application } from "../channel/application.ts";
import { Channel } from "../channel/channel.ts";
import { Button, type Input } from "../input/input.ts";
import { type HoverAction, type KeyAction, isCharacterKey } from "../input/keys.ts";
import type { Cursor } from "../page/cursor.ts";
import { ManualClock } from "./manual-clock.ts";
import { isFor, last, pageOf, parseSent, type Sent } from "./sent.ts";
import { ANY_SUB } from "../channel/channel.ts";
import { pathOf } from "../channel/wire-page.ts";
import type { Owner } from "../channel/copies.ts";
import { type ReadPage, readBack } from "../page/content.ts";
import type { Rows } from "../tti/read-tti.ts";
import { App } from "../wire/app.ts";
import { type Limits, SERVER_LIMITS } from "./server-limits.ts";
import type { ServerStats } from "../wire/stats.ts";

export interface HarnessOptions {
  /** The real time when the channel starts, in milliseconds since the Unix epoch. */
  readonly epochMs?: number;
  readonly seed?: bigint;
  /** The limits `start` gives: the server's by default. */
  readonly limits?: Limits;
}

/** The seed of the runtime's own test harness. */
const TEST_SEED = 7n;

/** A channel of some applications, started, and everything it wrote. */
export class Harness {
  readonly clock = new ManualClock();
  readonly channel: Channel;
  /** Every line written, parsed. */
  readonly sent: Sent[] = [];
  /** What the channel reported on standard error. */
  readonly errors: string[] = [];
  readonly #open = new Map<number, number>();
  /** The number of each connection's selection, as the server gives them. */
  readonly #requests = new Map<number, number>();
  readonly #went = new Map<number, number>();
  /** How many changes of each page's shared copy were counted. */
  readonly #counted = new Map<number, number>();

  constructor(applications: readonly Application[], options: HarnessOptions = {}) {
    const app = new App((line) => {
      this.#record(line);
    });
    this.channel = new Channel(applications, app, {
      clock: this.clock,
      seed: options.seed ?? TEST_SEED,
      errors: (error): void => {
        this.errors.push(error);
      },
    });
    this.channel.start(options.epochMs ?? 0, options.limits ?? SERVER_LIMITS);
  }

  #record(line: string): void {
    const message = parseSent(line);
    this.sent.push(message);
    if (message["type"] === "redirect" && typeof message["connection"] === "number" && message["address"] === undefined) {
      const page = pageOf(message["page"]);
      if (page !== undefined) {
        this.#went.set(message["connection"], page);
      }
    }
  }

  /** The server asks for the page's description: the message the channel answers with (REQ-1728). */
  describe(page: number): Sent {
    this.channel.describe(page);
    const answer = this.sent.at(-1);
    if (answer?.["type"] !== "description") {
      throw new Error(`describe ${page}: the channel answered ${String(answer?.["type"])}`);
    }
    return answer;
  }

  /** The time by the channel's clock. */
  get now(): number {
    return this.clock.time;
  }

  /** A session whose one connection, numbered as the session, connected with `page` selected. */
  join(session: number, page: number): void {
    this.#open.set(session, page);
    this.#went.delete(session);
    this.#requests.set(session, 1);
    this.channel.connected(session, session, 1, { page, sub: ANY_SUB }, []);
  }

  /** The session's connection selects `page`, or sub-page `sub` of it, leaving the page it had, as the server says. */
  open(session: number, page: number, sub: number = ANY_SUB, query: string | null = null): void {
    const before = this.#open.get(session);
    if (before !== undefined && before !== page) {
      this.channel.left(session, before);
    }
    this.#open.set(session, page);
    this.#went.delete(session);
    const request = (this.#requests.get(session) ?? 0) + 1;
    this.#requests.set(session, request);
    this.channel.selected(session, request, { page, sub }, pathOf({ page, sub }), query);
  }

  /** The session's connection closes, and the session ends. */
  close(session: number): void {
    const page = this.#open.get(session);
    if (page !== undefined) {
      this.channel.left(session, page);
    }
    this.#open.delete(session);
    this.#went.delete(session);
    this.channel.closed(session);
  }

  /** Input from `session` on the page it has open. */
  send(session: number, input: Input): void {
    const page = this.#open.get(session);
    if (page === undefined) {
      throw new Error(`session ${session} has no page open`);
    }
    this.channel.input(session, page, ANY_SUB, input);
  }

  /** Raw text, as an input method or a phone commits it (DOC-1930). */
  typeText(session: number, typed: string): void {
    this.send(session, { kind: "text", text: typed });
  }

  /** Types `typed` on the keyboard, as the browser sends it: each character a key's press with its text, then its release (DOC-1935). */
  typeKeys(session: number, typed: string): void {
    for (const typedCharacter of typed) {
      this.send(session, { kind: "key", action: "press", key: typedCharacter, text: typedCharacter });
      this.send(session, { kind: "key", action: "release", key: typedCharacter });
    }
  }

  paste(session: number, pasted: string): void {
    this.send(session, { kind: "paste", text: pasted });
  }

  /** One key event by its DOC-1936 name; a character key's press or repeat carries the character as its text, as a key pressed alone does. */
  key(session: number, key: string, action: KeyAction): void {
    this.send(session, { kind: "key", action, key, ...(isCharacterKey(key) && action !== "release" ? { text: key } : {}) });
  }

  press(session: number, key: string): void {
    this.key(session, key, "press");
    this.key(session, key, "release");
  }

  /** Presses and releases a mouse button on a cell. */
  click(session: number, button: number, column: number, row: number): void {
    this.mouse(session, "press", button, column, row);
    this.mouse(session, "release", button, column, row);
  }

  /** Presses or releases a mouse button on a cell. */
  mouse(session: number, action: "press" | "release", button: number, column: number, row: number): void {
    this.send(session, { kind: "mouse", action, button, column, row });
  }

  /** Moves the pointer onto a cell with `buttons` held ({@link Held}). */
  move(session: number, buttons: number, column: number, row: number): void {
    this.send(session, { kind: "mouse", action: "move", buttons, column, row });
  }

  /** The pointer enters or leaves the control whose first cell is `column`, `row` (DOC-1940). */
  hover(session: number, action: HoverAction, column: number, row: number): void {
    this.send(session, { kind: "hover", action, column, row });
  }

  clickLeft(session: number, column: number, row: number): void {
    this.click(session, Button.Left, column, row);
  }

  /** The server's figures arrive, as they do every 10 seconds. */
  stats(stats: ServerStats): void {
    this.channel.stats(stats);
  }

  /** Turns the wheel over a cell: `dy` in 1/120ths of a line, down positive. */
  wheel(session: number, dy: number, column: number, row: number): void {
    this.send(session, { kind: "wheel", dx: 0, dy, column, row });
  }

  /** Runs the clock on by `by`, waking the applications once if a wake is due, as the runtime's harness does. */
  advance(by: number): void {
    this.clock.time += by;
    const wake = this.channel.nextWake();
    if (wake !== null && wake <= this.clock.time) {
      this.channel.deadline();
    }
  }

  /** Runs the clock on to `until`, waking the applications at each time they asked for. */
  runUntil(until: number): void {
    for (let wake = this.channel.nextWake(); wake !== null && wake <= until; wake = this.channel.nextWake()) {
      this.clock.time = Math.max(this.clock.time, wake);
      this.channel.deadline();
    }
    this.clock.time = Math.max(this.clock.time, until);
  }

  /** The sub-pages sent, each a `page` message. */
  publications(): Sent[] {
    return this.sent.filter((message) => message["type"] === "page");
  }

  /** How many times the shared copy of `page` changed since the last call. */
  sharedPublications(page: number): number {
    const now = this.channel.changes("channel", page);
    const count = now - (this.#counted.get(page) ?? 0);
    this.#counted.set(page, now);
    return count;
  }

  #pages(owner: Owner, page: number): ReadPage[] | undefined {
    return this.channel.copy(owner, page)?.map(({ sub, content }) => readBack(content, sub));
  }

  /** The shared copy of `page` the channel keeps, every sub-page in ascending order. */
  sharedPages(page: number): ReadPage[] {
    const pages = this.#pages("channel", page);
    if (pages === undefined) {
      throw new Error(`page ${page.toString(16)} was never published shared`);
    }
    return pages;
  }

  /** The copy of `page` the channel keeps for `session` alone, every sub-page; undefined if it has none. */
  ownPages(session: number, page: number): ReadPage[] | undefined {
    return this.#pages(session, page);
  }

  /** The title the channel's index lists `page` under now. */
  title(page: number): string | undefined {
    return this.channel.titleOf(page);
  }

  /** The shared copy's rows: its last sub-page, as a receiver ends up holding it. */
  shared(page: number): Rows {
    return last(this.sharedPages(page)).rows;
  }

  /** The rows of the latest copy of `page` sent to `session` alone. */
  own(session: number, page: number): Rows {
    const pages = this.ownPages(session, page);
    if (pages === undefined) {
      throw new Error(`page ${page.toString(16)} was never sent to session ${session} alone`);
    }
    return last(pages).rows;
  }

  /** The copy of `page` `session` sees: its own if it has one, else the channel's. */
  seen(session: number, page: number): ReadPage {
    return last(this.ownPages(session, page) ?? this.sharedPages(page));
  }

  /** The page the session is at: where it was last sent, or the page it opened. */
  at(session: number): number | undefined {
    return this.#went.get(session) ?? this.#open.get(session);
  }

  /** The cursor of the page the session is at, as it sees the page. */
  cursor(session: number): Cursor | null {
    const page = this.at(session);
    return page === undefined ? null : this.seen(session, page).cursor;
  }

  /** The pages `session`'s connection was sent to, in order. */
  redirects(session: number): number[] {
    return this.sent
      .filter((message) => message["type"] === "redirect" && message["connection"] === session && message["address"] === undefined)
      .map((message) => pageOf(message["page"]) ?? 0);
  }

  /** The addresses `session`'s connection was sent to, in order. */
  addressRedirects(session: number): string[] {
    return this.sent
      .filter((message) => message["type"] === "redirect" && message["connection"] === session)
      .flatMap((message) => (typeof message["address"] === "string" ? [message["address"]] : []));
  }

  /** The sound lines for `session`'s connection, in order. */
  sounds(session: number): Sent[] {
    return this.sent.filter((message) => message["type"] === "sound" && isFor(message["connections"], session));
  }
}

// An application's view of the channel during one call: it answers
// through this. What it publishes is kept by the channel (copies.ts) and
// sent, one sub-page at a time, to the connections whose selection shows
// it (REQ-1501, REQ-1473); what it sends otherwise goes to the connections
// it names.

import { Random } from "./random.ts";
import type { Owner } from "./copies.ts";
import { Screen } from "../page/screen.ts";
import type { Subpage } from "../page/subpage.ts";
import type { Audience, SoundMember } from "../sound/members.ts";
import type { App } from "../wire/app.ts";
import type { Limits } from "../wire/limits.ts";
import type { WireAuthorLevel, WireDeniedStatus, WireSameSite } from "../wire/protocol.ts";

/** A cookie's attributes (RFC 6265bis), each typed (docs/applications.md section 3). */
export interface CookieOptions {
  readonly path?: string;
  /** Seconds it lasts, 0 removing it; absent, it lasts the browser's session. */
  readonly maxAge?: number;
  readonly sameSite?: WireSameSite;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
}

/** What a context reaches of its channel. */
export interface Host {
  readonly app: App;
  readonly random: Random;
  epochAtStart(): number;
  wakeAt(index: number, at: number): void;
  publish(owner: Owner, page: number, subpages: readonly Subpage[], whole: boolean): void;
  publishTti(owner: Owner, page: number, text: string): void;
  remove(owner: Owner, page: number, subcodes: readonly number[]): void;
  release(session: number, page: number): void;
  titleOf(page: number): string | undefined;
  title(page: number, title: string): void;
  redirect(session: number, to: number | string, sub: number | null): void;
  deny(session: number, status: WireDeniedStatus): void;
  sound(to: Audience, member: SoundMember): void;
  authorLog(to: Audience, level: WireAuthorLevel, text: string, page: number | null): void;
  log(text: string): void;
  cookie(connection: number, name: string, value: string, options: CookieOptions): void;
  packets(to: Audience, packets: Uint8Array): void;
  connection(): number | null;
  connectionsOf(session: number): number[];
}

/** An application's view of the channel during one call. */
export class Context {
  readonly #host: Host;
  readonly #index: number;
  readonly #now: number;

  constructor(host: Host, index: number, now: number) {
    this.#host = host;
    this.#index = index;
    this.#now = now;
  }

  /** The time, in milliseconds since the program started. */
  now(): number {
    return this.#now;
  }

  /** The real time, in milliseconds since the Unix epoch (UTC), by the server's clock. */
  epochMs(): number {
    return this.#host.epochAtStart() + this.#now;
  }

  /** The standard's maxima and the server's budgets, as the server told them in `start`. */
  limits(): Limits {
    return this.#host.app.limits();
  }

  /** Publishes a page drawn on a screen, as its one sub-page, 0000. */
  publish(owner: Owner, page: number, screen: Screen): void {
    this.#host.publish(owner, page, [{ screen }], true);
  }

  /** Publishes a page whole: its sub-pages in their order, the kit numbering them by place (numbering.ts). */
  publishSubpages(owner: Owner, page: number, subpages: readonly Subpage[]): void {
    this.#host.publish(owner, page, subpages, true);
  }

  /** Publishes a page whole from TTI written elsewhere, such as a converted picture's file, numbered by place as {@link Context.publishSubpages}. */
  publishTti(owner: Owner, page: number, text: string): void {
    this.#host.publishTti(owner, page, text);
  }

  /** Puts sub-pages in a page, each by its sub-code, keeping its others. */
  put(owner: Owner, page: number, subpages: readonly Subpage[]): void {
    this.#host.publish(owner, page, subpages, false);
  }

  /** Ends the sub-pages of `subcodes` in a page, keeping its others. */
  remove(owner: Owner, page: number, subcodes: readonly number[]): void {
    this.#host.remove(owner, page, subcodes);
  }

  /**
   * Sends the session's viewer elsewhere (DOC-1960): to
   * `page`, and sub-page `sub` when given, or to another channel's
   * `address`, which the viewer's receiver shows a notice for and then
   * opens by its own rules. It goes to the connection the call came from
   * when it is the session's, otherwise each of the session's connections.
   */
  redirect(session: number, page: number, sub?: number): void;
  redirect(session: number, address: string): void;
  redirect(session: number, to: number | string, sub?: number): void {
    this.#host.redirect(session, to, sub ?? null);
  }

  /**
   * Ends the viewer's selection without a page (DOC-1961):
   * 403 not allowed, 404 no such page, 429 a limit, 503 not answering. The
   * viewer stays where they were and the connection stays open. It goes to
   * the connection the call came from when it is the session's, otherwise
   * each of the session's connections. Called from `request` or `opened`,
   * it is the selection's answer, in place of the page.
   */
  deny(session: number, status: WireDeniedStatus): void {
    this.#host.deny(session, status);
  }

  /** The title the channel's index lists one of its pages under now, if it has the page. */
  titleOf(page: number): string | undefined {
    return this.#host.titleOf(page);
  }

  /** Gives `page` a new title in the channel's index, for what it holds now: the index goes to every connection. */
  title(page: number, title: string): void {
    this.#host.title(page, title);
  }

  /** Drops the session's own copy of `page`: from now on it sees the channel's copy, as every viewer does, and is sent it at once. */
  release(session: number, page: number): void {
    this.#host.release(session, page);
  }

  /** Sends a sound (docs/applications.md section 3). */
  sound(to: Audience, member: SoundMember): void {
    this.#host.sound(to, member);
  }

  /** A line for the developer console of the viewers' browsers (`author_log`, REQ-INP-026): `E`, `W` or `I`, at most 200 bytes. */
  authorLog(to: Audience, level: WireAuthorLevel, text: string, page?: number): void {
    this.#host.authorLog(to, level, text, page ?? null);
  }

  /** Sets one of the program's cookies for the connection's viewer; names starting `_` are the server's. */
  cookie(connection: number, name: string, value: string, options: CookieOptions = {}): void {
    this.#host.cookie(connection, name, value, options);
  }

  /** Raw packets, whole 42-byte packets back to back (DOC-1970). */
  packets(to: Audience, packets: Uint8Array): void {
    this.#host.packets(to, packets);
  }

  /** The connection the call came from, if it came from one. */
  connection(): number | null {
    return this.#host.connection();
  }

  /** The connections open for `session`: one a browser tab. */
  connectionsOf(session: number): number[] {
    return this.#host.connectionsOf(session);
  }

  /** Asks for `wake` at `at`, in milliseconds; the earliest asked for wins. */
  wakeAt(at: number): void {
    this.#host.wakeAt(this.#index, at);
  }

  /** Asks for `wake` in `delay` milliseconds. */
  wakeIn(delay: number): void {
    this.wakeAt(this.#now + delay);
  }

  /** A line for the server operator's log. */
  log(text: string): void {
    this.#host.log(text);
  }

  /** A pseudo-random number, 0 to 2^32 - 1: for games, never for secrets. */
  random(): number {
    return this.#host.random.next();
  }

  /** A pseudo-random number below `bound` (0 when `bound` is 0). */
  below(bound: number): number {
    return this.#host.random.below(bound);
  }
}

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
import type { Language } from "../wire/languages.ts";
import type { Limits } from "../wire/limits.ts";
import type { Measured } from "../wire/server-message.ts";
import type { WireAuthorLevel, WireDeniedStatus, WireSameSite } from "../wire/protocol.ts";

/** One numbered drawing of a ReGIS picture that is a link, and where it leads (the server's REQ-6372). */
export interface DrawingLink {
  /** The numbered drawing, 1 to 65,535. */
  readonly drawing: number;
  /** A page (`"200"`), a sub-page (`"200:0001"`), a page of another channel (`"news:300"`), an address, or `"web:"` and a web address. */
  readonly target: string;
}

/** A cookie's attributes (RFC 6265bis), each typed (DOC-1970). */
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
  publishTti(owner: Owner, page: number, text: string, titles: readonly (string | null)[]): void;
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
  cookies(session: number): Readonly<Record<string, string>>;
  measure(page: number, screen: Screen): Promise<Measured>;
  packets(to: Audience, packets: Uint8Array): void;
  regis(to: Audience, page: number, sub: number, data: string | Uint8Array, restart: boolean): void;
  regisLinks(to: Audience, page: number, sub: number, links: readonly DrawingLink[]): void;
  regisCursor(to: Audience, page: number, sub: number, drawing: number): void;
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

  /** The languages a page or its text may name, as the server listed them in `start` (REQ-2215): each with its direction. */
  languages(): readonly Language[] {
    return this.#host.app.languages();
  }

  /**
   * What the server's encoding of a page drawn on `screen` costs, as page
   * `page` (REQ-2216): its triplets against the limit, its designation and
   * each run of text's cells and triplets. Nothing reaches a
   * viewer. It rejects with a MeasureRefusedError when the server
   * would refuse the page, naming the run at fault.
   */
  measure(page: number, screen: Screen): Promise<Measured> {
    return this.#host.measure(page, screen);
  }

  /** Publishes a page drawn on a screen, as its one sub-page, 0000. */
  publish(owner: Owner, page: number, screen: Screen): void {
    this.#host.publish(owner, page, [{ screen }], true);
  }

  /** Publishes a page whole: its sub-pages in their order, the kit numbering them by place (numbering.ts). */
  publishSubpages(owner: Owner, page: number, subpages: readonly Subpage[]): void {
    this.#host.publish(owner, page, subpages, true);
  }

  /**
   * Publishes a page whole from TTI written elsewhere, such as a converted
   * picture's file, numbered by place as {@link Context.publishSubpages}.
   * `titles` names its sub-pages in their order, for the page's sub-page
   * list (REQ-1503): TTI has no line for a sub-page's title. A sub-page
   * without one, or named `null`, has none.
   */
  publishTti(owner: Owner, page: number, text: string, titles: readonly (string | null)[] = []): void {
    this.#host.publishTti(owner, page, text, titles);
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

  /** Sends a sound (DOC-1970). */
  sound(to: Audience, member: SoundMember): void {
    this.#host.sound(to, member);
  }

  /** A line for the developer console of the viewers' browsers (`author_log`, REQ-INP-026): `E`, `W` or `I`, cut to `start`'s `author_log_bytes`. */
  authorLog(to: Audience, level: WireAuthorLevel, text: string, page?: number): void {
    this.#host.authorLog(to, level, text, page ?? null);
  }

  /**
   * The viewer's cookies, as their connection opened with them (DEC-1730
   * item 8): untrusted, from the viewer. The connection the call came from
   * when it is the session's, else the session's latest; none for a
   * session with no connection open.
   */
  cookies(session: number): Readonly<Record<string, string>> {
    return this.#host.cookies(session);
  }

  /** Sets one of the program's cookies for the connection's viewer; names starting `_` are the server's. */
  cookie(connection: number, name: string, value: string, options: CookieOptions = {}): void {
    this.#host.cookie(connection, name, value, options);
  }

  /** Raw packets, whole 42-byte packets back to back (DOC-1970). */
  packets(to: Audience, packets: Uint8Array): void {
    this.#host.packets(to, packets);
  }

  /**
   * More of a sub-page's ReGIS, the vector graphics a viewer's ReGIS
   * renderer draws in place of the sub-page's teletext page (the server's
   * REQ-6338): commands as text, or their bytes. Each connection that
   * shows the sub-page has one stream of it. `restart` begins the stream
   * again, with nothing drawn and no numbered drawings; without it the
   * bytes add to the stream, and go to no connection that has not been
   * sent a restart since it selected the sub-page. The server reads the
   * bytes as the viewer's renderer will and refuses them, with the
   * failure's code, if a commit in them would fail there.
   *
   * A drawing answers the pointer with no message at all through two of
   * its attributes: `D(S10(I1,H11,A12),S11(V0),S12(V0))` has the viewer's
   * browser show drawing 11 in drawing 10's place while the pointer is
   * over it, and drawing 12 while it is pressed.
   */
  regis(to: Audience, page: number, sub: number, data: string | Uint8Array, options: { readonly restart?: boolean } = {}): void {
    this.#host.regis(to, page, sub, data, options.restart === true);
  }

  /**
   * The numbered drawings of a sub-page's ReGIS picture that are links,
   * and where each leads (the server's REQ-6372): the viewer's browser
   * shows the destination under the pointer and follows a click itself,
   * as for a link in a teletext page. A `target` is a page (`"200"`), a
   * sub-page (`"200:0001"`), a page of another channel (`"news:300"`), an
   * address, or `"web:"` and a web address. The list replaces the
   * sub-page's drawing links, at most 64 of them and each drawing once;
   * an empty list removes them. Like the ReGIS itself it goes to the
   * connections that show the sub-page now, so send it with the ReGIS to
   * each viewer who selects the sub-page.
   */
  regisLinks(to: Audience, page: number, sub: number, links: readonly DrawingLink[]): void {
    this.#host.regisLinks(to, page, sub, links);
  }

  /**
   * The numbered drawing of a sub-page's ReGIS picture that is its cursor
   * (the server's REQ-6372), or 0 for none: the viewer's browser blinks it
   * while keys go to the channel. Draw it and move it with `regis`.
   */
  regisCursor(to: Audience, page: number, sub: number, drawing: number): void {
    this.#host.regisCursor(to, page, sub, drawing);
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

// An application's view of the channel during one call: it answers
// through this. What it publishes is kept by the channel (copies.ts) and
// sent, one sub-page at a time, to the connections whose selection shows
// it (REQ-1501, REQ-1473); what it sends otherwise goes to the connections
// it names.

// oxlint-disable import/max-dependencies, max-lines -- a context is a program's every call (kit-calls.tsv), each reaching its part of the channel
import type { Audience } from "./audience.ts";
import type { DeniedStatus } from "./connections.ts";
import type { Owner } from "./copies.ts";
import { Random } from "./random.ts";
import type { Viewer } from "./viewer.ts";
import { Screen } from "../page/screen.ts";
import type { Subpage } from "../page/subpage.ts";
import type { App } from "../wire/app.ts";
import type { Timeline } from "../animation/timeline.ts";
import type {
  AnimationOp,
  AuthorLevel,
  FrameMarkName,
  NaplpsObject,
  RuleTable,
  ServerMessageMeasured,
  SheetKindName,
  SoundMember,
  Sprite,
} from "../wire/generated/protocol.js";
import type { PageState } from "../rules/page-state.ts";
import type { Language } from "../wire/languages.ts";
import type { Limits } from "../wire/limits.ts";

/** One numbered drawing of a ReGIS picture that is a link, and where it leads (the server's REQ-6372). */
export interface DrawingLink {
  /** The numbered drawing, 1 to 65,535. */
  readonly drawing: number;
  /** A page (`"200"`), a sub-page (`"200:0001"`), a page of another channel (`"news:300"`), an address, or `"web:"` and a web address. */
  readonly target: string;
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
  release(connection: number, page: number): void;
  titleOf(page: number): string | undefined;
  title(page: number, title: string): void;
  redirect(connection: number, to: number | string, sub: number | null): void;
  deny(connection: number, status: DeniedStatus): void;
  sound(to: Audience, member: SoundMember): void;
  authorLog(to: Audience, level: AuthorLevel, text: string, page: number | null): void;
  log(text: string): void;
  measure(page: number, screen: Screen): Promise<ServerMessageMeasured>;
  packets(to: Audience, packets: Uint8Array): void;
  regis(to: Audience, page: number, sub: number, data: string | Uint8Array, restart: boolean): void;
  regisLinks(to: Audience, page: number, sub: number, links: readonly DrawingLink[]): void;
  regisCursor(to: Audience, page: number, sub: number, drawing: number): void;
  naplps(to: Audience, page: number, sub: number, data: Uint8Array, restart: boolean): void;
  rules(to: Audience, page: number, table: RuleTable | null): void;
  queryState(connection: number, page: number): Promise<PageState>;
  frame(to: Audience, page: number, sub: number, mark: FrameMarkName): void;
  animate(to: Audience, page: number, sub: number, ops: readonly AnimationOp[]): void;
  sprites(to: Audience, page: number, sub: number, sprites: readonly Sprite[]): void;
  naplpsObjects(to: Audience, page: number, sub: number, objects: readonly NaplpsObject[]): void;
  spriteSheet(to: Audience, page: number, kind: SheetKindName, data: string | Uint8Array, restart: boolean): void;
  playTimeline(to: Audience, page: number, sub: number, timeline: Timeline, id: number | null): number;
  stopTimeline(to: Audience, page: number, id: number): void;
  connection(): number | null;
  viewer(connection: number): Viewer | null;
  remembered(connection: number): boolean;
  requestState(connection: number): void;
  endState(viewer: Viewer): void;
  offerRemember(connection: number): void;
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
  measure(page: number, screen: Screen): Promise<ServerMessageMeasured> {
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
   * Sends the connection elsewhere (DOC-1960): to `page`, and sub-page
   * `sub` when given, or to another channel's `address`, which the viewer's
   * receiver shows a notice for and then opens by its own rules.
   */
  redirect(connection: number, page: number, sub?: number): void;
  redirect(connection: number, address: string): void;
  redirect(connection: number, to: number | string, sub?: number): void {
    this.#host.redirect(connection, to, sub ?? null);
  }

  /**
   * Ends the viewer's selection without a page (DOC-1961):
   * 403 not allowed, 404 no such page, 429 a limit, 503 not answering. The
   * viewer stays where they were and the connection stays open. Called
   * from `request` or `opened`, it is the selection's answer, in place of
   * the page.
   */
  deny(connection: number, status: DeniedStatus): void {
    this.#host.deny(connection, status);
  }

  /** The title the channel's index lists one of its pages under now, if it has the page. */
  titleOf(page: number): string | undefined {
    return this.#host.titleOf(page);
  }

  /** Gives `page` a new title in the channel's index, for what it holds now: the index goes to every connection. */
  title(page: number, title: string): void {
    this.#host.title(page, title);
  }

  /** Drops the connection's own copy of `page`: from now on it sees the channel's copy, as every viewer does, and is sent it at once. */
  release(connection: number, page: number): void {
    this.#host.release(connection, page);
  }

  /**
   * Sends a sound, of any kind the schema gives (typescript.md TS-19): the
   * member as the program built it, with `type` and `connections` added, one
   * line for each chunk of the audience's connections, every line held to the
   * schema before the first is written; nothing for an audience with no
   * connection. It throws a {@link ProtocolError} for what the schema refuses
   * and checks nothing more: every other rule is the server's, which a
   * `refused` handler hears (TS-17, TS-22). Bytes fields are Uint8Arrays.
   * Send a connection a page's `play` once, when it opens the page: a new
   * play starts the sound again (integration.md INT-28).
   */
  sound(to: Audience, member: SoundMember): void {
    this.#host.sound(to, member);
  }

  /** A line for the developer console of the viewers' browsers (`author_log`, REQ-INP-026): `E`, `W` or `I`, cut to `start`'s `author_log_bytes`. */
  authorLog(to: Audience, level: AuthorLevel, text: string, page?: number): void {
    this.#host.authorLog(to, level, text, page ?? null);
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
   * Sends bytes of a sub-page's NAPLPS (ANSI X3.110-1983), drawn by a viewer's NAPLPS renderer in place of the
   * sub-page's teletext page (the NAPLPS renderer's REQ-6408). `restart` begins the sub-page's stream again; without
   * it the bytes add to the stream, and go to no connection not yet sent a restart. The server sends them on unread.
   */
  naplps(to: Audience, page: number, sub: number, data: Uint8Array, options: { readonly restart?: boolean } = {}): void {
    this.#host.naplps(to, page, sub, data, options.restart === true);
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

  /**
   * Gives a page its rule table for the connections named, or with `null`
   * removes it (page-rules.md RULE-35): the one bounded list of rules, each
   * binding an event to local actions, that the viewer's receiver evaluates
   * sixty times a second, and the only way a page asks for the viewer's
   * input: a program hears an `input` only when a rule of the page's table
   * sent it (RULE-37). The server keeps the table for each connection and
   * sends it before the page whenever the connection selects the page
   * (RULE-40). The kit holds the table to the schema and checks nothing
   * more: every other fault is the server's, which a `refused` handler
   * hears (RULE-39, RULE-55).
   */
  rules(to: Audience, page: number, table: RuleTable | null): void {
    this.#host.rules(to, page, table);
  }

  /**
   * Asks one connection's receiver for the local state of `page` (RULE-38):
   * its variables, timers, enabled rules, targets and the values its rules
   * read, once, for resynchronising or debugging, never a stream. It
   * rejects with a {@link QueryRefusedError} when the server refuses the
   * query (the connection has another page selected, a second query within
   * a second) or no answer comes within the server's ten seconds.
   */
  queryState(connection: number, page: number): Promise<PageState> {
    return this.#host.queryState(connection, page);
  }

  /**
   * Sends what `body` sends for a sub-page as one frame (animation.md
   * ANIM-2, ANIM-19): the frame's begin, the body's messages, its end. The
   * viewer's receiver holds everything of the frame that changes what the
   * page shows and applies it on one tick, so no picture between is ever
   * shown; a whole new page sent in a frame is swapped in at once (ANIM-3).
   * The end is sent even when `body` throws, so that no frame is left open.
   */
  frame(to: Audience, page: number, sub: number, body: () => void): void {
    this.#host.frame(to, page, sub, "begin");
    try {
      body();
    } finally {
      this.#host.frame(to, page, sub, "end");
    }
  }

  /** Animation operations on a sub-page's objects, applied in order by the viewer's receiver (ANIM-19, ANIM-21): 1 to 64 of show, hide, look, move, order, frame, cycle, stop_cycle and reset. */
  animate(to: Audience, page: number, sub: number, ops: readonly AnimationOp[]): void {
    this.#host.animate(to, page, sub, ops);
  }

  /** A teletext sub-page's sprites, which replace those it had (ANIM-7, ANIM-21); an empty list removes them. */
  sprites(to: Audience, page: number, sub: number, sprites: readonly Sprite[]): void {
    this.#host.sprites(to, page, sub, sprites);
  }

  /** A NAPLPS sub-page's objects, which replace those it had (ANIM-11, ANIM-21); an empty list removes them. */
  naplpsObjects(to: Audience, page: number, sub: number, objects: readonly NaplpsObject[]): void {
    this.#host.naplpsObjects(to, page, sub, objects);
  }

  /**
   * More of a page's sprite sheet, the drawings its sub-pages' objects
   * share (ANIM-17, ANIM-21): ReGIS commands as text or bytes, or NAPLPS
   * bytes. `restart` begins a new generation of the sheet; without it the
   * bytes add to it.
   */
  spriteSheet(to: Audience, page: number, kind: SheetKindName, data: string | Uint8Array, restart = false): void {
    this.#host.spriteSheet(to, page, kind, data, restart);
  }

  /**
   * Has the server play `timeline` on a sub-page (ANIM-19, ANIM-21): each
   * step's operations are sent when its tick is due on the server's clock,
   * sixty ticks a second from the message's arrival, and again from the
   * start every `loopTicks` when the timeline has them. It answers the
   * timeline's `id`, 1 to 65,535, for {@link Context.stopTimeline}: the one
   * given, or the next the kit counts. A timeline played with a playing
   * one's `id` replaces it.
   */
  playTimeline(to: Audience, page: number, sub: number, timeline: Timeline, id?: number): number {
    return this.#host.playTimeline(to, page, sub, timeline, id ?? null);
  }

  /** Stops the timeline `id` of `page` (ANIM-21): its objects stay as its last step sent left them. */
  stopTimeline(to: Audience, page: number, id: number): void {
    this.#host.stopTimeline(to, page, id);
  }

  /** The connection the call came from, if it came from one. */
  connection(): number | null {
    return this.#host.connection();
  }

  /** The connection's viewer, or null when it has none (viewer-state.md VS-401). */
  viewer(connection: number): Viewer | null {
    return this.#host.viewer(connection);
  }

  /** Whether the connection's viewer chose to be remembered on this channel; false with no viewer (VS-351 item 1). */
  remembered(connection: number): boolean {
    return this.#host.remembered(connection);
  }

  /**
   * Asks that the viewer on the connection be given state (VS-352 item 1):
   * the server answers later, `viewerBegan` or `stateRefused`. Ask only
   * after the viewer acted (VS-212).
   */
  requestState(connection: number): void {
    this.#host.requestState(connection);
  }

  /** Ends the viewer's state (VS-352 item 2): every connection presenting it hears `viewerLeft`. Delete what is kept for it (VS-409). */
  endState(viewer: Viewer): void {
    this.#host.endState(viewer);
  }

  /** Asks the browser to offer the viewer "remember me" (VS-352 item 3, VS-208); refused with `stateRefused` when it cannot. */
  offerRemember(connection: number): void {
    this.#host.offerRemember(connection);
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

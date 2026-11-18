// Driving a channel as the server drives it, on protocol version 14, for
// tests: connections that open (one a browser tab), with a fake viewer or
// none (viewer-state.md VS-404), select pages, type, press keys, click and
// turn the wheel, a clock the test moves, and what the program wrote, every
// line checked against the schema as it was written; the pages the channel
// keeps, read back as rows, links and cursor; the sounds it sent, as the
// members it built (typescript.md TS-29); and the server's refusals and
// reports of sounds, given only as a test says (TS-30). Every input names
// the rule that sent it (page-rules.md RULE-37): the test's, or the rule the
// server's default table would send it by (RULE-53). A test fires a rule,
// answers a state query, and reads the `animate` messages the server would
// send as it plays a timeline (RULE-55; animation.md ANIM-19).

// oxlint-disable import/max-dependencies, max-lines -- the harness stands in for the server, so it meets every part a program uses: the channel, input, pages, the wire and the limits start gives; and its calls are every scenario of kit-calls.tsv, one method each
import { isDeepStrictEqual } from "node:util";

import type { Application } from "../channel/application.ts";
import { Channel } from "../channel/channel.ts";
import { Button, type Input } from "../input/input.ts";
import { defaultRule } from "./default-rules.ts";
import { ticksIn } from "../animation/ticks.ts";
import { pageText } from "../page/page-numbers.ts";
import { subText } from "../channel/wire-page.ts";
import { type HoverAction, type KeyAction, isCharacterKey } from "../input/keys.ts";
import type { Cursor } from "../page/cursor.ts";
import { ManualClock } from "./manual-clock.ts";
import { type FakeViewer, FakeViewers } from "./fake-viewers.ts";
import { isFor, last, pageOf, parseSent, type Sent } from "./sent.ts";
import { ANY_SUB } from "../channel/channel.ts";
import { pathOf } from "../channel/wire-page.ts";
import type { Owner } from "../channel/copies.ts";
import { type ReadPage, readBack } from "../page/content.ts";
import type { Rows } from "../tti/read-tti.ts";
import { App } from "../wire/app.ts";
import { type Language, type Limits, SERVER_LANGUAGES, SERVER_LIMITS } from "./server-limits.ts";
import { decodeBytes } from "../wire/bytes.ts";
import type {
  InputEvent,
  ProgramMessageAnimate,
  ProgramMessageSound,
  ProgramMessageTimeline,
  Rule,
  RuleEventBody,
  RuleTarget,
  ServerMessageInput,
  ServerMessagePageState,
  ServerMessageRefused,
  ServerMessageRuleEvent,
  ServerMessageSoundBuilt,
  SoundMember,
  StateRefusal,
} from "../wire/generated/protocol.js";
import { dispatch } from "../wire/server-events.ts";
import type { ServerStats } from "../wire/server-message.ts";
import { checkServer } from "../wire/validate.ts";

/** What a test gives of a report of a sound (`sound_built`, server.md SRV-47): everything but what names the sound, which the harness takes from the member reported. */
export type SoundReport = Omit<ServerMessageSoundBuilt, "type" | "kind" | "handle" | "generation">;

/** A page's sixteen variables as a page with no table has them (page-rules.md RULE-38): all zero. */
const NO_VARIABLES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;

/** What a test gives of a page's state (`page_state`, page-rules.md RULE-38): everything but what names the query, which the harness takes from the `query_state` it answers; what is left out is as a page with no table has it. */
export type PageStateAnswer = Partial<Omit<ServerMessagePageState, "type" | "connection" | "page" | "sub" | "request">>;

/** One `animate` message the server would send as it plays a timeline (animation.md ANIM-21): the timeline's `id`, the step's tick counted from the timeline's arrival, and the step's operations as the message. */
export interface TimelineSend {
  readonly id: number;
  readonly tick: number;
  readonly message: ProgramMessageAnimate;
}

export interface HarnessOptions {
  /** The real time when the channel starts, in milliseconds since the Unix epoch. */
  readonly epochMs?: number;
  readonly seed?: bigint;
  /** The limits `start` gives: the server's by default. */
  readonly limits?: Limits;
  /** The languages `start` lists: the server's by default. */
  readonly languages?: readonly Language[];
}

/** A sound line's member: what the program built, without `type` and `connections`. */
function memberOf(line: ProgramMessageSound): SoundMember {
  const { type: _type, connections: _connections, ...member } = line;
  return member;
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
  /** The sub-page each connection selected, when it selected one. */
  readonly #openSub = new Map<number, number>();
  /** Each open connection's fake viewer, if it has one. */
  readonly #viewerOf = new Map<number, FakeViewer>();
  readonly #viewers = new FakeViewers();
  /** The number the server gives the next connection a viewer joins on: they start again at a restart (VS-404). */
  #nextConnection = 1;
  readonly #options: HarnessOptions;
  /** The number of each connection's selection, as the server gives them. */
  readonly #requests = new Map<number, number>();
  readonly #went = new Map<number, number>();
  /** How many changes of each page's shared copy were counted. */
  readonly #counted = new Map<number, number>();

  constructor(applications: readonly Application[], options: HarnessOptions = {}) {
    this.#options = options;
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
    this.channel.start(options.epochMs ?? 0, options.limits ?? SERVER_LIMITS, options.languages ?? SERVER_LANGUAGES);
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

  /**
   * A connection opened with `page` selected: connection `who` with no
   * viewer, or a new connection of the fake viewer `who` (VS-404: joined twice,
   * the viewer in two tabs). The connection's number.
   */
  join(who: FakeViewer | number, page: number): number {
    const connection = typeof who === "number" ? who : this.#nextConnection;
    this.#nextConnection = Math.max(this.#nextConnection, connection + 1);
    this.#open.set(connection, page);
    this.#openSub.delete(connection);
    this.#went.delete(connection);
    this.#requests.set(connection, 1);
    const viewer = typeof who === "number" ? undefined : who;
    if (viewer === undefined) {
      this.#viewerOf.delete(connection);
    } else {
      this.#viewerOf.set(connection, viewer);
    }
    this.channel.connected(connection, 1, { page, sub: ANY_SUB }, null, null, viewer?.handle ?? null, viewer?.remembered ?? false);
    return connection;
  }

  /** The connection selects `page`, or sub-page `sub` of it, leaving the page it had, as the server says. */
  open(connection: number, page: number, sub: number = ANY_SUB, query: string | null = null): void {
    const before = this.#open.get(connection);
    if (before !== undefined && before !== page) {
      this.channel.left(connection, before);
    }
    this.#open.set(connection, page);
    if (sub === ANY_SUB) {
      this.#openSub.delete(connection);
    } else {
      this.#openSub.set(connection, sub);
    }
    this.#went.delete(connection);
    const request = (this.#requests.get(connection) ?? 0) + 1;
    this.#requests.set(connection, request);
    this.channel.selected(connection, request, { page, sub }, pathOf({ page, sub }), query);
  }

  /** The connection closes and is not resumed: it leaves its page and is gone (VS-354). */
  close(connection: number): void {
    const page = this.#open.get(connection);
    if (page !== undefined) {
      this.channel.left(connection, page);
    }
    this.#open.delete(connection);
    this.#openSub.delete(connection);
    this.#went.delete(connection);
    this.#viewerOf.delete(connection);
    this.channel.gone(connection);
  }

  /** The page the connection has open; a test that names a connection with none fails. */
  #pageOf(connection: number): number {
    const page = this.#open.get(connection);
    if (page === undefined) {
      throw new Error(`connection ${connection} has no page open`);
    }
    return page;
  }

  /** The tick an input or a rule's event carries when a test names none: the clock in ticks, sixty a second (page-rules.md RULE-4). */
  #tick(): number {
    return ticksIn(this.clock.time);
  }

  /**
   * Input from `connection` on the page it has open, as a rule of the
   * page's table sent it (page-rules.md RULE-37): the `rule`, `ruleRow`,
   * `tick` and `target` the input carries, or, for each it lacks, the rule
   * the server's default table would send it by (RULE-53), no row, the
   * clock in ticks, and no target: what a program of a channel with
   * `default_rules: send_all` hears.
   */
  send(connection: number, input: Input): void {
    const page = this.#pageOf(connection);
    const sent: Input = {
      ...input,
      rule: input.rule ?? defaultRule(input),
      ruleRow: input.ruleRow ?? null,
      tick: input.tick ?? this.#tick(),
      target: input.target ?? null,
    };
    this.channel.input(connection, page, ANY_SUB, sent);
  }

  /**
   * Gives the channel what the rule `rule` of the table of the connection's
   * page sends when it fires (RULE-37, RULE-55): with no `event`, a
   * `rule_event` saying it fired; with a `rule_event`'s body, such as a
   * value read, that `rule_event`; with an input event as the server
   * writes one, the `input` naming the rule, and `target` when the rule
   * named one. `tick` is the page tick: the clock in ticks when none is
   * given. `row` is the place of the row that fired within the rule's row
   * set, for a rule with rows (RULE-105); none without. `rule` is null for
   * a `rule_event` of a run no rule made, a command the server sent or a
   * sequence it started; an input always names its rule.
   */
  fire(connection: number, rule: string | null, event?: InputEvent | RuleEventBody, tick?: number, target?: RuleTarget, row?: number): void {
    const page = pageText(this.#pageOf(connection));
    const at = tick ?? this.#tick();
    const body = event ?? ({ kind: "fired" } as const);
    if (body.kind === "fired" || body.kind === "value") {
      const fired: ServerMessageRuleEvent = {
        type: "rule_event",
        connection,
        page,
        sub: subText(this.#openSub.get(connection) ?? 0),
        rule,
        row: row ?? null,
        tick: at,
        event: body,
      };
      this.#fromServer(fired);
      this.channel.ruleEvent(fired);
      return;
    }
    if (rule === null) {
      throw new Error("fire: an input names the rule that reported it (RULE-37)");
    }
    const input: ServerMessageInput = {
      type: "input",
      connection,
      page,
      sub: subText(ANY_SUB),
      lost: false,
      rule,
      row: row ?? null,
      tick: at,
      target: target ?? null,
      event: body,
    };
    this.#fromServer(input);
    dispatch(input, this.channel);
  }

  /**
   * Answers `query`, a `query_state` the channel wrote, with the
   * `page_state` a receiver would send (RULE-38, RULE-55): what `state`
   * gives, and for what it leaves out a page with no table, for the page
   * and sub-page the query named. The channel hears it as from the server.
   */
  answerState(query: Sent, state?: PageStateAnswer): void {
    const { connection, page, sub, request } = query;
    if (
      query["type"] !== "query_state" ||
      typeof connection !== "number" ||
      typeof page !== "string" ||
      typeof sub !== "string" ||
      typeof request !== "number"
    ) {
      throw new Error("answerState: not a query_state the channel wrote");
    }
    const answer: ServerMessagePageState = {
      type: "page_state",
      connection,
      page,
      sub,
      request,
      tick: this.#tick(),
      table: false,
      variables: NO_VARIABLES,
      timers: {},
      sequences: {},
      targets: [],
      values: [],
      ...state,
    };
    this.#fromServer(answer);
    this.channel.pageState(answer);
  }

  /**
   * The `animate` messages the server would send `connection` as it plays
   * each timeline the channel wrote for it, once through (animation.md
   * ANIM-19, ANIM-21): timelines in the order written, each one's steps in
   * the order sent. The harness does not stop, replace or loop a timeline:
   * those are the server's.
   */
  timelineSends(connection: number): TimelineSend[] {
    return (
      this.sent
        .filter((message) => message["type"] === "timeline" && isFor(message["connections"], connection))
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the channel's App held each line to the schema as it was written
        .map((message) => decodeBytes(message, "ProgramMessage") as ProgramMessageTimeline)
        .flatMap(({ id, connections, page, sub, steps }) =>
          steps.map(({ tick, ops }) => ({ id, tick, message: { type: "animate", connections, page, sub, ops } as const })),
        )
    );
  }

  /** Raw text, as an input method or a phone commits it (DOC-1930). */
  typeText(connection: number, typed: string): void {
    this.send(connection, { kind: "text", text: typed });
  }

  /** Types `typed` on the keyboard, as the browser sends it: each character a key's press with its text, then its release (DOC-1935). */
  typeKeys(connection: number, typed: string): void {
    for (const typedCharacter of typed) {
      this.send(connection, { kind: "key", action: "press", key: typedCharacter, text: typedCharacter });
      this.send(connection, { kind: "key", action: "release", key: typedCharacter });
    }
  }

  paste(connection: number, pasted: string): void {
    this.send(connection, { kind: "paste", text: pasted });
  }

  /** One key event by its DOC-1936 name; a character key's press or repeat carries the character as its text, as a key pressed alone does. */
  key(connection: number, key: string, action: KeyAction): void {
    this.send(connection, { kind: "key", action, key, ...(isCharacterKey(key) && action !== "release" ? { text: key } : {}) });
  }

  press(connection: number, key: string): void {
    this.key(connection, key, "press");
    this.key(connection, key, "release");
  }

  /** Presses and releases a mouse button on a cell. */
  click(connection: number, button: number, column: number, row: number): void {
    this.mouse(connection, "press", button, column, row);
    this.mouse(connection, "release", button, column, row);
  }

  /** Presses or releases a mouse button on a cell. */
  mouse(connection: number, action: "press" | "release", button: number, column: number, row: number): void {
    this.send(connection, { kind: "mouse", action, button, column, row });
  }

  /** Moves the pointer onto a cell with `buttons` held ({@link Held}). */
  move(connection: number, buttons: number, column: number, row: number): void {
    this.send(connection, { kind: "mouse", action: "move", buttons, column, row });
  }

  /** The pointer enters or leaves the control whose first cell is `column`, `row` (DOC-1940). */
  hover(connection: number, action: HoverAction, column: number, row: number): void {
    this.send(connection, { kind: "hover", action, column, row });
  }

  clickLeft(connection: number, column: number, row: number): void {
    this.click(connection, Button.Left, column, row);
  }

  /** The server's figures arrive, as they do every 10 seconds. */
  stats(stats: ServerStats): void {
    this.channel.stats(stats);
  }

  /** Turns the wheel over a cell: `dy` in 1/120ths of a line, down positive. */
  wheel(connection: number, dy: number, column: number, row: number): void {
    this.send(connection, { kind: "wheel", dx: 0, dy, column, row });
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

  /** The copy of `page` the channel keeps for `connection` alone, every sub-page; undefined if it has none. */
  ownPages(connection: number, page: number): ReadPage[] | undefined {
    return this.#pages(connection, page);
  }

  /** The title the channel's index lists `page` under now. */
  title(page: number): string | undefined {
    return this.channel.titleOf(page);
  }

  /** The shared copy's rows: its last sub-page, as a receiver ends up holding it. */
  shared(page: number): Rows {
    return last(this.sharedPages(page)).rows;
  }

  /** The rows of the latest copy of `page` sent to `connection` alone. */
  own(connection: number, page: number): Rows {
    const pages = this.ownPages(connection, page);
    if (pages === undefined) {
      throw new Error(`page ${page.toString(16)} was never sent to connection ${connection} alone`);
    }
    return last(pages).rows;
  }

  /** The copy of `page` `connection` sees: its own if it has one, else the channel's. */
  seen(connection: number, page: number): ReadPage {
    return last(this.ownPages(connection, page) ?? this.sharedPages(page));
  }

  /** The page the connection is at: where it was last sent, or the page it opened. */
  at(connection: number): number | undefined {
    return this.#went.get(connection) ?? this.#open.get(connection);
  }

  /** The cursor of the page the connection is at, as it sees the page. */
  cursor(connection: number): Cursor | null {
    const page = this.at(connection);
    return page === undefined ? null : this.seen(connection, page).cursor;
  }

  /** The pages `connection`'s connection was sent to, in order. */
  redirects(connection: number): number[] {
    return this.sent
      .filter((message) => message["type"] === "redirect" && message["connection"] === connection && message["address"] === undefined)
      .map((message) => pageOf(message["page"]) ?? 0);
  }

  /** The addresses `connection`'s connection was sent to, in order. */
  addressRedirects(connection: number): string[] {
    return this.sent
      .filter((message) => message["type"] === "redirect" && message["connection"] === connection)
      .flatMap((message) => (typeof message["address"] === "string" ? [message["address"]] : []));
  }

  /** Every sound line written, with its bytes fields as bytes. */
  #soundLines(): ProgramMessageSound[] {
    // Each line was held to the schema as it was written, so each is the generated type, as its line carried it.
    return (
      this.sent
        .filter((message) => message["type"] === "sound")
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the channel's App held each line to the schema as it was written
        .map((message) => decodeBytes(message, "ProgramMessage") as ProgramMessageSound)
    );
  }

  /** Every sound written to `connection`, in order, each as the program built it: without `type` and `connections`, its bytes as Uint8Arrays (TS-29). */
  sounds(connection: number): SoundMember[] {
    return this.#soundLines()
      .filter((line) => isFor(line.connections, connection))
      .map((line) => memberOf(line));
  }

  /** The sounds of one kind written to `connection`, in order, typed by the kind. */
  soundsOfKind<Kind extends SoundMember["kind"]>(connection: number, kind: Kind): Extract<SoundMember, { readonly kind: Kind }>[] {
    return this.sounds(connection).filter((member): member is Extract<SoundMember, { readonly kind: Kind }> => member.kind === kind);
  }

  /** The sounds written with `"connections": "all"`, in order. */
  soundsToEveryone(): SoundMember[] {
    return this.#soundLines()
      .filter((line) => line.connections === "all")
      .map((line) => memberOf(line));
  }

  /** Fails the test unless the channel wrote `member`. */
  #written(member: SoundMember, what: string): void {
    if (!this.#soundLines().some((line) => isDeepStrictEqual(memberOf(line), member))) {
      throw new Error(`${what}: the channel never wrote that ${member.kind}`);
    }
  }

  /** Gives the channel a line as the server writes it, held to the schema first: a line the server could not send fails the test. */
  #fromServer(message: unknown): void {
    const fault = checkServer(message);
    if (fault !== null) {
      throw new Error(`the server never sends that: ${fault.path === "" ? "the message" : fault.path}: ${fault.rule} (${fault.detail})`);
    }
  }

  /** The server refuses `member`, which the channel wrote, as it would (server.md SRV-48): the channel hears it as from the server (TS-30). */
  refuse(member: SoundMember, path: string, rule: Rule, detail: string): void {
    this.#written(member, "refuse");
    const refusal: ServerMessageRefused = {
      type: "refused",
      message: "sound",
      path,
      rule,
      detail,
      sound: {
        kind: member.kind,
        ...("handle" in member ? { handle: member.handle } : {}),
        ...("generation" in member ? { generation: member.generation } : {}),
      },
    };
    this.#fromServer(refusal);
    this.channel.refused(refusal);
  }

  /** The server reports the stored sound `member`, which the channel wrote, as built (`sound_built`, SRV-47): the channel hears it as from the server (TS-30). */
  report(member: SoundMember, report: SoundReport): void {
    this.#written(member, "report");
    if (!("handle" in member) || !("generation" in member)) {
      throw new Error(`report: a ${member.kind} names no sound`);
    }
    const built: ServerMessageSoundBuilt = { type: "sound_built", kind: member.kind, handle: member.handle, generation: member.generation, ...report };
    this.#fromServer(built);
    this.channel.soundBuilt(built);
  }

  /** The server restarts (VS-404; TS-31): it says `start` again, every connection is gone, and connection numbers start again; viewers' handles do not change. */
  restart(): void {
    this.#open.clear();
    this.#openSub.clear();
    this.#went.clear();
    this.#requests.clear();
    this.#viewerOf.clear();
    this.#nextConnection = 1;
    this.channel.start(this.#options.epochMs ?? 0, this.#options.limits ?? SERVER_LIMITS, this.#options.languages ?? SERVER_LANGUAGES);
  }

  /** The fake viewer named `name`, whose handle is fixed, derived from the name (VS-404): the same viewer each time it is asked for. */
  viewer(name: string): FakeViewer {
    return this.#viewers.named(name);
  }

  /** The viewer `name` in a private window: a viewer of another handle (VS-404, VS-110). */
  privateViewer(name: string): FakeViewer {
    return this.#viewers.private(name);
  }

  /** Whether the viewer chose to be remembered, as their next connections say. */
  remember(viewer: FakeViewer, remembered: boolean): void {
    this.#viewers.remember(viewer, remembered);
  }

  /** The viewer reset their state (VS-404): their open connections hear `viewer_left`, and they join from now on with a new handle. */
  forget(viewer: FakeViewer): void {
    this.#viewers.forget(viewer);
    for (const [connection, carried] of this.#viewerOf) {
      if (carried === viewer) {
        this.#viewerOf.delete(connection);
        this.channel.viewerLeft(connection);
      }
    }
  }

  /** The connection's state request is granted (VS-404): it now has a viewer, its own fake viewer's or one named for the connection. */
  grantState(connection: number): void {
    const viewer = this.#viewerOf.get(connection) ?? this.#viewers.named(`connection ${connection}`);
    this.#viewerOf.set(connection, viewer);
    this.channel.viewerBegan(connection, viewer.handle, viewer.remembered);
  }

  /** The connection's state request is refused, for `reason` (VS-404). */
  refuseState(connection: number, reason: StateRefusal): void {
    this.channel.stateRefused(connection, reason);
  }
}

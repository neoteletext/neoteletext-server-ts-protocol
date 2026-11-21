// A channel's applications in one program, on protocol version 14
// (DEC-1482): one connection a browser tab, one selection a connection
// (DEC-1527). Each `connected` and `selected` is answered with one
// sub-page (answers.ts); what an application publishes is kept (copies.ts)
// and sent, one sub-page at a time, to the connections whose selection
// shows it (sender.ts). Pages that do not use digits or the coloured keys
// get page selection by them (navigation.ts); a click the page does not
// take follows the prompt or the page number it is on.

// oxlint-disable import/max-dependencies, max-lines -- the channel is where the protocol's parts meet: the wire, input, navigation, pages and applications; it is every event of the server's (ServerEvents)
import type { Application, PageEntry } from "./application.ts";
import { type AnswerParts, answerConnected, answerSelected, followClick, resolve, viewOf } from "./answers.ts";
import { Applications } from "./applications.ts";
import type { ChannelOptions, Clock } from "./channel-options.ts";
import { Connections } from "./connections.ts";
import type { Context, Host } from "./context.ts";
import { Copies, type Owner } from "./copies.ts";
import { descriptionMessage } from "./description.ts";
import { makeHost } from "./host.ts";
import { CurrentCall } from "./current-call.ts";
import { Measures } from "./measures.ts";
import { PictureTextMeasures } from "./picture-text-measures.ts";
import { Queries } from "./queries.ts";
import { type PageCalls, tellLeft, tellOpened, tellRequest, tellRequestEnded } from "./page-calls.ts";
import { pageRequest } from "./request.ts";
import { Sender } from "./sender.ts";
import { type Snapshot, Snapshots } from "./snapshots.ts";
import { Viewers } from "./viewers.ts";
import { ANY_SUB, pathOf, wirePage } from "./wire-page.ts";
import type { Input } from "../input/input.ts";
import type { PageView } from "../navigation/clicked-link.ts";
import { Navigation } from "../navigation/navigation.ts";
import type { SubPageContent } from "../page/content.ts";
import { pageText } from "../page/page-numbers.ts";
import type { App } from "../wire/app.ts";
import type { Language } from "../wire/languages.ts";
import type { Limits } from "../wire/limits.ts";
import type {
  Handle,
  Magazine,
  ProgramMessage,
  ServerMessageMeasured,
  ServerMessageMeasuredPictureText,
  ServerMessagePageState,
  ServerMessageRefused,
  ServerMessageRuleEvent,
  ServerMessageRulesFault,
  ServerMessageSoundBuilt,
  StateRefusal,
} from "../wire/generated/protocol.js";
import { numberOf } from "../wire/server-message.ts";
import type { ServerEvents } from "../wire/server-events.ts";
import type { Selection, ServerStats } from "../wire/server-message.ts";

export { ANY_SUB };

/** The channel: its applications, the connections it has, and every page it keeps. */
export class Channel implements ServerEvents {
  readonly #applications: Applications;
  readonly #entries: ReadonlyMap<number, PageEntry>;
  readonly #titles: Map<number, string>;
  readonly #app: App;
  readonly #clock: Clock;
  readonly #errors: (text: string) => void;
  /** The connections applications have been told of. */
  readonly #known = new Set<number>();
  readonly #viewers = new Viewers();
  readonly #connections = new Connections();
  readonly #copies = new Copies();
  readonly #sender: Sender;
  readonly #navigation: Navigation;
  readonly #host: Host;
  readonly #answers: AnswerParts;
  readonly #calls: PageCalls;
  readonly #measures = new Measures();
  readonly #pictureTextMeasures = new PictureTextMeasures();
  readonly #queries = new Queries();
  readonly #current = new CurrentCall();
  readonly #snapshots = new Snapshots();
  /** The connection of the snapshot being drawn: a failure reported while it is declines it (REQ-6901 item 4). */
  #drawing: number | null = null;
  #epochAtStart = 0;

  /** A channel of `applications`, writing through `app`; the first application to declare a page serves it. */
  constructor(applications: readonly Application[], app: App, options: ChannelOptions) {
    this.#errors = this.#declining(options.errors);
    this.#applications = new Applications(applications, this.#errors);
    this.#entries = this.#applications.entries;
    this.#titles = this.#applications.titles;
    this.#app = app;
    this.#clock = options.clock;
    this.#navigation = new Navigation((page) => this.#entries.has(page));
    this.#sender = new Sender(app, this.#connections, this.#copies, this.#snapshots, (connection): Magazine[] =>
      this.#applications.index(this.#copies, this.#app.limits(), connection),
    );
    this.#host = makeHost({
      app,
      seed: options.seed,
      sender: this.#sender,
      copies: this.#copies,
      connections: this.#connections,
      titles: this.#titles,
      serves: (page) => this.#entries.has(page),
      known: this.#known,
      epochAtStart: () => this.#epochAtStart,
      wakeAt: (index, at) => {
        this.#applications.wakeAt(index, at);
      },
      current: () => this.#current.connection,
      errors: this.#errors,
      measures: this.#measures,
      pictureTextMeasures: this.#pictureTextMeasures,
      queries: this.#queries,
      snapshots: this.#snapshots,
      refuseState: (connection) => {
        this.stateRefused(connection, "stateless");
      },
    });
    this.#answers = {
      copies: this.#copies,
      sender: this.#sender,
      index: (connection): Magazine[] => this.#applications.index(this.#copies, this.#app.limits(), connection),
      errors: this.#errors,
    };
    this.#calls = {
      callOwner: (page, run): void => {
        this.#callOwner(page, run);
      },
    };
    this.#epochAtStart = Date.now() - this.#clock.now();
  }

  /** The owner's copy of `page`, each sub-page by sub-code in ascending order: for tests. */
  copy(owner: Owner, page: number): readonly { readonly sub: number; readonly content: SubPageContent }[] | undefined {
    const copy = this.#copies.get(owner, page);
    return copy?.subs().flatMap((sub) => {
      const content = copy.subpages.get(sub)?.content;
      return content === undefined ? [] : [{ sub, content }];
    });
  }

  /** How many times the owner's copy of `page` changed: for tests. */
  changes(owner: Owner, page: number): number {
    return this.#copies.changes(owner, page);
  }

  titleOf(page: number): string | undefined {
    return this.#titles.get(page);
  }

  // The server's events.

  /**
   * The server said start, with the limits it keeps to and the languages it writes: every connection the program knew is
   * gone, and every application publishes its shared pages. `epochMs` is the real time now, as this is called, which a
   * running program reckons from the server's stamp (`timeAtRead`) and a test names.
   */
  start(epochMs: number, limits: Limits, languages: readonly Language[]): void {
    this.#epochAtStart = epochMs - this.#clock.now();
    this.#app.started(limits, languages);
    this.#measures.forgetAll();
    this.#pictureTextMeasures.forgetAll();
    this.#queries.forgetAll();
    this.#snapshots.clear();
    this.#connections.clear();
    this.#navigation.clear();
    this.#applications.endEvery(this.#known, this.#copies, this.#host, this.#clock.now());
    this.#each((application, context) => {
      application.start(context);
    });
  }

  connected(
    connection: number,
    request: number,
    selection: Selection | null,
    path: string | null = null,
    query: string | null = null,
    viewer: Handle | null = null,
    remembered = false,
  ): void {
    // Added first: what `joined` sends goes to the connections open.
    const state = this.#connections.add(connection, request, viewer === null ? null : this.#viewers.of(viewer), remembered);
    this.#applications.know(this.#known, connection, this.#host, this.#clock.now());
    const asked = selection !== null && this.#entries.has(selection.page) ? selection : null;
    const page = asked?.page ?? this.#applications.initialPage();
    this.#answering(connection, () => {
      state.page = page ?? null;
      if (page !== undefined) {
        const made = asked === null ? pageRequest(pathOf({ page, sub: ANY_SUB }), "") : pageRequest(path ?? pathOf(asked), query ?? "");
        tellRequest(this.#calls, state, made);
      }
      tellOpened(this.#calls, state);
      answerConnected(this.#answers, connection, state, page, asked?.sub ?? ANY_SUB, selection?.page);
    });
  }

  selected(connection: number, request: number, selection: Selection, path: string, query: string | null = null): void {
    const state = this.#connections.get(connection);
    if (state === undefined) {
      this.#errors(`selected on connection ${connection}, which never connected`);
      return;
    }
    const { page, sub } = selection;
    const newPage = state.page !== page;
    state.request = request;
    this.#answering(connection, () => {
      const made = pageRequest(path, query ?? "");
      if (newPage) {
        tellRequestEnded(this.#calls, state);
        tellLeft(this.#calls, state);
        state.page = page;
        this.#navigation.reset(connection);
        tellRequest(this.#calls, state, made);
        tellOpened(this.#calls, state);
      } else {
        tellRequest(this.#calls, state, made);
      }
      answerSelected(this.#answers, connection, state, page, sub, newPage);
    });
  }

  left(connection: number, page: number): void {
    const state = this.#connections.get(connection);
    if (state?.page !== page) {
      return;
    }
    tellRequestEnded(this.#calls, state);
    tellLeft(this.#calls, state);
    state.page = null;
    state.sub = null;
  }

  input(connection: number, page: number, sub: number, input: Input): void {
    const state = this.#connections.get(connection);
    if (state === undefined) {
      this.#errors(`input on page ${pageText(page)} from connection ${connection}, which never connected`);
      return;
    }
    // On a page the channel does not serve, the keys still select pages (DEC-1543 item 4).
    const entry = this.#entries.get(page);
    const view = (): PageView => viewOf(this.#copies, state, page, sub);
    this.#current.from(connection, () => {
      // The keys are the sub-page's the input came from (DEC-6599): its own when the entry says each sub-page's. 3F7F names none: it is the one the connection was sent.
      const keys = entry?.keysOf?.(connection, sub === ANY_SUB ? (state.sub ?? sub) : sub) ?? entry ?? {};
      const navigated = this.#navigation.take(connection, input, keys, view().links);
      if (navigated.taken) {
        if (navigated.redirect !== null) {
          this.#sender.redirect(connection, navigated.redirect, ANY_SUB);
        }
        return;
      }
      let taken = false;
      if (entry !== undefined) {
        this.#callOwner(page, (application, context) => {
          taken = application.input?.(connection, page, input, context, sub) === true;
        });
      }
      if (!taken) {
        followClick(this.#sender, connection, input, view());
      }
    });
  }

  /** A rule of a page's table fired with no input of its own, or sent a value (page-rules.md RULE-37): the page's application hears it unchanged, as a call from the connection. */
  ruleEvent(event: ServerMessageRuleEvent): void {
    this.#current.from(event.connection, () => {
      this.#callOwner(numberOf(event.page), (application, context) => application.ruleEvent?.(event, context));
    });
  }

  /** A viewer's receiver reported a fault of a page's table (RULE-48): the page's application hears it unchanged. */
  rulesFault(fault: ServerMessageRulesFault): void {
    this.#current.from(fault.connection, () => {
      this.#callOwner(numberOf(fault.page), (application, context) => application.rulesFault?.(fault, context));
    });
  }

  /** The answer to a state query (RULE-38). */
  pageState(state: ServerMessagePageState): void {
    if (!this.#queries.answered(state.request, state)) {
      this.#errors(`the server answered state query ${state.request}, which nothing waits for`);
    }
  }

  /** The connection closed and will not come back (VS-351 item 6): forgotten, and every application told. */
  gone(connection: number): void {
    this.#connections.forget(connection);
    this.#navigation.forget(connection);
    this.#applications.gone(this.#known, this.#copies, connection, this.#host, this.#clock.now());
  }

  /** A connection that had no viewer now has one (VS-351 item 2). */
  viewerBegan(connection: number, handle: Handle, remembered: boolean): void {
    const state = this.#connections.get(connection);
    if (state === undefined) {
      this.#errors(`viewer_began on connection ${connection}, which is not open`);
      return;
    }
    const viewer = this.#viewers.of(handle);
    state.viewer = viewer;
    state.remembered = remembered;
    this.#each((application, context) => application.viewerBegan?.(connection, viewer, remembered, context));
  }

  /** The connection no longer carries a viewer (VS-351 item 3). */
  viewerLeft(connection: number): void {
    const state = this.#connections.get(connection);
    if (state !== undefined) {
      state.viewer = null;
      state.remembered = false;
    }
    this.#each((application, context) => application.viewerLeft?.(connection, context));
  }

  /** A state request or an offer to remember was not granted (VS-351 item 4). */
  stateRefused(connection: number, reason: StateRefusal): void {
    this.#each((application, context) => application.stateRefused?.(connection, reason, context));
  }

  /** Every handle the program knows is void (VS-351 item 5): no connection keeps its viewer. */
  viewersReset(): void {
    this.#viewers.clear();
    for (const [, state] of this.#connections.entries()) {
      state.viewer = null;
      state.remembered = false;
    }
    this.#each((application, context) => application.viewersReset?.(context));
  }

  /** A stored synthesizer sound was built (server.md SRV-47): every application that wants it hears it unchanged; one no application hears is passed over (typescript.md TS-23). */
  soundBuilt(report: ServerMessageSoundBuilt): void {
    this.#each((application, context) => application.soundBuilt?.(report, context));
  }

  /** The server's figures came: every application may show them. */
  stats(stats: ServerStats): void {
    this.#each((application, context) => {
      application.stats?.(stats, context);
    });
  }

  /** A web visitor is at the page's address: its description, with no connection in scope (REQ-1728). */
  describe(page: number): void {
    this.#app.send(descriptionMessage(page, this.#applications.describe(page), this.#copies.get("channel", page), this.#app.limits()));
  }

  /** The answer to a measure (REQ-2216). */
  measured(request: number, measured: ServerMessageMeasured): void {
    if (!this.#measures.answered(request, measured)) {
      this.#errors(`the server answered measure ${request}, which nothing waits for`);
    }
  }

  /** The answer to a measure of picture text (renderer parity PAR-22). */
  measuredPictureText(measured: ServerMessageMeasuredPictureText): void {
    if (!this.#pictureTextMeasures.answered(measured.request, measured)) {
      this.#errors(`the server answered picture text measure ${measured.request}, which nothing waits for`);
    }
  }

  /** A refusal (typescript.md TS-22): a measure's or a state query's rejects its promise; any other reaches every application's `refused`, or is reported when none has one. */
  refused(refusal: ServerMessageRefused): void {
    if (this.#measures.refused(refusal) || this.#pictureTextMeasures.refused(refusal) || this.#queries.refused(refusal)) {
      return;
    }
    if (this.#applications.hearsRefusals()) {
      this.#each((application, context) => application.refused?.(refusal, context));
      return;
    }
    this.#errors(
      `the server refused ${refusal.message ?? "a line"}: ${refusal.path === "" ? "the message" : refusal.path}: ${refusal.rule} (${refusal.detail})`,
    );
  }

  /**
   * The server asks for `selection` drawn for no one in particular, for a tab's thumbnail (tab-thumbnails.md section
   * 7.1; REQ-6901). The page's own selection runs for a stranger on a connection of the kit's own, numbered
   * `-snapshot`, with no viewer and no query, held apart from the server's connections: `joined`, `request` and
   * `opened`, as `connected` runs them. The answer is the sub-page that connection would be shown first, with the
   * picture sent to it alone, or the kept picture of that sub-page; it is declined when no application serves the page,
   * its entry says `snapshots: false`, the application denied or redirected it, there is nothing to show, its picture
   * passes its bound or a handler failed. Then the connection leaves the page and is gone, and is forgotten.
   */
  snapshot(snapshot: number, selection: Selection, path: string): void {
    const entry = this.#entries.get(selection.page);
    if (entry === undefined || entry.snapshots === false) {
      this.#app.send({ type: "snapshot_declined", snapshot });
      return;
    }
    const drawn = this.#snapshots.begin(snapshot, selection.page, selection.sub);
    const { state } = drawn;
    const { connection } = state;
    this.#drawing = connection;
    try {
      this.#current.from(connection, () => {
        this.#applications.know(this.#known, connection, this.#host, this.#clock.now());
        tellRequest(this.#calls, state, pageRequest(path, ""));
        tellOpened(this.#calls, state);
      });
    } catch (error) {
      this.#errors(`drawing snapshot ${snapshot} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    } finally {
      this.#drawing = null;
    }
    const answer = this.#snapshotAnswer(drawn);
    try {
      this.#app.send(answer);
    } catch (error) {
      this.#errors(`answering snapshot ${snapshot} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      this.#app.send({ type: "snapshot_declined", snapshot });
    }
    this.#current.from(connection, () => {
      tellRequestEnded(this.#calls, state);
      tellLeft(this.#calls, state);
    });
    this.#applications.gone(this.#known, this.#copies, connection, this.#host, this.#clock.now());
    this.#snapshots.end(connection);
  }

  /** What answers a snapshot drawn: its sub-page, resolved as a reply's is (answers.ts), and its picture; or a decline. */
  #snapshotAnswer(drawn: Snapshot): ProgramMessage {
    const { snapshot, page, sub, state } = drawn;
    const declined: ProgramMessage = { type: "snapshot_declined", snapshot };
    const copy = this.#copies.seen(state.connection, page);
    const shown = resolve(copy, sub);
    if (drawn.declined || copy === undefined || shown === undefined) {
      return declined;
    }
    const picture = this.#snapshots.pictureOf(drawn, shown);
    if (picture === undefined) {
      return declined;
    }
    const content = wirePage(page, shown, copy);
    return picture === null ? { type: "snapshot_page", snapshot, page: content } : { type: "snapshot_page", snapshot, page: content, picture };
  }

  /** When the channel next needs {@link Channel.deadline}, by its clock. */
  nextWake(): number | null {
    return this.#applications.nextWake();
  }

  /** The time has come for the applications whose wake is due now. */
  deadline(): void {
    this.#applications.wake(this.#host, this.#clock.now());
  }

  // Connections.

  /** `errors`, a failure reported while a snapshot is drawn declining it (REQ-6901 item 4). */
  #declining(errors: (text: string) => void): (text: string) => void {
    return (text): void => {
      if (this.#drawing !== null) {
        this.#snapshots.decline(this.#drawing);
      }
      errors(text);
    };
  }

  #answering(connection: number, answer: () => void): void {
    this.#current.answering(this.#connections, connection, this.#errors, answer);
  }

  #callOwner(page: number, run: (application: Application, context: Context) => void): void {
    this.#applications.owner(this.#host, this.#clock.now(), page, run);
  }

  #each(run: (application: Application, context: Context) => void): void {
    this.#applications.each(this.#host, this.#clock.now(), run);
  }
}

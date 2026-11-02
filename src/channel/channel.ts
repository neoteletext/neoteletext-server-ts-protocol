// A channel's applications in one program, on protocol version 7
// (DEC-1482): one connection a browser tab, one selection a connection
// (DEC-1527). Each `connected` and `selected` is answered with one
// sub-page (answers.ts); what an application publishes is kept (copies.ts)
// and sent, one sub-page at a time, to the connections whose selection
// shows it (sender.ts). Pages that do not use digits or the coloured keys
// get page selection by them (navigation.ts); a click the page does not
// take follows the prompt or the page number it is on.

// oxlint-disable import/max-dependencies -- the channel is where the protocol's parts meet: the wire, input, navigation, pages and applications
import type { Application, PageEntry } from "./application.ts";
import { type AnswerParts, answerConnected, answerSelected, followClick, viewOf } from "./answers.ts";
import { Applications } from "./applications.ts";
import type { ChannelOptions, Clock } from "./channel-options.ts";
import { type Connection, Connections } from "./connections.ts";
import type { Context, Host } from "./context.ts";
import { Copies, type Owner } from "./copies.ts";
import { descriptionMessage } from "./description.ts";
import { makeHost } from "./host.ts";
import { type PageCalls, tellLeft, tellOpened, tellRequest, tellRequestEnded } from "./page-calls.ts";
import { type PageRequest, cookiesByName, pageRequest } from "./request.ts";
import { Sender } from "./sender.ts";
import { ANY_SUB, pathOf } from "./wire-page.ts";
import type { Input } from "../input/input.ts";
import type { PageView } from "../navigation/clicked-link.ts";
import { Navigation } from "../navigation/navigation.ts";
import type { SubPageContent } from "../page/content.ts";
import { pageText } from "../page/page-numbers.ts";
import type { App } from "../wire/app.ts";
import type { Limits } from "../wire/limits.ts";
import type { WireMagazine } from "../wire/protocol.ts";
import type { ServerEvents } from "../wire/server-events.ts";
import type { CookiePair, Refusal, Selection } from "../wire/server-message.ts";
import type { ServerStats } from "../wire/stats.ts";

export { ANY_SUB };

/** The request a selection of `path` with `query` makes on `state`. */
function requestOf(state: Connection, path: string, query: string | null): PageRequest {
  return pageRequest(path, query ?? "", state.cookies);
}

/** The channel: its applications, the sessions and connections it has, and every page it keeps. */
export class Channel implements ServerEvents {
  readonly #applications: Applications;
  readonly #entries: ReadonlyMap<number, PageEntry>;
  readonly #titles: Map<number, string>;
  readonly #app: App;
  readonly #clock: Clock;
  readonly #errors: (text: string) => void;
  readonly #sessions = new Set<number>();
  readonly #connections = new Connections();
  readonly #copies = new Copies();
  readonly #sender: Sender;
  readonly #navigation: Navigation;
  readonly #host: Host;
  readonly #answers: AnswerParts;
  readonly #calls: PageCalls;
  /** The connection the call being run came from, if any. */
  #current: number | null = null;
  #epochAtStart = 0;

  /** A channel of `applications`, writing through `app`; the first application to declare a page serves it. */
  constructor(applications: readonly Application[], app: App, options: ChannelOptions) {
    this.#applications = new Applications(applications, options.errors);
    this.#entries = this.#applications.entries;
    this.#titles = this.#applications.titles;
    this.#app = app;
    this.#clock = options.clock;
    this.#errors = options.errors;
    this.#navigation = new Navigation((page) => this.#entries.has(page));
    this.#sender = new Sender(app, this.#connections, this.#copies, (): WireMagazine[] => this.#applications.index(this.#copies, this.#app.limits()));
    this.#host = makeHost({
      app,
      seed: options.seed,
      sender: this.#sender,
      copies: this.#copies,
      connections: this.#connections,
      titles: this.#titles,
      serves: (page) => this.#entries.has(page),
      sessions: this.#sessions,
      epochAtStart: () => this.#epochAtStart,
      wakeAt: (index, at) => {
        this.#applications.wakeAt(index, at);
      },
      current: () => this.#current,
      errors: this.#errors,
    });
    this.#answers = {
      copies: this.#copies,
      sender: this.#sender,
      index: (): WireMagazine[] => this.#applications.index(this.#copies, this.#app.limits()),
      errors: this.#errors,
    };
    this.#calls = {
      connections: this.#connections,
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

  /** The server said start, with the limits it keeps to: every session the program knew is over, and every application publishes its shared pages. */
  start(epochMs: number, limits: Limits): void {
    this.#epochAtStart = epochMs - this.#clock.now();
    this.#app.started(limits);
    this.#connections.clear();
    this.#navigation.clear();
    this.#applications.endEvery(this.#sessions, this.#copies, this.#host, this.#clock.now());
    this.#each((application, context) => {
      application.start(context);
    });
  }

  connected(
    connection: number,
    session: number,
    request: number,
    selection: Selection | null,
    cookies: readonly CookiePair[],
    path: string | null = null,
    query: string | null = null,
  ): void {
    // Added first: what `joined` sends goes to the connections open.
    const state = this.#connections.add(connection, session, request, cookiesByName(cookies));
    this.#applications.know(this.#sessions, session, this.#host, this.#clock.now());
    const asked = selection !== null && this.#entries.has(selection.page) ? selection : null;
    const page = asked?.page ?? this.#applications.initialPage();
    this.#answering(connection, () => {
      state.page = page ?? null;
      if (page !== undefined) {
        const made = asked === null ? requestOf(state, pathOf({ page, sub: ANY_SUB }), null) : requestOf(state, path ?? pathOf(asked), query);
        tellRequest(this.#calls, state, made);
      }
      tellOpened(this.#calls, connection, state);
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
      const made = requestOf(state, path, query);
      if (newPage) {
        tellRequestEnded(this.#calls, state);
        tellLeft(this.#calls, connection, state);
        state.page = page;
        this.#navigation.reset(connection);
        tellRequest(this.#calls, state, made);
        tellOpened(this.#calls, connection, state);
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
    tellLeft(this.#calls, connection, state);
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
    const { session } = state;
    const view = (): PageView => viewOf(this.#copies, state, page, sub);
    this.#current = connection;
    try {
      const navigated = this.#navigation.take(connection, input, entry ?? {}, view().links);
      if (navigated.taken) {
        if (navigated.redirect !== null) {
          this.#sender.redirect(connection, navigated.redirect, ANY_SUB);
        }
        return;
      }
      let taken = false;
      if (entry !== undefined) {
        this.#callOwner(page, (application, context) => {
          taken = application.input?.(session, page, input, context, sub) === true;
        });
      }
      if (!taken) {
        followClick(this.#sender, connection, input, view());
      }
    } finally {
      this.#current = null;
    }
  }

  closed(session: number): void {
    for (const connection of this.#connections.forgetSession(session)) {
      this.#navigation.forget(connection);
    }
    if (!this.#sessions.delete(session)) {
      return;
    }
    this.#copies.forget(session);
    this.#each((application, context) => {
      application.ended?.(session, context);
    });
  }

  /** The server's figures came: every application may show them. */
  stats(stats: ServerStats): void {
    this.#each((application, context) => {
      application.stats?.(stats, context);
    });
  }

  /** A web visitor is at the page's address: its description, with no session in scope (REQ-1728). */
  describe(page: number): void {
    this.#app.send(descriptionMessage(page, this.#applications.describe(page), this.#copies.get("channel", page), this.#app.limits()));
  }

  refused(refusal: Refusal): void {
    this.#errors(
      `the server refused ${refusal.message ?? "a line"}: ${refusal.path === "" ? "the message" : refusal.path}: ${refusal.rule} (${refusal.detail})`,
    );
  }

  /** When the channel next needs {@link Channel.deadline}, by its clock. */
  nextWake(): number | null {
    return this.#applications.nextWake();
  }

  /** The time has come for the applications whose wake is due now. */
  deadline(): void {
    this.#applications.wake(this.#host, this.#clock.now());
  }

  // Sessions and connections.

  /** Runs `answer` for `connection`, held back from every other sending until the answer is sent; a failure is reported. */
  #answering(connection: number, answer: () => void): void {
    const state = this.#connections.get(connection);
    if (state === undefined) {
      return;
    }
    state.pending = true;
    state.denied = null;
    this.#current = connection;
    try {
      answer();
    } catch (error) {
      this.#errors(`answering connection ${connection} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    } finally {
      state.pending = false;
      this.#current = null;
    }
  }

  #callOwner(page: number, run: (application: Application, context: Context) => void): void {
    this.#applications.owner(this.#host, this.#clock.now(), page, run);
  }

  #each(run: (application: Application, context: Context) => void): void {
    this.#applications.each(this.#host, this.#clock.now(), run);
  }
}

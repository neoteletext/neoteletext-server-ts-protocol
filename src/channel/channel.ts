// A channel's applications in one program. Pages that do not use digits or
// the coloured keys themselves get page selection by them
// (navigation/navigation.ts), so every page can be left by number or by
// Fastext; a click the page does not take follows the prompt or the page
// number it is on.

// oxlint-disable import/max-dependencies -- the channel is where the protocol's parts meet: the wire, input, navigation, pages and applications
import type { Application, PageEntry } from "./application.ts";
import { Context, type Host } from "./context.ts";
import { NO_VIEW } from "./page-view.ts";
import { Random } from "./random.ts";
import { type Input, clicked } from "../input/input.ts";
import { type PageView, clickedLink } from "../navigation/clicked-link.ts";
import { Navigation } from "../navigation/navigation.ts";
import { pageText } from "../page/page-numbers.ts";
import { App, type PageDeclaration } from "../wire/app.ts";
import type { ServerEvents } from "../wire/server-events.ts";
import type { ServerStats } from "../wire/stats.ts";

/** The channel's clock: milliseconds since the program started, never going back. */
export interface Clock {
  now(): number;
}

export interface ChannelOptions {
  readonly clock: Clock;
  readonly seed: bigint;
  /** Where a failing application is reported: standard error. */
  readonly errors: (text: string) => void;
}

/** The channel: its applications, the sessions it has seen, and each page's links as each viewer sees them. */
export class Channel implements ServerEvents {
  readonly #applications: readonly Application[];
  readonly #app: App;
  readonly #clock: Clock;
  readonly #errors: (text: string) => void;
  readonly #entries = new Map<number, PageEntry>();
  readonly #owners = new Map<number, number>();
  readonly #wakes: (number | null)[];
  readonly #sessions = new Set<number>();
  readonly #shared = new Map<number, PageView>();
  readonly #own = new Map<number, Map<number, PageView>>();
  readonly #navigation: Navigation;
  readonly #host: Host;
  #epochAtStart = 0;

  /** A channel of `applications`, writing through `app`; the first application to declare a page serves it. */
  constructor(applications: readonly Application[], app: App, options: ChannelOptions) {
    this.#applications = applications;
    this.#app = app;
    this.#clock = options.clock;
    this.#errors = options.errors;
    this.#wakes = applications.map(() => null);
    applications.forEach((application, index) => {
      for (const entry of application.pages()) {
        if (!this.#entries.has(entry.page)) {
          this.#entries.set(entry.page, entry);
          this.#owners.set(entry.page, index);
        }
      }
    });
    this.#navigation = new Navigation((page) => this.#entries.has(page));
    this.#host = {
      app,
      random: new Random(options.seed),
      epochAtStart: (): number => this.#epochAtStart,
      wakeAt: (index, at): void => {
        const wake = this.#wakes[index];
        this.#wakes[index] = wake === null || wake === undefined ? at : Math.min(wake, at);
      },
      published: (owner, page, view): void => {
        if (owner === "channel") {
          this.#shared.set(page, view);
        } else {
          const own = this.#own.get(owner) ?? new Map<number, PageView>();
          own.set(page, view);
          this.#own.set(owner, own);
        }
      },
      released: (session, page): boolean => this.#own.get(session)?.delete(page) ?? false,
    };
    this.#epochAtStart = Date.now() - this.#clock.now();
  }

  /** The pages, in the order the applications declare them, for the first line. */
  declarations(): PageDeclaration[] {
    return [...this.#entries.values()].map(({ page, title, section }): PageDeclaration => (section === undefined ? { page, title } : { page, title, section }));
  }

  entries(): readonly PageEntry[] {
    return [...this.#entries.values()];
  }

  /** The server said start: every application publishes its shared pages. */
  start(epochMs: number): void {
    this.#epochAtStart = epochMs - this.#clock.now();
    this.#applications.forEach((_, index) => {
      this.#call(index, (application, context) => {
        application.start(context);
      });
    });
  }

  join(session: number): void {
    this.#know(session);
  }

  open(session: number, page: number): void {
    this.#know(session);
    this.#navigation.reset(session);
    this.#callOwner(page, (application, context) => {
      application.opened?.(session, page, context);
    });
  }

  leave(session: number, page: number): void {
    this.#know(session);
    this.#callOwner(page, (application, context) => {
      application.leftPage?.(session, page, context);
    });
  }

  input(session: number, page: number, input: Input): void {
    this.#know(session);
    const entry = this.#entries.get(page);
    if (entry === undefined) {
      this.#errors(`input on page ${pageText(page)}, which no application serves`);
      return;
    }
    const view = (): PageView => this.#own.get(session)?.get(page) ?? this.#shared.get(page) ?? NO_VIEW;
    const navigated = this.#navigation.take(session, input, entry, view().links);
    if (navigated.taken) {
      if (navigated.goto !== null) {
        this.#app.goto(session, navigated.goto);
      }
      return;
    }
    let taken = false;
    this.#callOwner(page, (application, context) => {
      taken = application.input?.(session, page, input, context) === true;
    });
    if (!taken && clicked(input) && input.kind === "mouse") {
      const link = clickedLink(view(), input.column, input.row);
      if (link !== null) {
        this.#app.goto(session, link);
      }
    }
  }

  close(session: number): void {
    if (!this.#sessions.delete(session)) {
      return;
    }
    this.#own.delete(session);
    this.#navigation.forget(session);
    this.#applications.forEach((_, index) => {
      this.#call(index, (application, context) => {
        application.ended?.(session, context);
      });
    });
  }

  /** The server's figures came: every application may show them. */
  stats(stats: ServerStats): void {
    this.#applications.forEach((_, index) => {
      this.#call(index, (application, context) => {
        application.stats?.(stats, context);
      });
    });
  }

  /** When the channel next needs {@link Channel.deadline}, by its clock. */
  nextWake(): number | null {
    const wakes = this.#wakes.filter((wake): wake is number => wake !== null);
    return wakes.length === 0 ? null : Math.min(...wakes);
  }

  /** The time has come for the applications whose wake is due now. */
  deadline(): void {
    const now = this.#clock.now();
    this.#wakes.forEach((wake, index) => {
      if (wake !== null && wake <= now) {
        this.#wakes[index] = null;
        this.#call(index, (application, context) => {
          application.wake?.(context);
        });
      }
    });
  }

  /**
   * A session the channel has not seen joins as it is first named: the
   * server says `join` once, so after this program is started again the
   * sessions it already had arrive without one.
   */
  #know(session: number): void {
    if (this.#sessions.has(session)) {
      return;
    }
    this.#sessions.add(session);
    this.#applications.forEach((_, index) => {
      this.#call(index, (application, context) => {
        application.joined?.(session, context);
      });
    });
  }

  #callOwner(page: number, run: (application: Application, context: Context) => void): void {
    const index = this.#owners.get(page);
    if (index !== undefined) {
      this.#call(index, run);
    }
  }

  /** Runs one application with a context; a failure is reported, and the channel goes on serving. */
  #call(index: number, run: (application: Application, context: Context) => void): void {
    const application = this.#applications[index];
    if (application === undefined) {
      return;
    }
    try {
      run(application, new Context(this.#host, index, this.#clock.now()));
    } catch (error) {
      this.#errors(`application ${index} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
  }
}

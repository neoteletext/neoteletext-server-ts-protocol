// The channel's applications: the pages each serves (the first to name a
// page serves it), the titles the index lists them under, when each asked
// to wake, and each call into one, a failure reported and the channel
// going on.

import type { Application, PageDescription, PageEntry } from "./application.ts";
import { channelIndex } from "./channel-index.ts";
import { Context, type Host } from "./context.ts";
import type { Copies } from "./copies.ts";
import { FIRST_PAGE, isReserved, pageText } from "../page/page-numbers.ts";
import type { Limits } from "../wire/limits.ts";
import type { Magazine } from "../wire/generated/protocol.js";

/** The channel's applications, and what it knows of their pages. */
export class Applications {
  readonly #applications: readonly Application[];
  readonly #errors: (text: string) => void;
  readonly entries = new Map<number, PageEntry>();
  readonly #owners = new Map<number, number>();
  readonly titles = new Map<number, string>();
  readonly #wakes: (number | null)[];

  constructor(applications: readonly Application[], errors: (text: string) => void) {
    this.#applications = applications;
    this.#errors = errors;
    this.#wakes = applications.map(() => null);
    applications.forEach((application, index) => {
      for (const entry of application.pages()) {
        if (isReserved(entry.page)) {
          errors(`page ${pageText(entry.page)} is reserved by the standard (EN 300 706 Annex A.10): no index lists it`);
        } else if (!this.entries.has(entry.page)) {
          this.entries.set(entry.page, entry);
          this.#owners.set(entry.page, index);
          this.titles.set(entry.page, entry.title);
        }
      }
    });
  }

  /** The index `connection` is sent: each page's title as it is now, and its sub-pages as the copy the connection sees has them, its own or the channel's. */
  index(copies: Copies, limits: Limits, connection: number): Magazine[] {
    return channelIndex(
      [...this.entries.values()],
      { title: (page): string => this.titles.get(page) ?? "", subpages: (page): number => copies.seen(connection, page)?.subpages.size ?? 1 },
      limits,
      this.#errors,
    );
  }

  /** The page a connection with no selection opens on: 100 when the channel has it, otherwise its lowest. */
  initialPage(): number | undefined {
    return this.entries.has(FIRST_PAGE) ? FIRST_PAGE : [...this.entries.keys()].toSorted((one, two) => one - two)[0];
  }

  /** Asks for application `index`'s wake at `at`; the earliest asked for wins. */
  wakeAt(index: number, at: number): void {
    const wake = this.#wakes[index];
    this.#wakes[index] = wake === null || wake === undefined ? at : Math.min(wake, at);
  }

  /** When an application next needs waking. */
  nextWake(): number | null {
    const wakes = this.#wakes.filter((wake): wake is number => wake !== null);
    return wakes.length === 0 ? null : Math.min(...wakes);
  }

  /** Wakes each application whose wake is due at `now`. */
  wake(host: Host, now: number): void {
    this.#wakes.forEach((wake, index) => {
      if (wake !== null && wake <= now) {
        this.#wakes[index] = null;
        this.call(host, now, index, (application, context) => {
          application.wake?.(context);
        });
      }
    });
  }

  /** Runs `run` on every application. */
  each(host: Host, now: number, run: (application: Application, context: Context) => void): void {
    this.#applications.forEach((_, index) => {
      this.call(host, now, index, run);
    });
  }

  /** A connection not among `known` joins as it is first named. */
  know(known: Set<number>, connection: number, host: Host, now: number): void {
    if (!known.has(connection)) {
      known.add(connection);
      this.each(host, now, (application, context) => {
        application.joined?.(connection, context);
      });
    }
  }

  /** The connection is gone (VS-351 item 6): its copies go, and every application hears it; false for a connection not known. */
  gone(known: Set<number>, copies: Copies, connection: number, host: Host, now: number): boolean {
    if (!known.delete(connection)) {
      return false;
    }
    copies.forget(connection);
    this.each(host, now, (application, context) => {
      application.gone?.(connection, context);
    });
    return true;
  }

  /**
   * After `start` the server tells the program of every connection afresh,
   * and says nothing of those it no longer has, which only this can end
   * (REQ-1056). Each application hears `gone` for each, before its `start`,
   * so that what it holds is gone before it mounts or publishes anything.
   * The channel's copies stay: `start` replaces them.
   */
  endEvery(known: Set<number>, copies: Copies, host: Host, now: number): void {
    // A set's iteration passes over what is deleted from it as it goes, and visits each that stays once.
    for (const connection of known) {
      this.gone(known, copies, connection, host, now);
    }
  }

  /** Whether any application hears refusals itself (typescript.md TS-22). */
  hearsRefusals(): boolean {
    return this.#applications.some((application) => application.refused !== undefined);
  }

  /** Runs `run` on the application that serves `page`. */
  owner(host: Host, now: number, page: number, run: (application: Application, context: Context) => void): void {
    const index = this.#owners.get(page);
    if (index !== undefined) {
      this.call(host, now, index, run);
    }
  }

  /** What the application that serves `page` says of it for the web; a failure is reported, and the page is then not public. */
  describe(page: number): PageDescription | null {
    const index = this.#owners.get(page);
    const application = index === undefined ? undefined : this.#applications[index];
    try {
      return application?.describe?.(page) ?? null;
    } catch (error) {
      this.#errors(`describing ${pageText(page)} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      return null;
    }
  }

  /** Runs one application with a context; a failure is reported, and the channel goes on serving. */
  call(host: Host, now: number, index: number, run: (application: Application, context: Context) => void): void {
    const application = this.#applications[index];
    if (application === undefined) {
      return;
    }
    try {
      run(application, new Context(host, index, now));
    } catch (error) {
      this.#errors(`application ${index} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
  }
}

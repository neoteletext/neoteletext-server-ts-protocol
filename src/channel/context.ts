// An application's view of the channel during one call: it answers
// through this, which writes the protocol's lines.

import { NO_VIEW, viewOf } from "./page-view.ts";
import { Random } from "./random.ts";
import type { PageView } from "../navigation/clicked-link.ts";
import { Screen } from "../page/screen.ts";
import type { Subpage } from "../page/subpage.ts";
import type { Audience, SoundMember } from "../sound/members.ts";
import { readTti } from "../tti/read-tti.ts";
import { App, type Owner } from "../wire/app.ts";
import type { Limits } from "../wire/limits.ts";

/** What a context reaches of its channel. */
export interface Host {
  readonly app: App;
  readonly random: Random;
  epochAtStart(): number;
  wakeAt(index: number, at: number): void;
  published(owner: Owner, page: number, view: PageView): void;
  released(session: number, page: number): boolean;
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

  /** Publishes a page drawn on a screen, as its one sub-page. */
  publish(owner: Owner, page: number, screen: Screen): void {
    this.publishSubpages(owner, page, [{ screen }]);
  }

  /** Publishes a page with its sub-pages, in their order, the server numbering them ({@link App.publish}). */
  publishSubpages(owner: Owner, page: number, subpages: readonly Subpage[]): void {
    this.#host.app.publish(owner, page, subpages);
    const first = subpages[0]?.screen;
    this.#host.published(owner, page, first === undefined ? NO_VIEW : viewOf(first));
  }

  /** Publishes a page from TTI written elsewhere, such as a converted picture's file ({@link App.publishTti}). */
  publishTti(owner: Owner, page: number, text: string): void {
    this.#host.app.publishTti(owner, page, text);
    const first = readTti(text)[0];
    const links = first?.links ?? [];
    this.#host.published(owner, page, { rows: first?.rows ?? [], links: [links[0] ?? null, links[1] ?? null, links[2] ?? null, links[3] ?? null] });
  }

  /** Puts sub-pages in a page, each by its sub-code, keeping its others ({@link App.put}). */
  put(owner: Owner, page: number, subpages: readonly Subpage[]): void {
    this.#host.app.put(owner, page, subpages);
  }

  /** Ends the sub-pages of `subcodes` in a page, keeping its others ({@link App.remove}). */
  remove(owner: Owner, page: number, subcodes: readonly number[]): void {
    this.#host.app.remove(owner, page, subcodes);
  }

  /** Sends the session's viewer to `page` (INPUT.md section 7.1). */
  goto(session: number, page: number): void {
    this.#host.app.goto(session, page);
  }

  /** The title `contents.txt` lists one of the channel's pages under now, if it has the page. */
  titleOf(page: number): string | undefined {
    return this.#host.app.titleOf(page);
  }

  /** Gives `page` a new title in the channel's contents, for what it holds now (docs/applications.md section 3.5). */
  title(page: number, title: string): void {
    this.#host.app.title(page, title);
  }

  /**
   * Drops the session's own copy of `page`: from now on it sees the
   * channel's copy, as every viewer does, and is sent it at once
   * (docs/applications.md section 3.6). Nothing is sent if it has none.
   */
  release(session: number, page: number): void {
    if (this.#host.released(session, page)) {
      this.#host.app.release(session, page);
    }
  }

  /** Sends a sound (docs/applications.md section 3.4). */
  sound(to: Audience, member: SoundMember): void {
    this.#host.app.sound(to, member);
  }

  /** Asks for `wake` at `at`, in milliseconds; the earliest asked for wins. */
  wakeAt(at: number): void {
    this.#host.wakeAt(this.#index, at);
  }

  /** Asks for `wake` in `delay` milliseconds. */
  wakeIn(delay: number): void {
    this.wakeAt(this.#now + delay);
  }

  log(text: string): void {
    this.#host.app.log(text);
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

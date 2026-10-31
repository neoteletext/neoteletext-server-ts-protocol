// The pages the program has drawn, which it keeps itself since the server
// keeps none (REQ-1474; DEC-1482 leaves caching to the program): for each
// page, the channel's copy every viewer sees and each session's own copy,
// each sub-page by its sub-code in ascending order (DEC-1526), with the
// page's sub-page list's version. A sub-page is sent from here, one at a
// time, as a connection selects it or as it changes (REQ-1501).

import type { SubPageContent } from "../page/content.ts";
import { Copy } from "./copy.ts";

/** Who a copy belongs to: the channel's one shared copy, or one session's own. */
export type Owner = "channel" | number;

/** A sub-page given to be kept. */
export interface GivenSubPage {
  readonly sub: number;
  readonly content: SubPageContent;
  readonly title: string | null;
}

/** What a change did to a copy: which sub-pages changed, and whether its list and its count did. */
export interface Change {
  readonly changed: ReadonlySet<number>;
  readonly listChanged: boolean;
  readonly countBefore: number;
  readonly countAfter: number;
}

/** The highest version of a list: sixteen bits (the schema's `subpages.version`). */
const LAST_VERSION = 0xffff;

/** Every copy of every page. */
export class Copies {
  readonly #copies = new Map<Owner, Map<number, Copy>>();
  /** How many times each owner's copy of each page changed: for tests. */
  readonly #changes = new Map<string, number>();
  /**
   * The last list version of each page, whoever's copy changed: the server
   * skips a list whose version a connection holds, so two copies of one
   * page must never give two lists the same version (DEC-1543 item 3).
   */
  readonly #versions = new Map<number, number>();

  get(owner: Owner, page: number): Copy | undefined {
    return this.#copies.get(owner)?.get(page);
  }

  /** The copy `session` sees of `page`: its own, or the channel's. */
  seen(session: number, page: number): Copy | undefined {
    return this.get(session, page) ?? this.get("channel", page);
  }

  changes(owner: Owner, page: number): number {
    return this.#changes.get(`${String(owner)}:${page}`) ?? 0;
  }

  /** Puts `given` in the owner's copy of `page`: in place of all its sub-pages when `whole`, else beside those it keeps. */
  put(owner: Owner, page: number, given: readonly GivenSubPage[], whole: boolean): Change {
    const pages = this.#copies.get(owner) ?? new Map<number, Copy>();
    this.#copies.set(owner, pages);
    const copy = pages.get(page) ?? new Copy();
    pages.set(page, copy);
    const before = copy.listKey();
    const countBefore = copy.subpages.size;
    const changed = new Set<number>();
    if (whole) {
      const kept = new Set(given.map(({ sub }) => sub));
      for (const sub of copy.subs()) {
        if (!kept.has(sub)) {
          copy.subpages.delete(sub);
        }
      }
    }
    for (const { sub, content, title } of given) {
      const json = JSON.stringify(content);
      if (copy.subpages.get(sub)?.json !== json) {
        changed.add(sub);
      }
      copy.subpages.set(sub, { content, json, title });
    }
    return this.#changed(owner, page, copy, before, countBefore, changed);
  }

  /** Takes the sub-pages of `subs` out of the owner's copy of `page`; a copy left with none goes. */
  remove(owner: Owner, page: number, subs: readonly number[]): Change {
    const copy = this.get(owner, page) ?? new Copy();
    const before = copy.listKey();
    const countBefore = copy.subpages.size;
    for (const sub of subs) {
      copy.subpages.delete(sub);
    }
    if (copy.subpages.size === 0) {
      this.#copies.get(owner)?.delete(page);
    }
    return this.#changed(owner, page, copy, before, countBefore, new Set());
  }

  /** Drops the session's own copy of `page`: whether it had one. */
  release(session: number, page: number): boolean {
    return this.#copies.get(session)?.delete(page) ?? false;
  }

  /** Forgets every copy of the session's. */
  forget(session: number): void {
    this.#copies.delete(session);
  }

  #changed(owner: Owner, page: number, copy: Copy, before: string, countBefore: number, changed: ReadonlySet<number>): Change {
    const listChanged = copy.listKey() !== before;
    if (listChanged) {
      const last = this.#versions.get(page) ?? 0;
      copy.version = last === LAST_VERSION ? 0 : last + 1;
      this.#versions.set(page, copy.version);
    }
    if (listChanged || changed.size > 0) {
      const key = `${String(owner)}:${page}`;
      this.#changes.set(key, (this.#changes.get(key) ?? 0) + 1);
    }
    return { changed, listChanged, countBefore, countAfter: copy.subpages.size };
  }
}

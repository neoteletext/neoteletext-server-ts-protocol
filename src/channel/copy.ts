// One copy of a page the program keeps (copies.ts): its sub-pages by
// sub-code, in ascending order (DEC-1526), and its sub-page list's version.

import type { SubPageContent } from "../page/content.ts";

/** One sub-page kept: its content, the same content as JSON to tell a change, and its title in the page's list. */
export interface KeptSubPage {
  readonly content: SubPageContent;
  readonly json: string;
  readonly title: string | null;
}

/** One copy of a page: its sub-pages in ascending sub-code order, and its list's version, 0 to 65,535. */
export class Copy {
  readonly subpages = new Map<number, KeptSubPage>();
  version = 0;

  /** The sub-codes in ascending order. */
  subs(): number[] {
    return [...this.subpages.keys()].toSorted((one, two) => one - two);
  }

  /** The first sub-page in ascending order, which a page selection shows (DEC-1526). */
  first(): number | undefined {
    return this.subs()[0];
  }

  /** The list as the server takes it: each sub-code and its title. */
  listKey(): string {
    return JSON.stringify(this.subs().map((sub) => [sub, this.subpages.get(sub)?.title ?? null]));
  }
}

// The channels the rule table's tests run: pages published blank, and the
// calls a page makes when a connection types on it (page-rules.md RULE-55).

import type { Application, Context, PageEntry } from "../../src/index.ts";
import { Screen } from "../../src/index.ts";
import { Harness } from "../../src/testing/index.ts";

/** The page the tests' channels serve. */
export const INDEX = 0x100;
/** The sub-code the tests name: a page is its number and its sub-code together (RULE-112). */
export const SUB = 0x0001;

/** An application of `pages` that publishes each blank, with `handlers`. */
export function serving(pages: readonly number[], handlers: Partial<Application>): Application {
  return {
    pages: (): PageEntry[] => pages.map((page) => ({ page, title: "Page" })),
    start: (context): void => {
      for (const page of pages) {
        context.publish("channel", page, new Screen());
      }
    },
    ...handlers,
  };
}

/** The lines of one type the channel wrote. */
export function written(harness: Harness, type: string): Readonly<Record<string, unknown>>[] {
  return harness.sent.filter((line) => line["type"] === type);
}

/** A harness whose index page, when connection 7 types, has `send` make its calls. */
export function calling(send: (context: Context) => void): Harness {
  const harness = new Harness([
    serving([INDEX], {
      input: (_connection, _page, _input, context): void => {
        send(context);
      },
    }),
  ]);
  harness.join(7, INDEX);
  harness.typeText(7, "x");
  return harness;
}

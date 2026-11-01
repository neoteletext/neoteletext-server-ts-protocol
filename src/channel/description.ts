// A page's description for the web (REQ-1728): the answer to `describe`. Not
// public is what every path comes to unless an application says public in so
// many words and the channel has a copy of the page to show. The sub-page is
// always the channel's own copy, never a viewer's.

import type { PageDescription } from "./application.ts";
import { fitText } from "./channel-index.ts";
import type { Copy } from "./copy.ts";
import { wirePage } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";
import type { Limits } from "../wire/limits.ts";
import type { ProgramMessage } from "../wire/protocol.ts";

/** `text` as the server takes a description's: on one line, in normalisation form C, within `most` characters. */
function oneLine(text: string, most: number): string {
  return fitText(text.replaceAll(/\s+/gu, " ").trim(), most).trim();
}

/** The `description` of `page`: what `description` says of it, if it is public, with the first sub-page of the channel's copy. */
export function descriptionMessage(page: number, description: PageDescription | null, copy: Copy | undefined, limits: Limits): ProgramMessage {
  const number = pageText(page);
  const sub = copy?.first();
  const title = oneLine(description?.title ?? "", limits.budgets.titleCharacters);
  const text = oneLine(description?.text ?? "", limits.budgets.descriptionTextCharacters);
  if (description?.public !== true || copy === undefined || sub === undefined || title === "" || text === "") {
    return { type: "description", page: number, public: false };
  }
  return { type: "description", page: number, public: true, title, text, content: wirePage(page, sub, copy) };
}

// A page's description for the web (REQ-1728): the answer to `describe`. Not
// public is what every path comes to unless an application says public in so
// many words and the channel has a copy of the page to show. The sub-page is
// always the channel's own copy, never a viewer's. A ReGIS or NAPLPS
// picture may be given beside it, which the server draws as the page's
// picture (renderer parity PAR-26).

import type { DescribedPicture, PageDescription } from "./application.ts";
import { fitText } from "./channel-index.ts";
import type { Copy } from "./copy.ts";
import { textBytes } from "./text-bytes.ts";
import { subText, wirePage } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";
import type { Limits } from "../wire/limits.ts";
import type { DescriptionPicture, ProgramMessage } from "../wire/generated/protocol.js";

/** `text` as the server takes a description's: on one line, in normalisation form C, within `most` characters. */
function oneLine(text: string, most: number): string {
  return fitText(text.replaceAll(/\s+/gu, " ").trim(), most).trim();
}

/** A described page's picture as the message carries it (PAR-26): a kept picture by its sub-code, or its bytes, ReGIS text a byte a character. */
function pictureOf(picture: DescribedPicture): DescriptionPicture {
  if ("kept" in picture) {
    return { kept: subText(picture.kept) };
  }
  const data = textBytes("description", picture.data);
  return picture.objects === undefined ? { language: picture.language, data } : { language: picture.language, data, objects: picture.objects };
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
  const content = wirePage(page, sub, copy);
  return description.picture === undefined
    ? { type: "description", page: number, public: true, title, text, content }
    : { type: "description", page: number, public: true, title, text, content, picture: pictureOf(description.picture) };
}

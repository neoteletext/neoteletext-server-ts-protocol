// `start` as the server writes it to the fixture channel: the standard's
// maxima and the server's budgets, at the kit's protocol. Written from the
// testing entry's SERVER_LIMITS and SERVER_LANGUAGES, the kit's one copy of
// what the server sends, so the two cannot disagree.

import { SERVER_LANGUAGES, SERVER_LIMITS } from "../../src/testing/index.ts";
import { PROTOCOL } from "../../src/wire/limits.ts";

const { standard, budgets } = SERVER_LIMITS;

/** The server's first line to a program it starts. */
export const START_LINE = JSON.stringify({
  type: "start",
  protocol: PROTOCOL,
  epoch_ms: 0,
  standard: {
    magazines: standard.magazines,
    pages: standard.pages,
    pages_per_magazine: standard.pagesPerMagazine,
    pages_in_magazine_1: standard.pagesInMagazine1,
    keyable_pages: standard.keyablePages,
    subpages: standard.subpages,
    decimal_subpages: standard.decimalSubpages,
    numbered_subpages: standard.numberedSubpages,
    link_target_bytes: standard.linkTargetBytes,
  },
  budgets: {
    line_bytes: budgets.lineBytes,
    title_characters: budgets.titleCharacters,
    author_log_bytes: budgets.authorLogBytes,
    log_characters: budgets.logCharacters,
    named_connections: budgets.namedConnections,
    reply_limit_ms: budgets.replyLimitMs,
    description_text_characters: budgets.descriptionTextCharacters,
    description_limit_ms: budgets.descriptionLimitMs,
  },
  languages: SERVER_LANGUAGES,
});

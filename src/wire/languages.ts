// The languages a page or a run of text may name: `start.languages`, the
// engine's table in its order (REQ-2215). A program lays text out by them:
// which way a language is written, and whether its marks take the rows
// above and below its letters (Thai and Lao, the engine's DEC-604).

import type { WireLanguageTag } from "./protocol.ts";
import type { WireLanguageEntry } from "./server-wire.ts";

/** A language's BCP 47 tag, as `start.languages` names it. */
export type LanguageTag = WireLanguageTag;

/** One language the server writes, as `start` lists it. */
export interface Language {
  readonly tag: LanguageTag;
  /** Its English name. */
  readonly name: string;
  /** Right to left: the server puts its text in visual order, and a layout starts from the right. */
  readonly direction: "ltr" | "rtl";
  /** 1 when its marks take the row above and the row below its letters, else 0. */
  readonly markRows: 0 | 1;
}

/** `start.languages`, which the schema has checked. */
export function readLanguages(languages: readonly WireLanguageEntry[]): readonly Language[] {
  return languages.map(({ tag, name, direction, mark_rows: markRows }) => ({ tag, name, direction, markRows }));
}

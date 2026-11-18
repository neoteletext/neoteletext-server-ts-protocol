// A picture's bytes as a program gives them to `regis` and `naplps`
// (renderer parity PAR-21): bytes, text written a byte a character, or a
// list of parts, each bytes or Unicode text the server writes in the
// provided character sets with the engine's encoder (DEC-6669). The kit
// joins bytes that stand together into one part, so that a builder's many
// commands take one part, and sends a list as the message's `parts`.

import { textBytes } from "../channel/text-bytes.ts";
import type { PicturePart as WirePart } from "../wire/generated/protocol.js";
import type { LanguageTag } from "../wire/languages.ts";

/** Unicode text in a picture (PAR-21): the server writes it in the language's own provided sets and Latin English, in visual order. */
export interface PictureText {
  /** 1 to 1,000 characters in Unicode normalisation form C, with no control or bidirectional formatting character. */
  readonly text: string;
  /** A tag of `start.languages`; none for Latin English. */
  readonly language?: LanguageTag;
  /** The text came from outside the program: a character its language cannot show becomes the language's stand-in rather than refusing the message (DEC-2326). */
  readonly outside?: boolean;
}

/** One part of a picture's bytes: bytes, text written a byte a character (Latin-1, as `regis` writes ReGIS text), or {@link PictureText}. */
export type PicturePart = Uint8Array | string | PictureText;

/** A picture's bytes as `regis` and `naplps` take them: bytes, text written a byte a character, or parts. */
export type PictureData = string | Uint8Array | readonly PicturePart[];

/** The message's bytes field: `data` for bytes, `parts` for a list, its bytes that stand together joined into one part. */
export function pictureFields(call: string, data: PictureData): { readonly data: Uint8Array } | { readonly parts: WirePart[] } {
  if (typeof data === "string" || data instanceof Uint8Array) {
    return { data: textBytes(call, data) };
  }
  const parts: WirePart[] = [];
  let pending: Uint8Array[] = [];
  const flush = (): void => {
    if (pending.length > 0) {
      parts.push({ data: Buffer.concat(pending) });
      pending = [];
    }
  };
  for (const part of data) {
    if (typeof part === "string" || part instanceof Uint8Array) {
      pending.push(textBytes(call, part));
      continue;
    }
    flush();
    parts.push({ text: part.text, ...(part.language === undefined ? {} : { language: part.language }), ...(part.outside === true ? { outside: true } : {}) });
  }
  flush();
  return { parts };
}

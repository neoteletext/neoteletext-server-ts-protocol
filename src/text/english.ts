// Text as the teletext English G0 set can show it (EN 300 706 Table 36,
// the English national option subset): each character becomes the code
// that shows it, or the nearest the set has.

import { romanised } from "./cyrillic.ts";
import { FOLDS, SIGNS } from "./signs.ts";

/** The code of a space (EN 300 706 Table 35). */
export const SPACE_CODE = 0x20;

/** The first printable code of the G0 set. */
const FIRST_PRINTABLE = 0x20;

/** The last code below DEL, which the G0 set shows as a block. */
const LAST_PRINTABLE = 0x7e;

/** DEL, then the C1 controls to U+009F: control characters, as those below 0x20 are. */
const DELETE = 0x7f;

const LAST_C1_CONTROL = 0x9f;

/** What a character the set cannot show, nor fold to one it can, becomes. */
export const UNSHOWN = "?";

const UNSHOWN_CODE = UNSHOWN.codePointAt(0) ?? SPACE_CODE;

/** Combining diacritical marks, U+0300 to U+036F: dropped, the letter shown without them. */
const COMBINING_FIRST = 0x0300;

const COMBINING_LAST = 0x036f;

/**
 * The characters `character` (one code point) is shown as: itself where
 * the set has it, its fold, "" for a combining mark, or undefined where
 * the set has nothing near it.
 */
export function foldCharacter(character: string): string | undefined {
  if (SIGNS.has(character)) {
    return character;
  }
  const fold = FOLDS.get(character);
  if (fold !== undefined) {
    return fold;
  }
  const point = character.codePointAt(0) ?? 0;
  if (point >= FIRST_PRINTABLE && point <= LAST_PRINTABLE) {
    return character;
  }
  if (point >= COMBINING_FIRST && point <= COMBINING_LAST) {
    return "";
  }
  if (/^\s$/u.test(character)) {
    return " ";
  }
  return romanised(point);
}

/**
 * `text` as codes of the English G0 set, one or more a character: what
 * the set cannot show becomes `?`, a control character a space.
 */
export function englishCodes(text: string): number[] {
  const codes: number[] = [];
  for (const character of text) {
    const shown = foldCharacter(character);
    if (shown === undefined) {
      const point = character.codePointAt(0) ?? 0;
      const control = point < FIRST_PRINTABLE || (point >= DELETE && point <= LAST_C1_CONTROL);
      codes.push(control ? SPACE_CODE : UNSHOWN_CODE);
      continue;
    }
    for (const piece of shown) {
      codes.push(SIGNS.get(piece) ?? piece.codePointAt(0) ?? SPACE_CODE);
    }
  }
  return codes;
}

// Sub-codes for a page given whole, its sub-pages in their order and no
// sub-codes named: the kit numbers them by place, since a sub-page always
// travels with its own sub-code (REQ-1478). It numbers them by the code of
// practice (the engine's REQ-314 part 1 and REQ-317 version 2; EN 300 706
// Annex A.1; TR 100 287 clause 10.1), as the engine's `limits::sub_code_of`
// and its inverse `limits::place_of` do:
// - one sub-page: 0000 (display rule 1);
// - 2 to 79: 0001 to 0079, the decimal values of S2 and S1, so 0009 is
//   followed by 0010 (display rule 2);
// - 80 to 8,069: only sub-codes above 0079 (display rule 3), the 3,120
//   decimal ones first in ascending order (0100 to 3979), then the 4,949
//   with a hexadecimal digit in ascending order, 3F7F left out.
// Sub-codes a program gives itself (`put`) are kept as given, 0000 beside
// others included (REQ-317 version 2, DEC-1526): this numbering is not
// applied to them.
//
// A page's sub-pages are in ascending sub-code order (DEC-1526), so place
// and sub-code order agree up to 3,120 + 79 places; on a page of more than
// 3,120 sub-pages above the set, the places past the 3,120th take sub-codes
// with a hexadecimal digit that sort below 0100, as the engine numbers them.

import type { Limits } from "../wire/limits.ts";

/** The thirteen bits of a sub-code, S4 S3 S2 S1 (EN 300 706 clause 9.3.1.2): 3F7F, itself "no particular sub-code" (clause 9.6.1). */
const SUBCODE_MASK = 0x3f7f;
/** S1 is the low four bits and S3 four bits from bit 8; S2 and S4 have no values above 9 (clause 9.3.1.2). */
const S1_MASK = 0xf;
const S3_SHIFT = 8;
const S3_MASK = 0xf;
/** A decimal sub-code has S1 and S3 at 9 or below, as a viewer keys it. */
const LAST_DECIMAL_DIGIT = 9;
/** A set numbered 0001 to 0079 (Annex A.1, display rule 2; the engine's `SET_SUBPAGES` and `SET_LAST_SUBCODE`). */
const SET_SUBPAGES = 79;
const SET_LAST_SUB = 0x0079;
/** The most the code of practice can number: the sub-codes above 0079, 3F7F left out (the engine's `SUBCODES_ABOVE_SET`). */
const MOST_NUMBERED = 8_069;
/** Of those, the decimal ones, 0100 to 3979 (the engine's `DECIMAL_SUBCODES_ABOVE_SET`). */
const DECIMAL_ABOVE_SET = 3_120;
/** The last decimal sub-code. */
const LAST_DECIMAL_SUB = 0x3979;

/** Whether `sub` is a sub-code: no bit outside the thirteen. */
function isSubCode(sub: number): boolean {
  return Number.isInteger(sub) && sub >= 0 && (sub & ~SUBCODE_MASK) === 0;
}

/** Whether every digit of `sub` is decimal. */
function isDecimal(sub: number): boolean {
  return (sub & S1_MASK) <= LAST_DECIMAL_DIGIT && ((sub >> S3_SHIFT) & S3_MASK) <= LAST_DECIMAL_DIGIT;
}

/** The set's sub-codes, 0001 to 0079, and those above it in the order the code of practice gives them. */
function subCodes(): { readonly inSet: readonly number[]; readonly aboveSet: readonly number[] } {
  const inSet: number[] = [];
  const decimal: number[] = [];
  const hexadecimal: number[] = [];
  for (let sub = 1; sub < SUBCODE_MASK; sub += 1) {
    if (!isSubCode(sub)) {
      continue;
    }
    if (sub <= SET_LAST_SUB) {
      if (isDecimal(sub)) {
        inSet.push(sub);
      }
    } else if (isDecimal(sub)) {
      decimal.push(sub);
    } else {
      hexadecimal.push(sub);
    }
  }
  return { inSet, aboveSet: [...decimal, ...hexadecimal] };
}

const { inSet: IN_SET, aboveSet: ABOVE_SET } = subCodes();
// The engine's figures, derived here by enumeration: they must agree.
if (IN_SET.length !== SET_SUBPAGES || ABOVE_SET.length !== MOST_NUMBERED || ABOVE_SET[DECIMAL_ABOVE_SET - 1] !== LAST_DECIMAL_SUB) {
  throw new Error("the sub-codes counted disagree with the engine's limits");
}
/** Each sub-code's place, from 1, in the set and above it. */
const PLACE_IN_SET = new Map(IN_SET.map((sub, index) => [sub, index + 1]));
const PLACE_ABOVE_SET = new Map(ABOVE_SET.map((sub, index) => [sub, index + 1]));

/** The most sub-pages a page given whole can have: those the code of practice numbers, and no more than `start` allows. */
function mostNumbered(limits: Limits): number {
  return Math.min(MOST_NUMBERED, limits.standard.subpages);
}

/** The sub-codes of a page of `count` sub-pages given whole, in their order (REQ-317). */
export function numbered(count: number, limits: Limits): number[] {
  const most = mostNumbered(limits);
  if (!Number.isInteger(count) || count < 1 || count > most) {
    throw new RangeError(`a page given whole is numbered 1 to ${most} sub-pages, not ${count}`);
  }
  if (count === 1) {
    return [0];
  }
  return (count <= SET_SUBPAGES ? IN_SET : ABOVE_SET).slice(0, count);
}

/** The place, 1 to `count`, that {@link numbered} gives `sub` on a page of `count` sub-pages, its inverse; null when it gives `sub` no place. */
export function placeOf(sub: number, count: number, limits: Limits): number | null {
  if (!isSubCode(sub) || !Number.isInteger(count) || count < 1 || count > mostNumbered(limits)) {
    return null;
  }
  if (count === 1) {
    return sub === 0 ? 1 : null;
  }
  const place = (count <= SET_SUBPAGES ? PLACE_IN_SET : PLACE_ABOVE_SET).get(sub);
  return place !== undefined && place <= count ? place : null;
}

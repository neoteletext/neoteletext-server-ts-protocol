// Sub-codes for a page given whole, its sub-pages in their order: the kit
// numbers them by place, since a sub-page always travels with its own
// sub-code (REQ-1478) and a page's sub-pages are in ascending sub-code
// order (DEC-1526), so place and sub-code order must agree.
// - one sub-page: 0000 (EN 300 706 Annex A.1, display rule 1);
// - up to `start`'s `decimal_subpages`: 0001 upward through the sub-codes a
//   viewer can key, every digit decimal (S1 and S3 0 to 9, S2 0 to 7, S4 0
//   to 3), so 0009 is followed by 0010;
// - more: 0001 upward through every sub-code, 3F7F left out, to
//   `standard.subpages`.

import type { Limits } from "../wire/limits.ts";

/** The thirteen bits of a sub-code (EN 300 706 clause 9.3.1.2), and 3F7F, which is any sub-page. */
const SUBCODE_MASK = 0x3f7f;
/** S1 and S3, the decimal digits a viewer keys, are 0 to 9 (S2 and S4 have no values above). */
const LAST_DIGIT = 9;
const S1_MASK = 0xf;
const S3_SHIFT = 8;
const S3_MASK = 0xf;

/** Whether `sub` is a sub-code: no bit outside the thirteen. */
function isSubCode(sub: number): boolean {
  return (sub & ~SUBCODE_MASK) === 0;
}

/** Whether every digit of `sub` is decimal. */
function isDecimal(sub: number): boolean {
  return (sub & S1_MASK) <= LAST_DIGIT && ((sub >> S3_SHIFT) & S3_MASK) <= LAST_DIGIT;
}

/** The sub-codes of a page of `count` sub-pages given whole, in their order. */
export function numbered(count: number, limits: Limits): number[] {
  if (!Number.isInteger(count) || count < 1 || count > limits.standard.subpages) {
    throw new RangeError(`a page holds 1 to ${limits.standard.subpages} sub-pages, not ${count}`);
  }
  if (count === 1) {
    return [0];
  }
  const decimal = count <= limits.standard.decimalSubpages;
  const subs: number[] = [];
  for (let sub = 1; sub < SUBCODE_MASK && subs.length < count; sub += 1) {
    if (isSubCode(sub) && (!decimal || isDecimal(sub))) {
      subs.push(sub);
    }
  }
  return subs;
}

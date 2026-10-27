// A decimal digit of any script, for page numbers typed on any keyboard.

/** Code points around a decimal digit walked in search of its run's zero: the longest run of `Nd` characters, Unicode's five mathematical digit runs at U+1D7CE, is 50. */
const LONGEST_DIGIT_RANGE = 50;

/** Digits in a run (Unicode section 4.6, "Numeric Value"). */
const RADIX = 10;

const DECIMAL_DIGIT = /^\p{Nd}$/u;

/**
 * The value of a decimal digit of any script, Unicode's general category
 * Nd (INPUT.md section 5.7 rule 8), or undefined for any other
 * character. Every Nd character is one of a run of ten, zero to nine in
 * order, and runs that touch begin at a zero, so a digit's value is its
 * distance from the start of its range, modulo ten.
 */
export function decimalDigit(character: string): number | undefined {
  if (!DECIMAL_DIGIT.test(character)) {
    return undefined;
  }
  const point = character.codePointAt(0) ?? 0;
  let start = point;
  while (point - start < LONGEST_DIGIT_RANGE && DECIMAL_DIGIT.test(String.fromCodePoint(start - 1))) {
    start -= 1;
  }
  return (point - start) % RADIX;
}

// A sub-page's number as TTI's SC line and a receiver write it.

/** Decimal digits are written one to a hexadecimal digit in a sub-code. */
const DECIMAL = 10;

/** The bits of one hexadecimal digit. */
const NIBBLE_BITS = 4;

/**
 * A sub-page's number as a sub-code: its decimal digits, one to a
 * hexadecimal digit, as page numbers are written (sub-page 10 is 0010,
 * as TTI's SC line and receivers show it).
 */
export function decimalSubcode(subpage: number): number {
  const tens = Math.floor(subpage / DECIMAL) % DECIMAL;
  const units = subpage % DECIMAL;
  return (tens << NIBBLE_BITS) | units;
}

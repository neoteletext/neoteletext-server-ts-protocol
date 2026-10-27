// A page's rows as text, for tests to look for what a viewer would see.

import { ROWS } from "../page/geometry.ts";
import type { Rows } from "../tti/read-tti.ts";

export function text(rows: Rows, row: number): string {
  return String.fromCodePoint(...(rows[row] ?? []));
}

/** The first row holding `wanted`, or undefined. */
export function rowOf(rows: Rows, wanted: string): number | undefined {
  for (let row = 0; row < ROWS; row += 1) {
    if (text(rows, row).includes(wanted)) {
      return row;
    }
  }
  return undefined;
}

export function shows(rows: Rows, wanted: string): boolean {
  return rowOf(rows, wanted) !== undefined;
}

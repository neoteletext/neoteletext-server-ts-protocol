// A page's shape (EN 300 706 clause 9.3).

import { SPACE_CODE } from "../text/english.ts";

/** Rows of a page: the header row 0 and rows 1 to 24 (EN 300 706 clause 9.3). */
export const ROWS = 25;

/** Columns of a row (EN 300 706 clause 9.3). */
export const COLUMNS = 40;

/** The seven bits of a code (EN 300 706 clause 8.2: the eighth is odd parity, the encoder's). */
export const CODE_MASK = 0x7f;

/** The first display column of the header, after the receiver's own page number (EN 300 706 clause 9.3.1). */
export const HEADER_TEXT_COLUMN = 8;

export const SPACE = SPACE_CODE;

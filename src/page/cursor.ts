// The input cursor a page may place (DOC-1954).

/**
 * The cursor record's flags (DOC-1954; the engine's
 * `neoteletext_input::cursor`). Echo (1) and masked echo (2) are withdrawn
 * (the engine's E.134): the receiver draws nothing of what is typed, so a
 * page draws it.
 */
export const CursorFlag = {
  /** The cursor is a block, not a bar. */
  Block: 4,
} as const;

/** The rows a cursor may be on (DOC-1954): the server refuses a page with one on the header or the Fastext row. */
export const FIRST_CURSOR_ROW = 1;
export const LAST_CURSOR_ROW = 23;

/** The input cursor (DOC-1954): its cell and its flags. */
export interface Cursor {
  readonly row: number;
  readonly column: number;
  readonly flags: number;
}

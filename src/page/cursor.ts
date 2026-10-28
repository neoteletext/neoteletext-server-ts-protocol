// The input cursor a page may place (INPUT.md section 7.1).

/**
 * The cursor record's flags (INPUT.md section 7.1; the engine's
 * `neoteletext_input::cursor`). Echo (1) and masked echo (2) are withdrawn
 * (the engine's E.134): the receiver draws nothing of what is typed, so a
 * page draws it.
 */
export const CursorFlag = {
  /** The cursor is a block, not a bar. */
  Block: 4,
} as const;

/** The input cursor (INPUT.md section 7.1): its cell and its flags. */
export interface Cursor {
  readonly row: number;
  readonly column: number;
  readonly flags: number;
}

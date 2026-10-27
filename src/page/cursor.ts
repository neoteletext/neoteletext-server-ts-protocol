// The input cursor a page may place (INPUT.md section 7.1).

/** The cursor record's flags (INPUT.md section 7.1; the engine's `neoteletext_input::cursor`). */
export const CursorFlag = {
  /** The receiver echoes what is typed at the cursor. */
  Echo: 1,
  /** It echoes `*` for each character. */
  Masked: 2,
  /** The cursor is a block, not a bar. */
  Block: 4,
} as const;

/** The input cursor and its echo (INPUT.md section 7.1): its cell, the cells it may echo into, and its flags. */
export interface Cursor {
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly flags: number;
}

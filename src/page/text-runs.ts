// The runs of Unicode text a screen holds (REQ-2214 item 4), cell by cell:
// what is written over a run's cells cuts it there, so a later drawing
// covers an earlier one as codes do. A run written right to left is put in
// visual order by the server, so which of its characters a cell shows is
// the server's to say: covering any of its cells removes the whole run.
// The runs go to the server at their fewest: those of one row and language
// that only spaces part are joined, at most 40 characters a run, since the
// protocol carries at most 64 runs a page.

import { COLUMNS, ROWS } from "./geometry.ts";
import { hasRightToLeft } from "../text/cells.ts";

// What a screen measures its text by, with its runs.
export { cellsOf, textCells } from "../text/cells.ts";
import type { LanguageTag } from "../wire/languages.ts";
import type { WireTextRun } from "../wire/protocol.ts";

/** The rows a run may be on (the schema's $defs/TextRun): row 0 is the header, the program's codes. */
const FIRST_TEXT_ROW = 1;
/** The most characters a run carries (the schema's $defs/TextRun, text's maxLength). */
export const RUN_CHARACTERS = 40;
/** The most runs a page carries (the schema's $defs/Page, text's maxItems). */
export const MOST_RUNS = 64;

/** A space, which every set shows at the same code (EN 300 706 Table 35). */
const SPACE_CELL = " ";

/** One cell of a run: the character it shows, with its marks. */
interface RunCell {
  readonly text: string;
  readonly language: LanguageTag | null;
  /** Which text call wrote it. */
  readonly run: number;
  readonly rightToLeft: boolean;
}

/** A row's stretch of one run, or of several joined. */
interface Piece {
  readonly row: number;
  column: number;
  cells: string[];
  readonly language: LanguageTag | null;
  readonly rightToLeft: boolean;
}

/** Whether `run` is English that the codes under it show as the encoder would write it: printable ASCII but where EN 300 706 Table 36's national options differ (0x23, 0x24, 0x40, 0x5B to 0x60, 0x7B to 0x7E). */
function isPlainEnglish(run: WireTextRun): boolean {
  return (
    (run.language === undefined || run.language === null || run.language === "en") &&
    /^[\u0020-\u007E]*$/u.test(run.text) &&
    !/[#$@[\\\]^_`{|}~]/u.test(run.text)
  );
}

function characters(cells: readonly string[]): number {
  return cells.reduce((count, cell) => count + Array.from(cell).length, 0);
}

/** `piece` in runs of at most RUN_CHARACTERS characters, cut between cells; a right-to-left piece's first characters take its rightmost cells. */
function cut(piece: Piece): WireTextRun[] {
  const parts: string[][] = [];
  let part: string[] = [];
  for (const cell of piece.cells) {
    if (part.length > 0 && characters([...part, cell]) > RUN_CHARACTERS) {
      parts.push(part);
      part = [];
    }
    part.push(cell);
  }
  if (part.length > 0) {
    parts.push(part);
  }
  let column = piece.rightToLeft ? piece.column + piece.cells.length : piece.column;
  return parts.map((cells) => {
    if (piece.rightToLeft) {
      column -= cells.length;
    }
    const text = cells.join("");
    const run: WireTextRun = piece.language === null ? { row: piece.row, column, text } : { row: piece.row, column, text, language: piece.language };
    if (!piece.rightToLeft) {
      column += cells.length;
    }
    return run;
  });
}

export class TextRuns {
  readonly #cells: (RunCell | null)[][];
  #next = 0;

  /** No text, or a copy of `from`'s. */
  constructor(from?: TextRuns) {
    const cells = from === undefined ? [] : from.#cells;
    this.#cells = Array.from({ length: ROWS }, (_row, row) => Array.from({ length: COLUMNS }, (_column, column) => cells[row]?.[column] ?? null));
    this.#next = from === undefined ? 0 : from.#next;
  }

  /** Whether the screen holds any text. */
  get empty(): boolean {
    return this.#cells.every((line) => line.every((cell) => cell === null));
  }

  /**
   * Removes what runs have in `count` cells from `column` of `row`; answers
   * the other cells a right-to-left run covered there left, which show a
   * space now.
   */
  clear(row: number, column: number, count: number): number[] {
    const line = this.#cells[row];
    if (line === undefined) {
      return [];
    }
    const emptied: number[] = [];
    for (let at = Math.max(0, column); at < Math.min(COLUMNS, column + count); at += 1) {
      const cell = line[at];
      if (cell === null || cell === undefined) {
        continue;
      }
      if (cell.rightToLeft) {
        line.forEach((other, place) => {
          if (other?.run === cell.run) {
            line[place] = null;
            if (place < column || place >= column + count) {
              emptied.push(place);
            }
          }
        });
      }
      line[at] = null;
    }
    return emptied;
  }

  /** Puts `cells` from `column` of `row`, those within the row; what was there is cleared first. Answers the cells emptied as {@link clear} does. */
  put(row: number, column: number, cells: readonly string[], language: LanguageTag | null): number[] {
    const line = this.#cells[row];
    if (line === undefined || row < FIRST_TEXT_ROW) {
      return [];
    }
    const emptied = this.clear(row, column, cells.length);
    const run = this.#next;
    this.#next += 1;
    const rightToLeft = hasRightToLeft(cells.join(""));
    cells.forEach((text, offset) => {
      const at = column + offset;
      // A space is the same code in every set: it needs no run, and runs either side of it join over it; but right to left, a run is ordered whole, its spaces with it.
      if (at >= 0 && at < COLUMNS && (rightToLeft || text !== SPACE_CELL)) {
        line[at] = { text, language, run, rightToLeft };
      }
    });
    return emptied;
  }

  /**
   * The runs as the protocol carries them, at their fewest: `isSpace` says
   * which cells between two runs hold a space. On a page in English
   * (`english`), past MOST_RUNS a run of English in the characters every
   * Latin set shows alike at their ASCII codes is left to those codes,
   * which the rows already hold under it and which are what the server's
   * encoder writes for it: the page shows the same, within the protocol's
   * bound.
   */
  runs(isSpace: (row: number, column: number) => boolean, english = false): WireTextRun[] {
    const pieces: Piece[] = [];
    this.#cells.forEach((line, row) => {
      let last: Piece | null = null;
      let lastRun = -1;
      line.forEach((cell, column) => {
        if (cell === null) {
          lastRun = -1;
          return;
        }
        if (last !== null && cell.run === lastRun) {
          last.cells.push(cell.text);
          return;
        }
        last = { row, column, cells: [cell.text], language: cell.language, rightToLeft: cell.rightToLeft };
        lastRun = cell.run;
        pieces.push(last);
      });
    });
    const joined: Piece[] = [];
    for (const piece of pieces) {
      const before = joined.at(-1);
      const gap = before === undefined ? 0 : piece.column - before.column - before.cells.length;
      const spaces = Array.from({ length: gap }, () => " ");
      const joins =
        before !== undefined &&
        before.row === piece.row &&
        !before.rightToLeft &&
        !piece.rightToLeft &&
        before.language === piece.language &&
        spaces.every((_, offset) => isSpace(piece.row, piece.column - gap + offset)) &&
        characters([...before.cells, ...spaces, ...piece.cells]) <= RUN_CHARACTERS;
      if (joins) {
        before.cells = [...before.cells, ...spaces, ...piece.cells];
      } else {
        joined.push(piece);
      }
    }
    const all = joined.flatMap((piece) => cut(piece));
    const runs = all.length > MOST_RUNS && english ? all.filter((run) => !isPlainEnglish(run)) : all;
    if (runs.length > MOST_RUNS) {
      throw new RangeError(`a page carries at most ${MOST_RUNS} runs of text, and this one has ${runs.length}: join its text into fewer, longer lines`);
    }
    return runs;
  }
}

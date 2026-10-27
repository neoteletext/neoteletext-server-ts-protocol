// Mosaic graphics drawn on a canvas of sixels, two across and three down
// to a cell (EN 300 706 clause 15.7.1, Table 47).

import { Colour, mosaicColour } from "./colours.ts";
import { COLUMNS, ROWS } from "./geometry.ts";
import type { Screen } from "./screen.ts";

/** A mosaic cell's sixels across (EN 300 706 clause 15.7.1). */
export const SIXELS_ACROSS = 2;

/** A mosaic cell's sixels down. */
export const SIXELS_DOWN = 3;

/** The base of a mosaic character: bit 5 always set (EN 300 706 Table 47). */
const MOSAIC_BASE = 0x20;

/** The bit of the bottom-right sixel, which sits above bit 5 in the code (Table 47). */
const BOTTOM_RIGHT_SIXEL = 0x40;

/** The bits of a mosaic cell's other five sixels, top-left first, across then down (Table 47). */
const SIXEL_BITS = [0x01, 0x02, 0x04, 0x08, 0x10, BOTTOM_RIGHT_SIXEL] as const;

/** The most sixels a canvas has across and down: a whole page's, since a bigger canvas has nothing more to draw. */
const MOST_ACROSS = COLUMNS * SIXELS_ACROSS;
const MOST_DOWN = ROWS * SIXELS_DOWN;

/** `size` as a whole number of sixels from 0 to `most`. */
function sixelCount(size: number, most: number): number {
  return Number.isFinite(size) ? Math.min(most, Math.max(0, Math.trunc(size))) : 0;
}

/** A canvas of sixels, drawn as mosaic graphics into a block of cells. */
export class Sixels {
  readonly width: number;
  readonly height: number;
  readonly #bits: boolean[];

  /** A clear canvas `width` by `height` sixels, each at most a page's. */
  constructor(width: number, height: number) {
    this.width = sixelCount(width, MOST_ACROSS);
    this.height = sixelCount(height, MOST_DOWN);
    this.#bits = Array.from({ length: this.width * this.height }, () => false);
  }

  /** Sets the sixel at `x`, `y`; outside the canvas, nothing. */
  set(x: number, y: number, on: boolean): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.#bits[y * this.width + x] = on;
    }
  }

  /** Whether the sixel at `x`, `y` is set; outside the canvas, not. */
  get(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height && this.#bits[y * this.width + x] === true;
  }

  clear(): void {
    this.#bits.fill(false);
  }

  /** The mosaic character for the cell whose top-left sixel is `x`, `y` (EN 300 706 Table 47). */
  cell(x: number, y: number): number {
    let code = MOSAIC_BASE;
    SIXEL_BITS.forEach((bit, index) => {
      if (this.get(x + (index % SIXELS_ACROSS), y + Math.floor(index / SIXELS_ACROSS))) {
        code |= bit;
      }
    });
    return code;
  }

  /**
   * Draws the canvas as mosaic cells on `screen` from `row`, `column`:
   * each row of cells begins with the mosaic colour attribute, in the cell
   * before `column`.
   */
  draw(screen: Screen, row: number, column: number, colour: Colour): void {
    const cellsAcross = Math.ceil(this.width / SIXELS_ACROSS);
    const cellsDown = Math.ceil(this.height / SIXELS_DOWN);
    for (let cellRow = 0; cellRow < cellsDown; cellRow += 1) {
      if (column > 0) {
        screen.code(row + cellRow, column - 1, mosaicColour(colour));
      }
      for (let cellColumn = 0; cellColumn < cellsAcross; cellColumn += 1) {
        screen.code(row + cellRow, column + cellColumn, this.cell(cellColumn * SIXELS_ACROSS, cellRow * SIXELS_DOWN));
      }
    }
  }
}

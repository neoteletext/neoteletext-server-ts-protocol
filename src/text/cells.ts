// Text as a run of the protocol takes the cells of a row (REQ-2214 item 4):
// one cell for each character it shows, once combining marks join their
// letters. The server's encoder is the authority on what a run takes
// (`measure` reports it); this is the kit's count of it, for laying text out
// before it is sent: exact for every script but where the server joins two
// letters into one cell (an Arabic lam-alef), which it counts one high.

/** A combining mark (Unicode general category M): it joins the letter before it. */
const MARK = /^\p{M}$/u;

/** Controls and format characters (Unicode categories Cc and Cf): the server refuses them in text (REQ-1475), so they are shown as spaces. */
const UNSHOWABLE = /[\p{Cc}\p{Cf}]/gu;

/**
 * Scripts written right to left (Unicode Standard Annex 9's strong R and
 * AL characters, by the scripts that hold them): the server puts such text
 * in visual order across its cells.
 */
const RIGHT_TO_LEFT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/** `text` as a run can carry it: controls and format characters as spaces, in Unicode normalisation form C. */
export function runText(text: string): string {
  return text.normalize("NFC").replaceAll(UNSHOWABLE, " ").normalize("NFC");
}

/** `text`'s cells, in its order: each a character with the combining marks after it; a mark with no letter before it takes a cell of its own. */
export function textCells(text: string): string[] {
  const cells: string[] = [];
  for (const character of runText(text)) {
    const last = cells.length - 1;
    if (MARK.test(character) && last >= 0) {
      cells[last] = `${cells[last] ?? ""}${character}`;
    } else {
      cells.push(character);
    }
  }
  return cells;
}

/** The cells `text` takes on a row. */
export function cellsOf(text: string): number {
  return textCells(text).length;
}

/** Whether `text` holds a letter of a script written right to left. */
export function hasRightToLeft(text: string): boolean {
  return RIGHT_TO_LEFT.test(text);
}

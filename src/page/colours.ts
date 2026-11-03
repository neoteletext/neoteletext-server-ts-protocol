// Level 1's colours and spacing attributes (EN 300 706 Table 26).

/** The eight colours of Level 1 (EN 300 706 Table 26, spacing attributes). */
export const Colour = {
  Black: 0,
  Red: 1,
  Green: 2,
  Yellow: 3,
  Blue: 4,
  Magenta: 5,
  Cyan: 6,
  White: 7,
} as const;
/** A colour, 0 to 7. */
export type Colour = (typeof Colour)[keyof typeof Colour];

/** The bit that makes a colour's alphanumeric attribute its mosaic one (Table 26: 0x00-0x07 and 0x10-0x17). */
const MOSAIC_COLOUR_BIT = 0x10;

/** The spacing attribute for alphanumeric text in `colour`: 0x00 to 0x07 (Table 26). */
export function textColour(colour: Colour): number {
  return colour;
}

/** The spacing attribute for mosaic graphics in `colour`: 0x10 to 0x17 (Table 26). */
export function mosaicColour(colour: Colour): number {
  return MOSAIC_COLOUR_BIT | colour;
}

/** Spacing attributes of EN 300 706 Table 26. */
export const Attribute = {
  Flash: 0x08,
  Steady: 0x09,
  NormalHeight: 0x0c,
  DoubleHeight: 0x0d,
  Conceal: 0x18,
  Contiguous: 0x19,
  Separated: 0x1a,
  BlackBackground: 0x1c,
  NewBackground: 0x1d,
  HoldMosaics: 0x1e,
  ReleaseMosaics: 0x1f,
} as const;

/** The highest alphanumeric colour attribute, alpha white (Table 26: 0x00 to 0x07). */
const LAST_TEXT_COLOUR = 0x07;

/**
 * Whether the code at `column` of `row` is an alphanumeric colour that
 * changes nothing: the row is in alphanumerics there, not concealed, in that
 * colour already (each row starts in white alphanumerics, Table 26 and
 * clause 12.2). Such a cell shows a space, as a space would.
 */
export function isRedundantColour(row: readonly number[], column: number): boolean {
  let colour: number = Colour.White;
  let text = true;
  let concealed = false;
  for (let at = 0; at < column; at += 1) {
    const code = row[at] ?? 0;
    if (code <= LAST_TEXT_COLOUR || (code >= MOSAIC_COLOUR_BIT && code <= (MOSAIC_COLOUR_BIT | LAST_TEXT_COLOUR))) {
      // A colour, alphanumeric or mosaic, ends concealment (Table 26, Conceal).
      colour = code & LAST_TEXT_COLOUR;
      text = code <= LAST_TEXT_COLOUR;
      concealed = false;
    } else if (code === Attribute.Conceal) {
      concealed = true;
    }
  }
  const code = row[column];
  return code !== undefined && code <= LAST_TEXT_COLOUR && text && !concealed && code === colour;
}

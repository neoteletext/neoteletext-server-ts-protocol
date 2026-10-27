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

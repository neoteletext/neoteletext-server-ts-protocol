// Cyrillic letters romanised (BGN/PCGN), since the English set has none.

/** The Russian alphabet from U+0430, in the BGN/PCGN romanisation. */
const CYRILLIC = [
  "a",
  "b",
  "v",
  "g",
  "d",
  "e",
  "zh",
  "z",
  "i",
  "y",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "r",
  "s",
  "t",
  "u",
  "f",
  "kh",
  "ts",
  "ch",
  "sh",
  "shch",
  "",
  "y",
  "",
  "e",
  "yu",
  "ya",
] as const;

/** The Cyrillic letters of other languages, from U+0450. */
const CYRILLIC_EXTRA = ["e", "yo", "dj", "g", "ye", "dz", "i", "yi", "j", "lj", "nj", "c", "k", "i", "u", "dz"] as const;

/** Where each table's small letters start, and its capitals (Unicode's Cyrillic block). */
const CYRILLIC_LOWER = 0x0430;

const CYRILLIC_UPPER = 0x0410;

const CYRILLIC_EXTRA_LOWER = 0x0450;

const CYRILLIC_EXTRA_UPPER = 0x0400;

/** A Cyrillic letter romanised, capitalised as the letter was; undefined for any other character. */
export function romanised(point: number): string | undefined {
  const tables: [readonly string[], number, boolean][] = [
    [CYRILLIC, CYRILLIC_LOWER, false],
    [CYRILLIC, CYRILLIC_UPPER, true],
    [CYRILLIC_EXTRA, CYRILLIC_EXTRA_LOWER, false],
    [CYRILLIC_EXTRA, CYRILLIC_EXTRA_UPPER, true],
  ];
  for (const [table, first, capital] of tables) {
    const letter = point >= first ? table[point - first] : undefined;
    if (letter !== undefined) {
      return capital ? letter.charAt(0).toUpperCase() + letter.slice(1) : letter;
    }
  }
  return undefined;
}

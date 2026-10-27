// The signs the English set has at codes where ASCII has punctuation, and
// what other characters are folded to. The English set shows other signs
// at ten codes where ASCII has punctuation (0x23, 0x5B to 0x60, 0x7B to
// 0x7E), so ASCII's `[`, `\`, `]`, `^`, `_`, `` ` ``, `{`, `|`, `}` and `~`
// are folded to the nearest sign it does have: a receiver would show an
// arrow, a fraction or `#` at their ASCII codes.

/** The codes of EN 300 706 Table 36's English column that differ from ASCII. */
export const ENGLISH = {
  pound: 0x23,
  leftArrow: 0x5b,
  half: 0x5c,
  rightArrow: 0x5d,
  upArrow: 0x5e,
  hash: 0x5f,
  dash: 0x60,
  quarter: 0x7b,
  doubleBar: 0x7c,
  threeQuarters: 0x7d,
  divide: 0x7e,
} as const;

/** The signs Table 36's English column has, by the character they show. */
export const SIGNS: ReadonlyMap<string, number> = new Map([
  ["£", ENGLISH.pound],
  ["#", ENGLISH.hash],
  ["←", ENGLISH.leftArrow],
  ["½", ENGLISH.half],
  ["→", ENGLISH.rightArrow],
  ["↑", ENGLISH.upArrow],
  ["—", ENGLISH.dash],
  ["―", ENGLISH.dash],
  ["¼", ENGLISH.quarter],
  ["‖", ENGLISH.doubleBar],
  ["¾", ENGLISH.threeQuarters],
  ["÷", ENGLISH.divide],
]);

/** Each of `accented` folded to `base`. */
function letters(base: string, accented: string): [string, string][] {
  return Array.from(accented, (letter): [string, string] => [letter, base]);
}

/**
 * Characters folded to what the set has: the ASCII signs whose codes the
 * English set uses for others, quotes and dashes, and the Latin letters
 * with diacritics, without them.
 */
export const FOLDS: ReadonlyMap<string, string> = new Map([
  ["[", "("],
  ["{", "("],
  ["]", ")"],
  ["}", ")"],
  ["\\", "/"],
  ["|", "/"],
  ["^", " "],
  ["_", " "],
  ["`", "'"],
  ["~", "-"],
  ["·", "-"],
  ["‐", "-"],
  ["‑", "-"],
  ["‒", "-"],
  ["–", "-"],
  ["−", "-"],
  ["‘", "'"],
  ["’", "'"],
  ["‚", "'"],
  ["′", "'"],
  ["“", '"'],
  ["”", '"'],
  ["„", '"'],
  ["″", '"'],
  ["…", "..."],
  ["×", "x"],
  ["°", " deg"],
  ["©", "(c)"],
  ["Æ", "AE"],
  ["æ", "ae"],
  ["Œ", "OE"],
  ["œ", "oe"],
  ["ß", "ss"],
  ["Þ", "Th"],
  ["þ", "th"],
  ...letters("A", "ÀÁÂÃÄÅĀĂĄ"),
  ...letters("a", "àáâãäåāăąả"),
  ...letters("C", "ÇĆĈĊČ"),
  ...letters("c", "çćĉċč"),
  ...letters("D", "ĎĐÐ"),
  ...letters("d", "ďđð"),
  ...letters("E", "ÈÉÊËĒĖĘĚ"),
  ...letters("e", "èéêëēėęě"),
  ...letters("G", "ĞĢ"),
  ...letters("g", "ğģ"),
  ...letters("I", "ÌÍÎÏĪİ"),
  ...letters("i", "ìíîïīı"),
  ...letters("L", "ŁĽĹ"),
  ...letters("l", "łľĺ"),
  ...letters("N", "ÑŃŇ"),
  ...letters("n", "ñńň"),
  ...letters("O", "ÒÓÔÕÖØŌŐ"),
  ...letters("o", "òóôõöøōő"),
  ...letters("R", "Ř"),
  ...letters("r", "ř"),
  ...letters("S", "ŚŠŞ"),
  ...letters("s", "śšş"),
  ...letters("T", "ŤŢ"),
  ...letters("t", "ťţ"),
  ...letters("U", "ÙÚÛÜŪŮŰ"),
  ...letters("u", "ùúûüūůűứ"),
  ...letters("Y", "ÝŸ"),
  ...letters("y", "ýÿ"),
  ...letters("Z", "ŹŻŽ"),
  ...letters("z", "źżž"),
]);

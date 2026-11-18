// ReGIS text and a sprite sheet's text as their bytes (animation.md ANIM-19):
// each character the one byte of its code point, 0 to 255 (Latin-1), never
// UTF-8. A character above 255 has no byte, so the call refuses it rather
// than send another character in its place, as the Python kit does
// (DEC-6650).

/** The greatest code point that is one byte. */
const LAST_BYTE = 0xff;
/** The digits a code point is named with, as U+00E9 is. */
const CODE_POINT_DIGITS = 4;
/** The radix of a code point's name. */
const HEX = 16;

/** Text given to `regis` or `spriteSheet` holds a character above 255, which has no byte: nothing is sent. */
export class TextNotWritableError extends Error {
  /** The character's place in the text, counted in characters (code points) from 0. */
  readonly index: number;
  /** The character. */
  readonly character: string;

  constructor(call: string, index: number, character: string) {
    const codePoint = (character.codePointAt(0) ?? 0).toString(HEX).toUpperCase().padStart(CODE_POINT_DIGITS, "0");
    super(
      `${call}: the character ${JSON.stringify(character)} (U+${codePoint}) at index ${index} has no byte; ReGIS and sprite sheet text is written a byte a character, code points 0 to 255 (animation.md ANIM-19), so give it as bytes or leave it out`,
    );
    this.name = "TextNotWritableError";
    this.index = index;
    this.character = character;
  }
}

/** Text as its bytes a character, or bytes as given; throws a {@link TextNotWritableError} for a character above 255. */
export function textBytes(call: string, data: string | Uint8Array): Uint8Array {
  if (typeof data !== "string") {
    return data;
  }
  const bytes: number[] = [];
  let index = 0;
  for (const character of data) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint > LAST_BYTE) {
      throw new TextNotWritableError(call, index, character);
    }
    bytes.push(codePoint);
    index += 1;
  }
  return new Uint8Array(bytes);
}

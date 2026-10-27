// Which keys a page takes itself, and what navigation made of an input.

/** Which keys a page uses itself, so navigation leaves them to it. */
export interface PageKeys {
  /** The page takes digits: typed text, a quiz's answers, a poll's votes. */
  readonly ownsDigits?: boolean;
  /** The page takes the coloured keys and F1 to F4. */
  readonly ownsColourKeys?: boolean;
}

/** What navigation made of an input: not its, or taken, with the page to go to if it chose one. */
export type Navigated = { readonly taken: false } | { readonly taken: true; readonly goto: number | null };

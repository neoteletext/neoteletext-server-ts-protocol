// A list of the fixed length the schema states, as the generated types write
// it: a tuple (typescript.md TS-9), such as a page's six links of X/27/0 or a
// packet's thirteen triplets.

/** `items` as the tuple `T`, checked to be `length` long: a list made by a loop is no tuple to the compiler. */
export function fixed<T extends readonly unknown[]>(items: readonly T[number][], length: T["length"]): T {
  if (items.length !== length) {
    throw new RangeError(`a list of ${String(length)}, not ${items.length}`);
  }
  // Checked just above: the one place a list becomes the tuple the schema states.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- its length is checked just above
  return items as unknown as T;
}

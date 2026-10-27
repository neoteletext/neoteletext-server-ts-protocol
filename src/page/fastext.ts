// Fastext's four coloured links (EN 300 706 clause 9.6).

/** Fastext's four coloured links, red, green, yellow and cyan (EN 300 706 clause 9.6), each a page or null. */
export type FastextLinks = readonly [number | null, number | null, number | null, number | null];

export const NO_LINKS: FastextLinks = [null, null, null, null];

// TTI's packed lines, OL,26 to OL,29 (the engine's tti/packed.rs,
// REQ-INP-023): the designation code and 39 characters, read as packets
// X/26, X/27 (the links of designation code 0, nibbles of 1 to 3,
// triplets above), X/28 and M/29, each at most once a designation code.

import type { Being } from "./being.ts";
import { olCodes } from "./format.ts";
import { ANY_SUBCODE, PACKED_LINKS_ROW, readPackedLinks } from "./packed-links.ts";
import { SUBCODE_DIGITS, hex } from "./write-row.ts";
import { pageText } from "../page/page-numbers.ts";
import type { WirePackedLine, WireTriplet } from "../wire/protocol.ts";

/** The packets of a packed line: X/26 enhancements, X/27 links, X/28 page and M/29 magazine enhancements (REQ-INP-023). */
export const PACKET_ENHANCEMENT = 26;
const PACKET_PAGE_ENHANCEMENT = 28;
export const PACKET_MAGAZINE_ENHANCEMENT = 29;
/** A packed line's characters: the designation code, then 39 (the engine's PACKED_LINE). */
const PACKED_VALUES = 39;
/** The triplets of a packet (EN 300 706 clause 12.3.1). */
const TRIPLETS = 13;
/** X/27's designation codes 1 to 3 carry Hamming 8/4 nibbles (the engine's tti/packed.rs). */
const LAST_NIBBLE_DESIGNATION = 3;
const NIBBLE_MASK = 0x0f;
/** Each of a triplet's three characters carries six of its eighteen bits, low first (the engine's TTI_TRIPLET_CHARACTER_BITS). */
const TRIPLET_CHARACTER_BITS = 6;
const TRIPLET_CHARACTER_MASK = 0x3f;
/** A triplet's fields (clause 12.3.1): address 6 bits, mode 5, data 7. */
const ADDRESS_BITS = 6;
const ADDRESS_MASK = 0x3f;
const MODE_BITS = 5;
const MODE_MASK = 0x1f;
const DATA_MASK = 0x7f;
/** The highest designation code: four bits. */
const LAST_DESIGNATION = 15;
/** The most packets X/26 and the most other packed lines a sub-page holds (the schema's bounds). */
const MOST_PACKETS = 16;

/** Thirteen triplets from 39 characters, six bits each, low first (the engine's unpack_triplets). */
function triplets(values: readonly number[]): WireTriplet[] {
  return Array.from({ length: TRIPLETS }, (_, index) => {
    const [first = 0, second = 0, third = 0] = values.slice(index * 3, index * 3 + 3);
    const value =
      (first & TRIPLET_CHARACTER_MASK) |
      ((second & TRIPLET_CHARACTER_MASK) << TRIPLET_CHARACTER_BITS) |
      ((third & TRIPLET_CHARACTER_MASK) << (2 * TRIPLET_CHARACTER_BITS));
    return { address: value & ADDRESS_MASK, mode: (value >> ADDRESS_BITS) & MODE_MASK, data: (value >> (ADDRESS_BITS + MODE_BITS)) & DATA_MASK };
  });
}

/** Puts `line` in `list` in place of one of the same packet and designation code, or after them, within the bound. */
function place<T extends { readonly designation: number }>(list: T[], line: T, same: (one: T, two: T) => boolean): void {
  const at = list.findIndex((each) => same(each, line));
  if (at >= 0) {
    list[at] = line;
  } else if (list.length < MOST_PACKETS) {
    list.push(line);
  }
}

/** A packed line, OL,26 to OL,29 (REQ-INP-023): the designation code and 39 characters. */
export function readPacked(page: Being, number: number, text: string): void {
  if (number === PACKED_LINKS_ROW) {
    const links = readPackedLinks(page.address, text);
    if (links !== undefined) {
      page.links = links.links.map((link) => (link === null ? null : { page: pageText(link.page), sub: hex(link.subcode ?? ANY_SUBCODE, SUBCODE_DIGITS) }));
      page.displayRow24 = links.displayRow24;
      return;
    }
  }
  const codes = olCodes(text);
  const designation = (codes[0] ?? 0) & NIBBLE_MASK;
  const values = Array.from({ length: PACKED_VALUES }, (_, index) => codes[1 + index] ?? 0);
  if (designation > LAST_DESIGNATION) {
    return;
  }
  if (number === PACKET_ENHANCEMENT) {
    place(page.enhancements, { designation, triplets: triplets(values) }, (one, two) => one.designation === two.designation);
    return;
  }
  let line: WirePackedLine;
  if (number === PACKED_LINKS_ROW) {
    line =
      designation <= LAST_NIBBLE_DESIGNATION
        ? { packet: "x27_nibbles", designation, nibbles: values.map((value) => value & NIBBLE_MASK) }
        : { packet: "x27", designation, triplets: triplets(values) };
  } else if (number === PACKET_PAGE_ENHANCEMENT) {
    line = { packet: "x28", designation, triplets: triplets(values) };
  } else {
    line = { packet: "m29", designation, triplets: triplets(values) };
  }
  place(page.packets, line, (one, two) => one.packet === two.packet && one.designation === two.designation);
}

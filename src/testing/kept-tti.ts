// The TTI of the copy of a page a viewer sees, made from the typed
// sub-pages the kit keeps and sends (protocol 3 sends no TTI), so the
// tests that read a page's rows, cursor and OL,26 controls read them as
// before: each sub-page's PN, OL, FL and CU lines, and its packets X/26 as
// OL,26 lines of a designation code and 39 characters of six bits each.
// The component library and the channels each kept a copy of this in their
// tests until it came here (TODO-1539 item 5).

import type { Harness } from "./harness.ts";
import { decodeRow, type SubPageContent } from "../page/content.ts";
import { Screen } from "../page/screen.ts";

/** A packed character is this plus its six bits: printable, as the engine writes it. */
const PACKED_CHARACTER_BASE = 0x40;
const SIX_BITS = 0x3f;
const ADDRESS_BITS = 6;
const MODE_BITS = 5;
const CHARACTER_BITS = 6;
/** Each packed line's packet number: X/26, X/27, X/28 and M/29. */
const ENHANCEMENT = 26;
const PACKETS: Readonly<Record<string, number>> = { x27: 27, x28: 28, m29: 29 };
/** The cursor record's block flag (DOC-1954). */
const BLOCK = 4;

/** A packed line of packet `packet`. */
function packedLine(packet: number, designation: number, triplets: SubPageContent["enhancements"][number]["triplets"]): string {
  const characters = [
    designation,
    ...triplets.flatMap(({ address, mode, data }) => {
      const value = address | (mode << ADDRESS_BITS) | (data << (ADDRESS_BITS + MODE_BITS));
      return [value & SIX_BITS, (value >> CHARACTER_BITS) & SIX_BITS, (value >> (2 * CHARACTER_BITS)) & SIX_BITS];
    }),
  ];
  return `OL,${packet},${String.fromCodePoint(...characters.map((code) => PACKED_CHARACTER_BASE | code))}`;
}

/** One sub-page's TTI. */
function subPageTti(page: number, sub: number, content: SubPageContent): string {
  const screen = new Screen();
  content.rows.forEach((row, at) => {
    screen.codes(at, 0, decodeRow(row));
  });
  const links = content.links.map((link) => (link === null ? null : Number.parseInt(link.page, 16)));
  screen.fastext([links[0] ?? null, links[1] ?? null, links[2] ?? null, links[3] ?? null]);
  if (links[5] !== null && links[5] !== undefined) {
    screen.indexLink(links[5]);
  }
  if (content.cursor !== null && content.cursor !== undefined) {
    screen.cursor(content.cursor.row, content.cursor.column, content.cursor.block ? BLOCK : 0);
  }
  const packed = content.packets.flatMap((line) =>
    "triplets" in line ? [packedLine(PACKETS[line.packet] ?? ENHANCEMENT, line.designation, line.triplets)] : [],
  );
  return (
    screen.toTti(page, sub) +
    [...packed, ...content.enhancements.map(({ designation, triplets }) => packedLine(ENHANCEMENT, designation, triplets))].map((line) => `${line}\n`).join("")
  );
}

/** The TTI of the copy of `page` that `session` sees: its own while it has one, else the channel's; undefined if neither was published. */
export function keptTti(harness: Harness, page: number, session = 1): string | undefined {
  const copy = harness.channel.copy(session, page) ?? harness.channel.copy("channel", page);
  return copy?.map(({ sub, content }) => subPageTti(page, sub, content)).join("");
}

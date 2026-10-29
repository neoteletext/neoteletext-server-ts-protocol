// The program's side of the protocol: each line it writes is checked first
// as the server will check it, so a mistake is caught where it is made.
// The bounds it checks against are those the server gives in `start`
// (docs/applications.md section 2); the kit writes none of its own, so the
// declaration, which comes before `start`, is checked for its form only and
// its count and titles' lengths by the server.

import { CONTROL_CHARACTER } from "../input/typed.ts";
import { isPageNumber, pageText } from "../page/page-numbers.ts";
import { Screen } from "../page/screen.ts";
import { type Subpage, tti } from "../page/subpage.ts";
import type { Audience, SoundMember } from "../sound/members.ts";
import { soundFields } from "../sound/sound-fields.ts";
import { LONGEST_LINE, type Limits } from "./limits.ts";
import { isSession } from "./server-message.ts";

/** A sub-code's four hexadecimal digits, as a put's SC line and a remove write it. */
const SUBCODE_DIGITS = 4;
/** The largest number four hexadecimal digits write; the server refuses those outside the standard's thirteen bits. */
const LARGEST_FOUR_DIGITS = 0xffff;

/** Seven-bit text: what a TTI text may hold. */
const ASCII = /^\p{ASCII}*$/u;

/** The line that starts each sub-page of a TTI text. */
const PAGE_NUMBER_LINE = "PN,";

/** Who a publication belongs to: the channel's one shared copy, or one session's own (SERVER.md section 7.3). */
export type Owner = "channel" | number;

/** A page the program serves, for the channel's contents. */
export interface PageDeclaration {
  readonly page: number;
  readonly title: string;
  /** The name of the section this page starts in `contents.txt`, which a receiver shows as its magazine's name (docs/applications.md section 3.1). */
  readonly section?: string;
}

/** Whether `text` is a title or a section's name the server takes: none of its characters a control, and, once `start` has said, within its length. */
function isTitle(text: string, limits: Limits | undefined): boolean {
  return (limits === undefined || Array.from(text).length <= limits.budgets.titleCharacters) && !CONTROL_CHARACTER.test(text);
}

/** Whether `subcode` can be written as a sub-code's four hexadecimal digits. */
function isSubcodeNumber(subcode: unknown): subcode is number {
  return typeof subcode === "number" && Number.isInteger(subcode) && subcode >= 0 && subcode <= LARGEST_FOUR_DIGITS;
}

/** The program's side of the protocol: each call writes one line, checked first as the server will check it. */
export class App {
  readonly #write: (line: string) => void;
  /** Each declared page's title as `contents.txt` lists it now. */
  readonly #titles = new Map<number, string>();
  #declared = false;
  #limits: Limits | undefined;

  /** A program that writes its lines, each without its newline, to `write`. */
  constructor(write: (line: string) => void) {
    this.#write = write;
  }

  #send(message: Readonly<Record<string, unknown>>): void {
    this.#write(JSON.stringify(message));
  }

  /** The server said `start`, with the limits it keeps to. */
  started(limits: Limits): void {
    this.#limits = limits;
  }

  /** The limits `start` gave; a program publishes only after `start`, so asking before is a mistake. */
  limits(): Limits {
    if (this.#limits === undefined) {
      throw new Error("the limits are the server's, given in start: nothing is published before it");
    }
    return this.#limits;
  }

  /** Declares the program's pages: the first line, once. */
  declare(pages: readonly PageDeclaration[]): void {
    if (this.#declared) {
      throw new Error("pages are declared once, in the first line");
    }
    for (const { page, title, section } of pages) {
      if (!isPageNumber(page) || this.#titles.has(page)) {
        throw new RangeError(`page ${page} is not a page number, or is declared twice`);
      }
      if (!isTitle(title, this.#limits)) {
        throw new RangeError(`the title of ${pageText(page)} has controls`);
      }
      if (section !== undefined && !isTitle(section, this.#limits)) {
        throw new RangeError(`the section ${pageText(page)} starts has controls`);
      }
      this.#titles.set(page, title);
    }
    this.#declared = true;
    this.#send({
      type: "pages",
      pages: pages.map(({ page, title, section }) => ({ page: pageText(page), title, ...(section === undefined ? {} : { section }) })),
    });
  }

  /** Whether `page` was declared. */
  serves(page: number): boolean {
    return this.#titles.has(page);
  }

  /** The title `contents.txt` lists `page` under now, if it was declared. */
  titleOf(page: number): string | undefined {
    return this.#titles.get(page);
  }

  /** Gives `page` a new title in the channel's contents, for what it holds now; nothing is sent if it already has it (docs/applications.md section 3.5). */
  title(page: number, title: string): void {
    const now = this.#titles.get(page);
    if (now === undefined) {
      throw new RangeError(`title: ${pageText(page)} was not declared`);
    }
    if (!isTitle(title, this.limits())) {
      throw new RangeError(`title: the title of ${pageText(page)} is over ${this.limits().budgets.titleCharacters} characters or has controls`);
    }
    if (now !== title) {
      this.#titles.set(page, title);
      this.#send({ type: "title", page: pageText(page), title });
    }
  }

  /** Drops `session`'s own copy of `page`: from now on it sees the channel's (docs/applications.md section 3.6). */
  release(session: number, page: number): void {
    if (!isSession(session) || !this.#titles.has(page)) {
      throw new RangeError(`release: session ${session}, page ${page}, which was not declared`);
    }
    this.#send({ type: "release", session, page: pageText(page) });
  }

  #check(kind: string, owner: Owner, page: number): void {
    if (!this.#titles.has(page)) {
      throw new RangeError(`${kind}: ${pageText(page)} was not declared`);
    }
    if (owner !== "channel" && !isSession(owner)) {
      throw new RangeError(`${kind}: owner is "channel" or a session, not ${String(owner)}`);
    }
  }

  /**
   * Publishes `page` whole: one screen, or sub-pages in their order, the
   * page's others ended. The server numbers them by place as the code of
   * practice does (docs/applications.md section 3.2), so a sub-code given
   * is not written; at most `start`'s `numbered_subpages`.
   */
  publish(owner: Owner, page: number, content: Screen | readonly Subpage[]): void {
    this.#check("publish", owner, page);
    const screens = content instanceof Screen ? [content] : content.map(({ screen }) => screen);
    const most = this.limits().standard.numberedSubpages;
    if (screens.length === 0 || screens.length > most) {
      throw new RangeError(`publish: 1 to ${most} sub-pages`);
    }
    this.#send({
      type: "publish",
      page: pageText(page),
      owner,
      tti: tti(
        page,
        screens.map((screen) => ({ screen })),
      ),
    });
  }

  /**
   * Puts sub-pages in `page`, each named by its sub-code, keeping the
   * page's others (docs/applications.md section 3.2): one with a sub-code
   * the page has replaces it, a new one is placed by its sub-code.
   */
  put(owner: Owner, page: number, subpages: readonly Subpage[]): void {
    this.#check("publish", owner, page);
    const most = this.limits().standard.subpages;
    if (subpages.length === 0 || subpages.length > most) {
      throw new RangeError(`publish: 1 to ${most} sub-pages`);
    }
    const subcodes = new Set<number>();
    for (const { subcode } of subpages) {
      if (!isSubcodeNumber(subcode) || subcodes.has(subcode)) {
        throw new RangeError(`publish: a put names each sub-page once by a sub-code of ${SUBCODE_DIGITS} hexadecimal digits`);
      }
      subcodes.add(subcode);
    }
    this.#send({ type: "publish", page: pageText(page), owner, tti: tti(page, subpages), keep: true });
  }

  /** Ends the sub-pages of `subcodes` in `page`, keeping its others; a page left with none is no longer served (docs/applications.md section 3.2a). */
  remove(owner: Owner, page: number, subcodes: readonly number[]): void {
    this.#check("remove", owner, page);
    const most = this.limits().standard.subpages;
    if (subcodes.length === 0 || subcodes.length > most || !subcodes.every((subcode) => isSubcodeNumber(subcode))) {
      throw new RangeError(`remove: 1 to ${most} sub-codes of ${SUBCODE_DIGITS} hexadecimal digits`);
    }
    this.#send({
      type: "remove",
      page: pageText(page),
      owner,
      subpages: subcodes.map((subcode) => subcode.toString(16).toUpperCase().padStart(SUBCODE_DIGITS, "0")),
    });
  }

  /**
   * Publishes `page` from TTI written elsewhere, such as a converted
   * picture's file: every sub-page from its PN line, which the server
   * addresses to `page` and numbers by place whatever the PN and SC lines
   * say, a whole page as {@link App.publish} is. The text must be ASCII,
   * control codes in the escape form: the protocol carries it as a JSON
   * string, and a byte of the 8-bit form (0x80 to 0x9F) would arrive as
   * two bytes of UTF-8.
   */
  publishTti(owner: Owner, page: number, text: string): void {
    this.#check("publish", owner, page);
    if (!ASCII.test(text) || text.length > Math.min(LONGEST_LINE, this.limits().budgets.lineBytes)) {
      throw new RangeError("publish: TTI is ASCII, control codes escaped, within the line's bound");
    }
    const subpages = text.split("\n").filter((line) => line.startsWith(PAGE_NUMBER_LINE)).length;
    const most = this.limits().standard.numberedSubpages;
    if (subpages === 0 || subpages > most) {
      throw new RangeError(`publish: 1 to ${most} sub-pages, each from a PN line`);
    }
    this.#send({ type: "publish", page: pageText(page), owner, tti: text });
  }

  /** Sends the session's viewer to `page` (INPUT.md section 7.1, REQ-INT-113). */
  goto(session: number, page: number): void {
    if (!isSession(session) || !isPageNumber(page)) {
      throw new RangeError(`goto: session ${session} to page ${page}`);
    }
    this.#send({ type: "goto", session, page: pageText(page) });
  }

  /** A sound for `to`: an object, a live sound, live blocks, or a command (docs/applications.md section 3.4). */
  sound(to: Audience, member: SoundMember): void {
    const audience = "session" in to ? { session: to.session } : { page: pageText(to.page) };
    if ("session" in to ? !isSession(to.session) : !isPageNumber(to.page)) {
      throw new RangeError("sound: to is a session or a page");
    }
    this.#send({ type: "sound", to: audience, ...soundFields(member) });
  }

  log(text: string): void {
    this.#send({ type: "log", text });
  }
}

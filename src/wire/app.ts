// The program's side of the protocol: each line it writes is checked first
// as the server will check it, so a mistake is caught where it is made.

import { CONTROL_CHARACTER } from "../input/typed.ts";
import { isPageNumber, pageText } from "../page/page-numbers.ts";
import { Screen } from "../page/screen.ts";
import { type Subpage, tti } from "../page/subpage.ts";
import type { Audience, SoundMember } from "../sound/members.ts";
import { soundFields } from "../sound/sound-fields.ts";
import { LONGEST_LINE, LONGEST_TITLE, MOST_PAGES, MOST_SUBPAGES } from "./limits.ts";
import { isSession } from "./server-message.ts";

/** The highest sub-page number: TTI's PN line writes it in two decimal digits. */
const LAST_SUBPAGE = 99;

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

/** Whether `text` is a title or a section's name the server takes: at most {@link LONGEST_TITLE} characters, none a control. */
function isTitle(text: string): boolean {
  return Array.from(text).length <= LONGEST_TITLE && !CONTROL_CHARACTER.test(text);
}

/** The program's side of the protocol: each call writes one line, checked first as the server will check it. */
export class App {
  readonly #write: (line: string) => void;
  /** Each declared page's title as `contents.txt` lists it now. */
  readonly #titles = new Map<number, string>();
  #declared = false;

  /** A program that writes its lines, each without its newline, to `write`. */
  constructor(write: (line: string) => void) {
    this.#write = write;
  }

  #send(message: Readonly<Record<string, unknown>>): void {
    this.#write(JSON.stringify(message));
  }

  /** Declares the program's pages: the first line, once. */
  declare(pages: readonly PageDeclaration[]): void {
    if (this.#declared) {
      throw new Error("pages are declared once, in the first line");
    }
    if (pages.length > MOST_PAGES) {
      throw new RangeError(`at most ${MOST_PAGES} pages`);
    }
    for (const { page, title, section } of pages) {
      if (!isPageNumber(page) || this.#titles.has(page)) {
        throw new RangeError(`page ${page} is not a page number, or is declared twice`);
      }
      if (!isTitle(title)) {
        throw new RangeError(`the title of ${pageText(page)} is over ${LONGEST_TITLE} characters or has controls`);
      }
      if (section !== undefined && !isTitle(section)) {
        throw new RangeError(`the section ${pageText(page)} starts is over ${LONGEST_TITLE} characters or has controls`);
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
    if (!isTitle(title)) {
      throw new RangeError(`title: the title of ${pageText(page)} is over ${LONGEST_TITLE} characters or has controls`);
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

  /** Publishes `page`: one screen as sub-page 0, or sub-pages each numbered as given. */
  publish(owner: Owner, page: number, content: Screen | readonly Subpage[]): void {
    if (!this.#titles.has(page)) {
      throw new RangeError(`publish: ${pageText(page)} was not declared`);
    }
    if (owner !== "channel" && !isSession(owner)) {
      throw new RangeError(`publish: owner is "channel" or a session, not ${String(owner)}`);
    }
    const subpages = content instanceof Screen ? [{ screen: content, subpage: 0 }] : content;
    if (subpages.length === 0 || subpages.length > MOST_SUBPAGES) {
      throw new RangeError(`publish: 1 to ${MOST_SUBPAGES} sub-pages`);
    }
    if (subpages.some(({ subpage }) => !Number.isInteger(subpage) || subpage < 0 || subpage > LAST_SUBPAGE)) {
      throw new RangeError(`publish: a sub-page is 0 to ${LAST_SUBPAGE}`);
    }
    this.#send({ type: "publish", page: pageText(page), owner, tti: tti(page, subpages) });
  }

  /**
   * Publishes `page` from TTI written elsewhere, such as a converted
   * picture's file: every sub-page from its PN line, which the server
   * addresses to `page` whatever the line says. The text must be ASCII,
   * control codes in the escape form: the protocol carries it as a JSON
   * string, and a byte of the 8-bit form (0x80 to 0x9F) would arrive as
   * two bytes of UTF-8.
   */
  publishTti(owner: Owner, page: number, text: string): void {
    if (!this.#titles.has(page)) {
      throw new RangeError(`publish: ${pageText(page)} was not declared`);
    }
    if (owner !== "channel" && !isSession(owner)) {
      throw new RangeError(`publish: owner is "channel" or a session, not ${String(owner)}`);
    }
    if (!ASCII.test(text) || text.length > LONGEST_LINE) {
      throw new RangeError("publish: TTI is ASCII, control codes escaped, within the line's bound");
    }
    const subpages = text.split("\n").filter((line) => line.startsWith(PAGE_NUMBER_LINE)).length;
    if (subpages === 0 || subpages > MOST_SUBPAGES) {
      throw new RangeError(`publish: 1 to ${MOST_SUBPAGES} sub-pages, each from a PN line`);
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

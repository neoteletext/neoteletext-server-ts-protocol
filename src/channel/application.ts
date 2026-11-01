// A program behind some of a channel's pages: the plain state machines of
// teletext-server's crates/teletext-runtime/src/application.rs, hosted here rather than in
// the server. One program serves every viewer, so an application keeps
// each session's state and forgets it when the session closes
// (docs/applications.md section 4).

import { Context } from "./context.ts";
import type { PageRequest } from "./request.ts";
import type { Input } from "../input/input.ts";
import type { PageKeys } from "../navigation/page-keys.ts";
import type { ServerStats } from "../wire/stats.ts";

/** One page an application serves: its number, its title, which keys it uses itself, and the section it starts, if any. */
export interface PageEntry extends PageKeys {
  readonly page: number;
  readonly title: string;
  /** The name of the section of `contents.txt` this page starts: its magazine's name (docs/applications.md section 3.1). */
  readonly section?: string;
}

/**
 * What a program says of one of its pages for the web (REQ-1728). A page is
 * public only when its program gives this, and everything in it, and all the
 * page shows, is then readable by anyone: its title and text are in the bytes
 * of the page's address for anyone who looks.
 */
export interface PageDescription {
  /** Marking a page public is never automatic: it is said, here, in so many words. */
  readonly public: true;
  /** Its title, plain text. */
  readonly title: string;
  /** Its text, plain text. */
  readonly text: string;
}

/** A program behind some of a channel's pages. */
export interface Application {
  /** The pages it serves, for the channel's contents and to route input. */
  pages(): readonly PageEntry[];
  /** The channel started: publish the shared pages. */
  start(context: Context): void;
  /** A session began: a viewer connected. */
  joined?(session: number, context: Context): void;
  /**
   * The viewer made a selection of one of this application's pages, before
   * the page opens: every selection, so that `request.path` is never stale,
   * with no query as an empty one (DEC-1730 item 9, TODO-1731 item 4). Null
   * for that page once the viewer leaves it.
   */
  request?(session: number, page: number, request: PageRequest | null, context: Context): void;
  /** The session's viewer opened one of this application's pages. */
  opened?(session: number, page: number, context: Context): void;
  /** The session's viewer left one of this application's pages. */
  leftPage?(session: number, page: number, context: Context): void;
  /**
   * Input on the sub-page `sub` of one of this application's pages, the
   * one the viewer was looking at, that navigation did not take. Answer
   * true for a click the page took; any other click follows the Fastext
   * prompt or the page number it is on.
   */
  input?(session: number, page: number, input: Input, context: Context, sub: number): boolean | void;
  /** The time asked for with {@link Context.wakeAt} has come. */
  wake?(context: Context): void;
  /** The session ended: forget it. */
  ended?(session: number, context: Context): void;
  /** The server's figures, every 10 seconds (docs/applications.md section 7), for a page to show. */
  stats?(stats: ServerStats, context: Context): void;
  /**
   * What `page` shows on the web, or nothing for a page that is not public,
   * which is what an application without this method says of every page. It
   * is given the page number and nothing else: no session and no context,
   * because the answer goes to everyone, so it cannot hold one viewer's data.
   */
  describe?(page: number): PageDescription | null | undefined;
}

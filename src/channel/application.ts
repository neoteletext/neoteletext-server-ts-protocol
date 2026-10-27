// A program behind some of a channel's pages: the plain state machines of
// teletext-server's crates/teletext-runtime/src/application.rs, hosted here rather than in
// the server. One program serves every viewer, so an application keeps
// each session's state and forgets it when the session closes
// (docs/applications.md section 4).

import { Context } from "./context.ts";
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

/** A program behind some of a channel's pages. */
export interface Application {
  /** The pages it serves, for the channel's contents and to route input. */
  pages(): readonly PageEntry[];
  /** The channel started: publish the shared pages. */
  start(context: Context): void;
  /** A session began: a viewer connected. */
  joined?(session: number, context: Context): void;
  /** The session's viewer opened one of this application's pages. */
  opened?(session: number, page: number, context: Context): void;
  /** The session's viewer left one of this application's pages. */
  leftPage?(session: number, page: number, context: Context): void;
  /**
   * Input on one of this application's pages, open with the keys, that
   * navigation did not take. Answer true for a click the page took; any
   * other click follows the Fastext prompt or the page number it is on.
   */
  input?(session: number, page: number, input: Input, context: Context): boolean | void;
  /** The time asked for with {@link Context.wakeAt} has come. */
  wake?(context: Context): void;
  /** The session ended: forget it. */
  ended?(session: number, context: Context): void;
  /** The server's figures, every 10 seconds (docs/applications.md section 7), for a page to show. */
  stats?(stats: ServerStats, context: Context): void;
}

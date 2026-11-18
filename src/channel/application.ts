// A program behind some of a channel's pages: the plain state machines of
// teletext-server's crates/teletext-runtime/src/application.rs, hosted here rather than in
// the server. One program serves every viewer, so an application keeps
// each connection's state, one a browser tab (DEC-6443; viewer-state.md
// VS-403), and forgets it when the connection is gone. A viewer's tabs
// together are found by the viewer's handle, which the program keeps
// (VS-401): a handle may be used only to provide what the viewer asked for
// on this channel, never for advertising, profiling, analytics beyond
// aggregate counts or sharing, and what is kept for it is deleted at
// `end_state` (VS-409).

import { Context } from "./context.ts";
import type { PageRequest } from "./request.ts";
import type { Viewer } from "./viewer.ts";
import type { Input } from "../input/input.ts";
import type { PageKeys } from "../navigation/page-keys.ts";
import type { Refused, SoundBuilt, StateRefusal } from "../wire/generated/protocol.js";
import type { ServerStats } from "../wire/server-message.ts";

/** One page an application serves: its number, its title, which keys it uses itself, and the section it starts, if any. */
export interface PageEntry extends PageKeys {
  readonly page: number;
  readonly title: string;
  /** The name of the section of `contents.txt` this page starts: its magazine's name (DOC-1970). */
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
  /** A connection opened: a browser tab. */
  joined?(connection: number, context: Context): void;
  /**
   * The viewer made a selection of one of this application's pages, before
   * the page opens: every selection, so that `request.path` is never stale,
   * with no query as an empty one (DEC-1730 item 9, TODO-1731 item 4). Null
   * for that page once the viewer leaves it.
   */
  request?(connection: number, page: number, request: PageRequest | null, context: Context): void;
  /** The connection opened one of this application's pages. */
  opened?(connection: number, page: number, context: Context): void;
  /** The connection left one of this application's pages. */
  leftPage?(connection: number, page: number, context: Context): void;
  /**
   * Input on the sub-page `sub` of one of this application's pages, the
   * one the viewer was looking at, that navigation did not take. Answer
   * true for a click the page took; any other click follows the Fastext
   * prompt or the page number it is on.
   */
  input?(connection: number, page: number, input: Input, context: Context, sub: number): boolean | void;
  /** The time asked for with {@link Context.wakeAt} has come. */
  wake?(context: Context): void;
  /** The connection closed and will not come back, because the server said so or because `start` came and ended them all (REQ-1056; VS-351 item 6): forget it. It is called before that `start`. */
  gone?(connection: number, context: Context): void;
  /** The server's figures, every 10 seconds (DOC-1968), for a page to show. */
  stats?(stats: ServerStats, context: Context): void;
  /**
   * What `page` shows on the web, or nothing for a page that is not public,
   * which is what an application without this method says of every page. It
   * is given the page number and nothing else: no connection and no context,
   * because the answer goes to everyone, so it cannot hold one viewer's data.
   */
  describe?(page: number): PageDescription | null | undefined;
  /**
   * The server refused a line the program sent (REQ-1475): the path of its
   * first fault, the rule broken and the detail, and for a sound the sound
   * it concerns (server.md SRV-48). Every rule of a sound the schema cannot
   * state is the server's, and this is how a program learns of a fault in
   * one (typescript.md TS-22): have it do something a person will see. A
   * refusal of a `measure` rejects that measure's promise instead.
   */
  refused?(refusal: Refused, context: Context): void;
  /** A stored synthesizer sound was built and sent, with what a Standard MIDI File's reading dropped and the banks lifted from it (server.md SRV-47; TS-23). */
  soundBuilt?(report: SoundBuilt, context: Context): void;
  /** The connection, which had no viewer, now has one: after `requestState`, or when the viewer offered state (VS-351 item 2). */
  viewerBegan?(connection: number, viewer: Viewer, remembered: boolean, context: Context): void;
  /** The connection no longer carries a viewer (VS-351 item 3): what was kept for the viewer on this connection ends. */
  viewerLeft?(connection: number, context: Context): void;
  /** A state request or an offer to remember on the connection was not granted (VS-351 item 4). */
  stateRefused?(connection: number, reason: StateRefusal, context: Context): void;
  /** Every viewer handle the program knows is void (VS-351 item 5). */
  viewersReset?(context: Context): void;
}

// What a program does with each of the server's messages.

import type { Input } from "../input/input.ts";
import type { Limits } from "./limits.ts";
import type { CookiePair, Refusal, Selection, ServerMessage } from "./server-message.ts";
import type { ServerStats } from "./stats.ts";

/** What the program does with each of the server's messages (docs/applications.md section 2). */
export interface ServerEvents {
  start(epochMs: number, limits: Limits): void;
  /** A viewer's connection opened: answer with `reply`, once (REQ-1471). */
  connected(connection: number, session: number, selection: Selection | null, cookies: readonly CookiePair[]): void;
  /** The connection selected a page (sub-code 3F7F) or one sub-page: answer with one sub-page (REQ-1472). */
  selected(connection: number, selection: Selection): void;
  input(connection: number, page: number, input: Input): void;
  /** The connection's selection left `page`, or the connection closed. */
  left(connection: number, page: number): void;
  /** The session ended: forget it. */
  closed(session: number): void;
  stats(stats: ServerStats): void;
  /** A line the program sent was refused whole. */
  refused(refusal: Refusal): void;
}

export function dispatch(message: ServerMessage, events: ServerEvents): void {
  switch (message.type) {
    case "start": {
      events.start(message.epochMs, message.limits);
      return;
    }
    case "connected": {
      events.connected(message.connection, message.session, message.selection, message.cookies);
      return;
    }
    case "selected": {
      events.selected(message.connection, message.selection);
      return;
    }
    case "input": {
      events.input(message.connection, message.page, message.input);
      return;
    }
    case "left": {
      events.left(message.connection, message.page);
      return;
    }
    case "closed": {
      events.closed(message.session);
      return;
    }
    case "stats": {
      events.stats(message.stats);
      return;
    }
    case "refused": {
      events.refused(message.refusal);
    }
  }
}

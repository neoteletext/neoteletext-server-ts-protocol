// What a program does with each of the server's messages.

import type { Input } from "../input/input.ts";
import type { ServerMessage } from "./server-message.ts";
import type { ServerStats } from "./stats.ts";

/** What the program does with each of the server's messages. */
export interface ServerEvents {
  start(epochMs: number): void;
  join(session: number): void;
  open(session: number, page: number): void;
  leave(session: number, page: number): void;
  input(session: number, page: number, input: Input): void;
  close(session: number): void;
  stats(stats: ServerStats): void;
}

export function dispatch(message: ServerMessage, events: ServerEvents): void {
  switch (message.type) {
    case "start": {
      events.start(message.epochMs);
      return;
    }
    case "join": {
      events.join(message.session);
      return;
    }
    case "open": {
      events.open(message.session, message.page);
      return;
    }
    case "leave": {
      events.leave(message.session, message.page);
      return;
    }
    case "input": {
      events.input(message.session, message.page, message.input);
      return;
    }
    case "close": {
      events.close(message.session);
      return;
    }
    case "stats": {
      events.stats(message.stats);
    }
  }
}

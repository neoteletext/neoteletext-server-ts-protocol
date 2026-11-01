// What a connection's selection tells the application that serves its page:
// that the session came to the page, that it left, and its request.

import type { Application } from "./application.ts";
import type { Connection, Connections } from "./connections.ts";
import type { Context } from "./context.ts";
import type { PageRequest } from "./request.ts";

/** What these calls need of the channel. */
export interface PageCalls {
  readonly connections: Connections;
  readonly callOwner: (page: number, run: (application: Application, context: Context) => void) => void;
}

/** The connection's selection came to its page: the page's application is told, for the session's first connection there. */
export function tellOpened(calls: PageCalls, connection: number, state: Connection): void {
  const { page, session } = state;
  if (page === null || calls.connections.otherOn(connection, session, page)) {
    return;
  }
  calls.callOwner(page, (application, context) => {
    application.opened?.(session, page, context);
  });
}

/** The connection's selection made this request, or none: the page's application is told when its query changes. */
export function tellRequest(calls: PageCalls, state: Connection, request: PageRequest | null): void {
  const { page, session } = state;
  const query = request?.queryText ?? null;
  if (page === null || query === state.query) {
    return;
  }
  state.query = query;
  calls.callOwner(page, (application, context) => {
    application.request?.(session, page, request, context);
  });
}

/** The connection's selection left its page: the page's application is told, for the session's last connection there. */
export function tellLeft(calls: PageCalls, connection: number, state: Connection): void {
  const { page, session } = state;
  if (page === null || calls.connections.otherOn(connection, session, page)) {
    return;
  }
  calls.callOwner(page, (application, context) => {
    application.leftPage?.(session, page, context);
  });
}

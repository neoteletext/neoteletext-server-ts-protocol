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

/** The connection made a selection: the page's application is told of every one, so that `request.path` is never stale (TODO-1731 item 4). */
export function tellRequest(calls: PageCalls, state: Connection, request: PageRequest): void {
  const { page, session } = state;
  if (page === null) {
    return;
  }
  state.query = request.queryText === "" ? null : request.queryText;
  state.requested = true;
  calls.callOwner(page, (application, context) => {
    application.request?.(session, page, request, context);
  });
}

/** The connection's selection left its page: the page's application is told its request ended. */
export function tellRequestEnded(calls: PageCalls, state: Connection): void {
  const { page, session, requested } = state;
  state.query = null;
  state.requested = false;
  if (page === null || !requested) {
    return;
  }
  calls.callOwner(page, (application, context) => {
    application.request?.(session, page, null, context);
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

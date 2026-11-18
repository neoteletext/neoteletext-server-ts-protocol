// What a program does with each of the server's messages, version 13: the
// generated type of each (typescript.md TS-18), its page numbers read as
// numbers, its input as the kit's.

import type { Input } from "../input/input.ts";
import { readInput } from "../input/read-input.ts";
import type { Handle, Measured, Refused, ServerMessage, SoundBuilt, StateRefusal } from "./generated/protocol.js";
import { type Language, readLanguages } from "./languages.ts";
import { type Limits, readLimits } from "./limits.ts";
import { type Selection, type ServerStats, numberOf } from "./server-message.ts";

/** What the program does with each of the server's messages (DOC-1968; viewer-state.md VS-351). */
export interface ServerEvents {
  start(epochMs: number, limits: Limits, languages: readonly Language[]): void;
  /** A viewer's connection opened: answer with `reply`, once (REQ-1471). `viewer` is the viewer's handle on the channel, or null (VS-351 item 1). */
  connected(
    connection: number,
    request: number,
    selection: Selection | null,
    path: string | null,
    query: string | null,
    viewer: Handle | null,
    remembered: boolean,
  ): void;
  /** The connection selected a page (sub-code 3F7F) or one sub-page: answer with one sub-page (REQ-1472). */
  selected(connection: number, request: number, selection: Selection, path: string, query: string | null): void;
  /** Input on the sub-page the viewer was looking at (REQ-1557). */
  input(connection: number, page: number, sub: number, input: Input): void;
  /** The connection's selection left `page`, or the connection closed. */
  left(connection: number, page: number): void;
  /** The connection closed and will not come back (VS-351 item 6): forget it. */
  gone(connection: number): void;
  /** A connection that had no viewer now has one (VS-351 item 2). */
  viewerBegan(connection: number, viewer: Handle, remembered: boolean): void;
  /** The connection no longer carries a viewer (VS-351 item 3). */
  viewerLeft(connection: number): void;
  /** A state request or an offer to remember was not granted (VS-351 item 4). */
  stateRefused(connection: number, reason: StateRefusal): void;
  /** Every handle the program knows is void (VS-351 item 5). */
  viewersReset(): void;
  stats(stats: ServerStats): void;
  /** A line the program sent was refused whole. */
  refused(refusal: Refused): void;
  /** The answer to the program's `measure` of number `request` (REQ-2216). */
  measured(request: number, measured: Measured): void;
  /** A web visitor is at the page's address: answer with `description`. Nothing here says who, because nothing in the answer may depend on it (REQ-1728). */
  describe(page: number): void;
  /** A stored synthesizer sound was built and sent (server.md SRV-47). */
  soundBuilt(report: SoundBuilt): void;
}

/** The messages about one connection. */
type ConnectionMessage = Extract<ServerMessage, { readonly connection: number }>;

/** Calls the event of a message about one connection. */
function dispatchConnection(message: ConnectionMessage, events: ServerEvents): void {
  switch (message.type) {
    case "connected": {
      const selection = message.selection ?? null;
      const selected = selection === null ? null : { page: numberOf(selection.page), sub: numberOf(selection.sub) };
      events.connected(message.connection, message.request, selected, message.path ?? null, message.query ?? null, message.viewer ?? null, message.remembered);
      return;
    }
    case "selected": {
      events.selected(message.connection, message.request, { page: numberOf(message.page), sub: numberOf(message.sub) }, message.path, message.query ?? null);
      return;
    }
    case "input": {
      events.input(message.connection, numberOf(message.page), numberOf(message.sub), readInput(message.event, message.lost));
      return;
    }
    case "left": {
      events.left(message.connection, numberOf(message.page));
      return;
    }
    case "gone": {
      events.gone(message.connection);
      return;
    }
    case "viewer_began": {
      events.viewerBegan(message.connection, message.viewer, message.remembered);
      return;
    }
    case "viewer_left": {
      events.viewerLeft(message.connection);
      return;
    }
    case "state_refused": {
      events.stateRefused(message.connection, message.reason);
    }
  }
}

/** Calls the event of `message`. */
export function dispatch(message: ServerMessage, events: ServerEvents): void {
  switch (message.type) {
    case "start": {
      events.start(message.epoch_ms, readLimits(message.standard, message.budgets), readLanguages(message.languages));
      return;
    }
    case "viewers_reset": {
      events.viewersReset();
      return;
    }
    case "stats": {
      events.stats({ server: message.server, channel: message.channel });
      return;
    }
    case "refused": {
      events.refused(message);
      return;
    }
    case "measured": {
      events.measured(message.request, message);
      return;
    }
    case "describe": {
      events.describe(numberOf(message.page));
      return;
    }
    case "sound_built": {
      events.soundBuilt(message);
      return;
    }
    case "connected":
    case "selected":
    case "input":
    case "left":
    case "gone":
    case "viewer_began":
    case "viewer_left":
    case "state_refused": {
      dispatchConnection(message, events);
    }
  }
}

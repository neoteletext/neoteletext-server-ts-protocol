// A page's local state in one viewer's receiver, as the server answers a
// state query with it (page-rules.md RULE-38, RULE-55).

import type { ServerMessagePageState } from "../wire/generated/protocol.js";

/** What `context.queryState` resolves to: the server's `page_state` message as it is (typescript.md TS-14). */
export type PageState = ServerMessagePageState;

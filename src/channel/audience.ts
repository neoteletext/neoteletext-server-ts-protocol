// Who hears a message (typescript.md TS-20): one connection, every connection
// whose selection is on a page when the call is made, the connections named,
// or every connection open. The kit turns it into the message's
// `connections`. There is no server session under protocol 13
// (viewer-state.md VS-354), so a viewer's tabs are named one by one.

/** Who hears a message: the Python kit's `connection_hears`, `page_hears`, `connections_hear` and `everyone_hears` (PY-21). */
export type Audience = { readonly connection: number } | { readonly page: number } | { readonly connections: "all" | readonly number[] };

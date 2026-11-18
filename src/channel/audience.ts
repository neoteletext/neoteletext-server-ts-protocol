// Who hears a message (typescript.md TS-20): one connection, every connection
// whose selection is on a page when the call is made, the connections named,
// or every connection open. The kit turns it into the message's
// `connections`. There is no server session under protocol 13
// (viewer-state.md VS-354), so a viewer's tabs are named one by one. A
// picture's calls may also say `{ kept: true }` (renderer parity PAR-16):
// the server keeps what is sent for the page and sub-code named, together
// (DEC-6599), and sends it to every connection that shows them, now or
// later, for as long as it is kept.

/** Who hears a message: the Python kit's `connection_hears`, `page_hears`, `connections_hear` and `everyone_hears` (PY-21). */
export type Audience = { readonly connection: number } | { readonly page: number } | { readonly connections: "all" | readonly number[] };

/**
 * Who hears a message of a sub-page's picture (PAR-16): an {@link Audience}, or `{ kept: true }`, the Python kit's
 * `kept_hears`, which only `regis`, `regisLinks`, `regisCursor`, `naplps`, `naplpsObjects`, `naplpsLinks` and
 * `naplpsCursor` take. What is kept is the page's content, as a published page's rows are: a viewer who selects the
 * page and sub-code later is sent it whole, and `forgetPicture` drops it.
 */
export type PictureAudience = Audience | { readonly kept: true };

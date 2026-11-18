// A selection as an application hears it: a web request that stays open
// (DEC-1730 items 1 and 9), in the shape a web framework gives one.

/** What a viewer's selection of a page asked for (DEC-1730 item 9). All of it but `method` is untrusted, from the viewer. */
export interface PageRequest {
  /** A selection only ever reads a page: a viewer's keys are not requests (DEC-1730). */
  readonly method: "GET";
  /** The place selected, as an address names it: `302` or `302/0002`. */
  readonly path: string;
  /** The query, as `URLSearchParams` reads it; of a name given twice, the last. */
  readonly query: Readonly<Record<string, string>>;
  /** The query as written, without its `?`, undecoded: for `URLSearchParams` again, when a name given twice matters. */
  readonly queryText: string;
}

/** The request of a selection of `path` with the query `queryText`. */
export function pageRequest(path: string, queryText: string): PageRequest {
  return { method: "GET", path, query: Object.fromEntries(new URLSearchParams(queryText)), queryText };
}

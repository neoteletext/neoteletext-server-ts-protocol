// A fault as the server says a refusal (REQ-1475): the path of the first
// fault, as the server writes it ("magazines[2].pages[14].title"), and the
// rule broken, from the server's closed list (the schema's $defs/Rule).

/** Why a message is not valid: where, by which rule, and what was found. */
export interface Fault {
  readonly path: string;
  readonly rule: string;
  readonly detail: string;
}

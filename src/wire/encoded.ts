// A message as its line carries it: the generated types give every bytes
// field as a Uint8Array (typescript.md TS-21), which the line carries as its
// exact base64 text. Derived from the generated types with TypeScript's own
// operators, never restated (TS-14).

/** `T` with every Uint8Array its base64 text, as the line carries it. */
export type Encoded<T> = T extends Uint8Array ? string : T extends object ? { readonly [K in keyof T]: Encoded<T[K]> } : T;

// The protocol's messages as they travel, version 2 (DEC-1482; the
// server's docs/applications.md sections 2 and 3): hand-written to match
// the server's published schema (schema/protocol-2.json), which the
// precompiled validators check every message against (validate.ts), so the
// two cannot drift apart unnoticed: test/protocol.test.ts holds a valid
// value of each type to the schema.

/** A page number: three hexadecimal digits in capitals, magazine 1 to 8 first ("100" to "8FF"). */
export type WirePageNumber = string;

/** A sub-code: four hexadecimal digits in capitals, "0000" to "3F7F"; "3F7F" is any sub-page (EN 300 706 clause 9.6.1). */
export type WireSubCode = string;

/** Who a message is for: every open connection, or 1 to `budgets.named_connections` of them. */
export type WireConnections = "all" | readonly number[];

export interface WireSelection {
  readonly page: WirePageNumber;
  readonly sub: WireSubCode;
}

export interface WireLink {
  readonly page: WirePageNumber;
  readonly sub: WireSubCode;
}

export type WireLinkKey = "red" | "green" | "yellow" | "cyan" | "index";

/** A key's link (TTI's `LN`, the engine's Appendix E). */
export interface WireKeyLink {
  readonly key: WireLinkKey;
  readonly target: string;
  readonly label?: string | null;
}

/** A page number on the page that leads elsewhere (TTI's `LK`). */
export interface WireNumberLink {
  readonly number: WirePageNumber;
  readonly target: string;
}

/** A run of text on the page that leads elsewhere (TTI's `LT`). */
export interface WireTextLink {
  readonly row: number;
  readonly column: number;
  readonly length: number;
  readonly target: string;
}

export interface WireLinkExtension {
  readonly keys: readonly WireKeyLink[];
  readonly numbers: readonly WireNumberLink[];
  readonly texts: readonly WireTextLink[];
}

/** The control bits C4 to C11 (EN 300 706 clause 9.3.1.3). */
export interface WireControl {
  readonly erase: boolean;
  readonly newsflash: boolean;
  readonly subtitle: boolean;
  readonly suppress_header: boolean;
  readonly update: boolean;
  readonly interrupted_sequence: boolean;
  readonly inhibit_display: boolean;
  readonly magazine_serial: boolean;
}

export interface WireCharacterSet {
  readonly region?: number | null;
  readonly national_option: number;
}

/** A triplet by its fields (EN 300 706 clause 12.3.1): address 6 bits, mode 5, data 7. */
export interface WireTriplet {
  readonly address: number;
  readonly mode: number;
  readonly data: number;
}

/** A packet X/26. */
export interface WireEnhancement {
  readonly designation: number;
  readonly triplets: readonly WireTriplet[];
}

/** A packed line other than X/26. */
export type WirePackedLine =
  | { readonly packet: "x27_nibbles"; readonly designation: number; readonly nibbles: readonly number[] }
  | { readonly packet: "x27"; readonly designation: number; readonly triplets: readonly WireTriplet[] }
  | { readonly packet: "x28"; readonly designation: number; readonly triplets: readonly WireTriplet[] }
  | { readonly packet: "m29"; readonly designation: number; readonly triplets: readonly WireTriplet[] };

export interface WireCursor {
  readonly row: number;
  readonly column: number;
  readonly block: boolean;
}

/** One sub-page, as the engine's page model, field by field (REQ-1478): a sub-page always travels alone (REQ-1501). */
export interface WirePage {
  readonly page: WirePageNumber;
  readonly sub: WireSubCode;
  /** Rows 0 to 24: base64 of 40 seven-bit codes each, or null for a blank row. */
  readonly rows: readonly (string | null)[];
  /** The six links of X/27/0: red, green, yellow, cyan, the fifth and the index. */
  readonly links: readonly (WireLink | null)[];
  readonly display_row_24: boolean;
  readonly link_extension: WireLinkExtension;
  readonly control: WireControl;
  readonly character_set: WireCharacterSet;
  readonly enhancements: readonly WireEnhancement[];
  readonly packets: readonly WirePackedLine[];
  readonly cursor?: WireCursor | null;
}

export interface WireIndexEntry {
  readonly page: WirePageNumber;
  readonly title: string;
  readonly section?: string | null;
  readonly subpages: number;
}

export interface WireMagazine {
  readonly magazine: number;
  readonly name: string;
  readonly pages: readonly WireIndexEntry[];
}

export interface WireSubPageEntry {
  readonly sub: WireSubCode;
  readonly title?: string | null;
}

export type WireAuthorLevel = "E" | "W" | "I";
export type WireOperatorLevel = "error" | "warn" | "info" | "debug";
export type WireSameSite = "Strict" | "Lax" | "None";
export type WireSampleRate = 8000 | 11025 | 16000 | 22050 | 24000 | 32000 | 44100 | 48000;

/** A sound message's own fields, by its `kind`. */
export type WireSound =
  | {
      readonly kind: "opus";
      readonly handle: number;
      readonly generation: number;
      readonly packet_bytes: number;
      readonly samples: number;
      readonly packets: string;
    }
  | { readonly kind: "opus_live"; readonly handle: number; readonly generation: number; readonly packet_bytes: number }
  | {
      readonly kind: "opus_packets";
      readonly handle: number;
      readonly generation: number;
      readonly packet_bytes: number;
      readonly first: number;
      readonly packets: string;
    }
  | { readonly kind: "object"; readonly handle: number; readonly generation: number; readonly rate: WireSampleRate; readonly pcm: string }
  | { readonly kind: "live"; readonly handle: number; readonly generation: number; readonly rate: WireSampleRate }
  | {
      readonly kind: "blocks";
      readonly handle: number;
      readonly generation: number;
      readonly rate: WireSampleRate;
      readonly first: number;
      readonly pcm: string;
    }
  | {
      readonly kind: "play";
      readonly channel: number;
      readonly handle: number;
      readonly generation: number;
      readonly gain: number;
      readonly fade_ms: number;
      readonly loop: boolean;
      readonly after: boolean;
      readonly duck: number;
      readonly page?: WirePageNumber | null;
    }
  | { readonly kind: "stop"; readonly channel: number; readonly fade_ms: number }
  | { readonly kind: "gain"; readonly channel: number; readonly gain: number; readonly fade_ms: number };

/** A message a program sends (the schema's $defs/ProgramMessage). */
export type ProgramMessage =
  | { readonly type: "reply"; readonly connection: number; readonly magazines: readonly WireMagazine[]; readonly selected?: WirePage | null }
  | { readonly type: "page"; readonly connections: WireConnections; readonly page: WirePage }
  | {
      readonly type: "subpages";
      readonly connections: WireConnections;
      readonly page: WirePageNumber;
      readonly version: number;
      readonly subpages: readonly WireSubPageEntry[];
    }
  | { readonly type: "index"; readonly connections: WireConnections; readonly magazines: readonly WireMagazine[] }
  | { readonly type: "goto"; readonly connection: number; readonly page: WirePageNumber; readonly sub: WireSubCode }
  | ({ readonly type: "sound"; readonly connections: WireConnections } & WireSound)
  | {
      readonly type: "cookie";
      readonly connection: number;
      readonly name: string;
      readonly value: string;
      readonly path?: string | null;
      readonly max_age?: number | null;
      readonly same_site?: WireSameSite | null;
      readonly secure: boolean;
      readonly http_only: boolean;
    }
  | {
      readonly type: "author_log";
      readonly connections: WireConnections;
      readonly level: WireAuthorLevel;
      readonly text: string;
      readonly page?: WirePageNumber | null;
    }
  | { readonly type: "log"; readonly level: WireOperatorLevel; readonly event: string; readonly text: string }
  | { readonly type: "packets"; readonly connections: WireConnections; readonly packets: string };

export interface WireStandard {
  readonly magazines: number;
  readonly pages: number;
  readonly pages_per_magazine: number;
  readonly pages_in_magazine_1: number;
  readonly keyable_pages: number;
  readonly subpages: number;
  readonly decimal_subpages: number;
}

export interface WireBudgets {
  readonly line_bytes: number;
  readonly title_characters: number;
  readonly author_log_bytes: number;
  readonly log_characters: number;
  readonly named_connections: number;
  readonly reply_limit_ms: number;
}

export interface WireButtons {
  readonly left: boolean;
  readonly middle: boolean;
  readonly right: boolean;
}

/** An input event as the server writes it. */
export type WireInputEvent =
  | {
      readonly kind: "key";
      readonly action: "press" | "repeat" | "release";
      readonly key: string;
      readonly text?: string | null;
      readonly base?: string | null;
    }
  | {
      readonly kind: "mouse";
      readonly action: "press" | "release" | "move";
      readonly button?: number | null;
      readonly buttons?: WireButtons | null;
      readonly column: number;
      readonly row: number;
    }
  | { readonly kind: "wheel"; readonly dx: number; readonly dy: number; readonly column: number; readonly row: number }
  | { readonly kind: "hover"; readonly action: "enter" | "leave"; readonly column: number; readonly row: number }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "paste"; readonly text: string }
  | { readonly kind: "focus" }
  | { readonly kind: "blur" };

/** A message the server sends (the schema's $defs/ServerMessage). */
export type WireServerMessage =
  | { readonly type: "start"; readonly protocol: number; readonly epoch_ms: number; readonly standard: WireStandard; readonly budgets: WireBudgets }
  | {
      readonly type: "connected";
      readonly connection: number;
      readonly session: number;
      readonly cookies: readonly { readonly name: string; readonly value: string }[];
      readonly selection?: WireSelection | null;
    }
  | { readonly type: "selected"; readonly connection: number; readonly page: WirePageNumber; readonly sub: WireSubCode }
  | { readonly type: "input"; readonly connection: number; readonly page: WirePageNumber; readonly event: WireInputEvent }
  | { readonly type: "left"; readonly connection: number; readonly page: WirePageNumber }
  | { readonly type: "closed"; readonly session: number }
  | { readonly type: "stats"; readonly server: unknown; readonly channel: unknown }
  | { readonly type: "refused"; readonly message?: string | null; readonly path: string; readonly rule: string; readonly detail: string };

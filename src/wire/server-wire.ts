// What the server sends a program, as it travels: the other half of
// protocol.ts, under the same rule.

import type { WirePageNumber, WireSelection, WireSubCode } from "./protocol.ts";

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
  readonly description_text_characters: number;
  readonly description_limit_ms: number;
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
      readonly request: number;
      readonly cookies: readonly { readonly name: string; readonly value: string }[];
      readonly selection?: WireSelection | null;
      readonly path?: string | null;
      readonly query?: string | null;
    }
  | {
      readonly type: "selected";
      readonly connection: number;
      readonly request: number;
      readonly path: string;
      readonly page: WirePageNumber;
      readonly sub: WireSubCode;
      readonly query?: string | null;
    }
  | {
      readonly type: "input";
      readonly connection: number;
      readonly page: WirePageNumber;
      readonly sub: WireSubCode;
      readonly lost: boolean;
      readonly event: WireInputEvent;
    }
  | { readonly type: "left"; readonly connection: number; readonly page: WirePageNumber }
  | { readonly type: "closed"; readonly session: number }
  | { readonly type: "stats"; readonly server: unknown; readonly channel: unknown }
  | { readonly type: "refused"; readonly message?: string | null; readonly path: string; readonly rule: string; readonly detail: string }
  | { readonly type: "describe"; readonly page: WirePageNumber };

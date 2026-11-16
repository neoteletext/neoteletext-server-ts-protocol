// The `naplps` message a program sends: more of a sub-page's NAPLPS, which
// the server sends on unread (the NAPLPS renderer's REQ-6408 item 3).

import type { WireConnections, WirePageNumber, WireSubCode } from "./protocol.ts";

export interface WireNaplps {
  readonly type: "naplps";
  readonly connections: WireConnections;
  readonly page: WirePageNumber;
  readonly sub: WireSubCode;
  readonly restart?: boolean;
  /** The bytes, exact base64. */
  readonly data: string;
}

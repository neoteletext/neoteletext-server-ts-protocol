// The server's figures, sent every 10 seconds (DOC-1968), typed as protocol
// 11's schema types them ($defs ServerFigures, ServerTotals, ChannelCounts,
// ChannelTotals and PageOpens): every figure named and a whole number, the
// server's memory null where its system does not say.

import type { WirePageNumber } from "./protocol.ts";

/** The server's figures accumulated across restarts. */
export interface ServerTotals {
  readonly connections_total: number;
  readonly connections_peak: number;
  readonly messages_sent: number;
  readonly bytes_sent: number;
  readonly requests: number;
  readonly restarts: number;
}

/** The server's figures since it started. */
export interface ServerFigures {
  readonly uptime_s: number;
  readonly connections: number;
  readonly connections_peak: number;
  readonly connections_total: number;
  readonly messages_sent: number;
  readonly bytes_sent: number;
  readonly requests: number;
  readonly restarts: number;
  readonly channels: number;
  /** Each channel's viewers now, by the channel's folder. */
  readonly viewers: Readonly<Record<string, number>>;
  /** Its resident memory in kilobytes, or none where the system does not say. */
  readonly memory_kb?: number | null;
  readonly all_time: ServerTotals;
}

/** A page and how often it was opened. */
export interface PageOpens {
  readonly page: WirePageNumber;
  readonly opens: number;
}

/** A channel's figures accumulated across restarts. */
export interface ChannelTotals {
  readonly viewers_total: number;
  readonly viewers_peak: number;
  readonly opens: number;
  readonly inputs: number;
  readonly keys: number;
  readonly pages_sent: number;
  readonly subpages_not_forwarded: number;
  readonly refused: number;
  readonly stale_input: number;
  readonly stale_answers: number;
  readonly redirects: number;
  readonly sound_records: number;
  readonly lines_to_application: number;
  readonly lines_from_application: number;
  readonly lines_dropped: number;
  readonly sessions_resumed: number;
  /** Each page's opens, by its number. */
  readonly pages_opened: Readonly<Record<string, number>>;
}

/** A channel's figures since the server started. */
export interface ChannelCounts {
  readonly viewers: number;
  readonly viewers_peak: number;
  readonly viewers_total: number;
  readonly opens: number;
  readonly inputs: number;
  readonly keys: number;
  readonly pages_sent: number;
  /** Sub-pages the program sent to connections it named that did not show them (REQ-1473). */
  readonly subpages_not_forwarded: number;
  readonly refused: number;
  readonly invalid_packets: number;
  readonly stale_input: number;
  readonly stale_answers: number;
  readonly redirects: number;
  readonly sound_records: number;
  readonly lines_to_application: number;
  readonly lines_from_application: number;
  readonly lines_dropped: number;
  readonly sessions_waiting: number;
  readonly sessions_resumed: number;
  /** The pages opened most, the most opened first, at most ten. */
  readonly most_opened: readonly PageOpens[];
  readonly all_time: ChannelTotals;
}

/** The server's figures, sent every 10 seconds (DOC-1968): its own, and this channel's. */
export interface ServerStats {
  readonly server: ServerFigures;
  readonly channel: ChannelCounts;
}

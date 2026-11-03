// The server's figures for a test to give a channel (Harness.stats): every
// figure the schema names, nought unless the test says otherwise.

import type { ChannelCounts, ChannelTotals, ServerFigures, ServerStats, ServerTotals } from "../wire/stats.ts";

const SERVER_TOTALS: ServerTotals = { connections_total: 0, connections_peak: 0, messages_sent: 0, bytes_sent: 0, requests: 0, restarts: 0 };

const SERVER: ServerFigures = {
  uptime_s: 0,
  connections: 0,
  connections_peak: 0,
  connections_total: 0,
  messages_sent: 0,
  bytes_sent: 0,
  requests: 0,
  restarts: 0,
  channels: 1,
  viewers: {},
  memory_kb: null,
  all_time: SERVER_TOTALS,
};

const CHANNEL_TOTALS: ChannelTotals = {
  viewers_total: 0,
  viewers_peak: 0,
  opens: 0,
  inputs: 0,
  keys: 0,
  pages_sent: 0,
  subpages_not_forwarded: 0,
  refused: 0,
  stale_input: 0,
  stale_answers: 0,
  redirects: 0,
  sound_records: 0,
  lines_to_application: 0,
  lines_from_application: 0,
  lines_dropped: 0,
  sessions_resumed: 0,
  pages_opened: {},
};

const CHANNEL: ChannelCounts = {
  viewers: 0,
  viewers_peak: 0,
  viewers_total: 0,
  opens: 0,
  inputs: 0,
  keys: 0,
  pages_sent: 0,
  subpages_not_forwarded: 0,
  refused: 0,
  invalid_packets: 0,
  stale_input: 0,
  stale_answers: 0,
  redirects: 0,
  sound_records: 0,
  lines_to_application: 0,
  lines_from_application: 0,
  lines_dropped: 0,
  sessions_waiting: 0,
  sessions_resumed: 0,
  most_opened: [],
  all_time: CHANNEL_TOTALS,
};

/** The server's figures with `server` and `channel` given, every other figure nought. */
export function serverStats(given: { readonly server?: Partial<ServerFigures>; readonly channel?: Partial<ChannelCounts> } = {}): ServerStats {
  return { server: { ...SERVER, ...given.server }, channel: { ...CHANNEL, ...given.channel } };
}

// A channel run as this process: the server's lines in, the program's out.

import type { Application } from "./application.ts";
import { Channel } from "./channel.ts";
import type { Clock } from "./channel-options.ts";
import { App } from "../wire/app.ts";
import type { ServerEvents } from "../wire/server-events.ts";
import { serveSocket, socketPath } from "../wire/socket.ts";
import { type Streams, processStreams, serveLines } from "../wire/streams.ts";

export interface RunOptions {
  /** The games' seed; by default the time, since nothing here is a secret. */
  readonly seed?: bigint;
  /** Where the program reads and writes; by default the Unix domain socket `NEOTELETEXT_SOCKET` names, or else the process's standard streams. */
  readonly streams?: Streams;
}

/** Wakes the channel's applications when they asked: one timer, set again after every message, since any may ask for a wake. */
function wakeTimer(channel: Channel, clock: Clock): { readonly schedule: () => void; readonly stop: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const schedule = (): void => {
    clearTimeout(timer);
    const at = channel.nextWake();
    timer =
      at === null
        ? undefined
        : setTimeout(
            () => {
              channel.deadline();
              schedule();
            },
            Math.max(0, at - clock.now()),
          );
  };
  return {
    schedule,
    stop: (): void => {
      clearTimeout(timer);
    },
  };
}

/** The server's messages to `channel`, the wake timer set again after each. */
function channelEvents(channel: Channel, schedule: () => void): ServerEvents {
  return {
    start(epochMs, limits, languages): void {
      channel.start(epochMs, limits, languages);
      schedule();
    },
    connected(connection, session, request, selection, cookies, path, query): void {
      channel.connected(connection, session, request, selection, cookies, path, query);
      schedule();
    },
    selected(connection, request, selection, path, query): void {
      channel.selected(connection, request, selection, path, query);
      schedule();
    },
    input(connection, page, sub, input): void {
      channel.input(connection, page, sub, input);
      schedule();
    },
    left(connection, page): void {
      channel.left(connection, page);
      schedule();
    },
    closed(session): void {
      channel.closed(session);
      schedule();
    },
    stats(stats): void {
      channel.stats(stats);
      schedule();
    },
    refused(refusal): void {
      channel.refused(refusal);
      schedule();
    },
    measured(request, measured): void {
      channel.measured(request, measured);
      schedule();
    },
    describe(page): void {
      channel.describe(page);
      schedule();
    },
  };
}

/**
 * Runs `applications` as this process's channel: serves the server's lines, wakes each application when it asked, and
 * resolves when the server closes standard input. When the environment's `NEOTELETEXT_SOCKET` names a Unix domain socket
 * and no `streams` are given, the program connects to the server there in place of its standard input and output, and
 * connects again whenever the server goes, so it never resolves (the server's REQ-1043).
 */
export async function runChannel(applications: readonly Application[], options: RunOptions = {}): Promise<void> {
  const socket = options.streams === undefined ? socketPath(process.env) : null;
  const streams = options.streams ?? processStreams();
  // Over a socket the line goes to the connection open now, if one is.
  let socketOutput: ((line: string) => void) | null = null;
  const output =
    socket === null
      ? streams.output
      : (line: string): void => {
          socketOutput?.(line);
        };
  const app = new App(output);
  const started = performance.now();
  const clock: Clock = { now: (): number => Math.floor(performance.now() - started) };
  const channel = new Channel(applications, app, { clock, seed: options.seed ?? process.hrtime.bigint(), errors: streams.errors });
  const timer = wakeTimer(channel, clock);
  const events = channelEvents(channel, timer.schedule);
  try {
    if (socket === null) {
      await serveLines(events, streams);
    } else {
      await serveSocket(
        events,
        socket,
        (write) => {
          socketOutput = write;
        },
        streams.errors,
      );
    }
  } finally {
    timer.stop();
  }
}

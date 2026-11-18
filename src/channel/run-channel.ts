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

/** `run`, then the wake timer set again, since any event may ask for a wake. */
type Then = <Given extends unknown[]>(run: (...given: Given) => void) => (...given: Given) => void;

/** The server's messages about one connection to `channel`. */
function connectionEvents(
  channel: Channel,
  then: Then,
): Pick<ServerEvents, "connected" | "selected" | "input" | "left" | "gone" | "viewerBegan" | "viewerLeft" | "stateRefused"> {
  return {
    connected: then((...given: Parameters<ServerEvents["connected"]>) => {
      channel.connected(...given);
    }),
    selected: then((...given: Parameters<ServerEvents["selected"]>) => {
      channel.selected(...given);
    }),
    input: then((...given: Parameters<ServerEvents["input"]>) => {
      channel.input(...given);
    }),
    left: then((...given: Parameters<ServerEvents["left"]>) => {
      channel.left(...given);
    }),
    gone: then((...given: Parameters<ServerEvents["gone"]>) => {
      channel.gone(...given);
    }),
    viewerBegan: then((...given: Parameters<ServerEvents["viewerBegan"]>) => {
      channel.viewerBegan(...given);
    }),
    viewerLeft: then((...given: Parameters<ServerEvents["viewerLeft"]>) => {
      channel.viewerLeft(...given);
    }),
    stateRefused: then((...given: Parameters<ServerEvents["stateRefused"]>) => {
      channel.stateRefused(...given);
    }),
  };
}

/** The server's messages to `channel`, the wake timer set again after each. */
function channelEvents(channel: Channel, schedule: () => void): ServerEvents {
  const then: Then =
    (run) =>
    (...given): void => {
      run(...given);
      schedule();
    };
  return {
    ...connectionEvents(channel, then),
    start: then((...given: Parameters<ServerEvents["start"]>) => {
      channel.start(...given);
    }),
    viewersReset: then(() => {
      channel.viewersReset();
    }),
    stats: then((...given: Parameters<ServerEvents["stats"]>) => {
      channel.stats(...given);
    }),
    refused: then((...given: Parameters<ServerEvents["refused"]>) => {
      channel.refused(...given);
    }),
    measured: then((...given: Parameters<ServerEvents["measured"]>) => {
      channel.measured(...given);
    }),
    describe: then((...given: Parameters<ServerEvents["describe"]>) => {
      channel.describe(...given);
    }),
    soundBuilt: then((...given: Parameters<ServerEvents["soundBuilt"]>) => {
      channel.soundBuilt(...given);
    }),
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

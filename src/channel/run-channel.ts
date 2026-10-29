// A channel run as this process: the server's lines in, the program's out.

import type { Application } from "./application.ts";
import { Channel, type Clock } from "./channel.ts";
import { App } from "../wire/app.ts";
import type { ServerEvents } from "../wire/server-events.ts";
import { type Streams, processStreams, serveLines } from "../wire/streams.ts";

export interface RunOptions {
  /** The games' seed; by default the time, since nothing here is a secret. */
  readonly seed?: bigint;
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
    start(epochMs, limits): void {
      channel.start(epochMs, limits);
      schedule();
    },
    join(session): void {
      channel.join(session);
      schedule();
    },
    open(session, page): void {
      channel.open(session, page);
      schedule();
    },
    leave(session, page): void {
      channel.leave(session, page);
      schedule();
    },
    input(session, page, input): void {
      channel.input(session, page, input);
      schedule();
    },
    close(session): void {
      channel.close(session);
      schedule();
    },
    stats(stats): void {
      channel.stats(stats);
      schedule();
    },
  };
}

/**
 * Runs `applications` as this process's channel: declares their pages,
 * serves the server's lines, wakes each application when it asked, and
 * resolves when the server closes standard input.
 */
export async function runChannel(applications: readonly Application[], options: RunOptions = {}): Promise<void> {
  const streams = options.streams ?? processStreams();
  const app = new App(streams.output);
  const started = performance.now();
  const clock: Clock = { now: (): number => Math.floor(performance.now() - started) };
  const channel = new Channel(applications, app, { clock, seed: options.seed ?? process.hrtime.bigint(), errors: streams.errors });
  app.declare(channel.declarations());
  const timer = wakeTimer(channel, clock);
  await serveLines(channelEvents(channel, timer.schedule), streams);
  timer.stop();
}

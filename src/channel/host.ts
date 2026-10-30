// What a context reaches of its channel (context.ts's Host), made from the
// channel's parts: publishing into the copies it keeps, and the messages it
// sends to the connections an application names.

// oxlint-disable import/max-dependencies -- the host is where a context meets every part of the channel: its copies, connections, sending, sounds and the TTI and numbering of what it publishes
import { fitText } from "./channel-index.ts";
import type { Connections } from "./connections.ts";
import type { CookieOptions, Host } from "./context.ts";
import type { Copies, GivenSubPage, Owner } from "./copies.ts";
import { Random } from "./random.ts";
import type { Sender } from "./sender.ts";
import { ANY_SUB, fitBytes } from "./wire-page.ts";
import { numbered } from "../page/numbering.ts";
import { pageText } from "../page/page-numbers.ts";
import type { Subpage } from "../page/subpage.ts";
import { soundFields } from "../sound/sound-fields.ts";
import { readTtiPages } from "../tti/read-tti.ts";
import type { App } from "../wire/app.ts";

/** An operator's log line's event, for what an application logs (the schema's `log.event`). */
const APPLICATION_EVENT = "application";

/** The channel's parts a host is made from. */
export interface HostParts {
  readonly app: App;
  readonly seed: bigint;
  readonly sender: Sender;
  readonly copies: Copies;
  readonly connections: Connections;
  readonly titles: Map<number, string>;
  readonly serves: (page: number) => boolean;
  readonly sessions: ReadonlySet<number>;
  readonly epochAtStart: () => number;
  readonly wakeAt: (index: number, at: number) => void;
  readonly current: () => number | null;
  readonly errors: (text: string) => void;
}

/** The sub-pages given, each with its sub-code: a whole page's numbered by place, a put's its own. */
function given(subpages: readonly Subpage[], whole: boolean, app: App): GivenSubPage[] {
  const subs = whole ? numbered(subpages.length, app.limits()) : [];
  return subpages.map(({ screen, subcode, title }, index) => {
    const sub = whole ? subs[index] : subcode;
    if (sub === undefined || !Number.isInteger(sub) || sub < 0 || sub >= ANY_SUB || (sub & ~ANY_SUB) !== 0) {
      throw new RangeError(`put: each sub-page is named by a sub-code, 0000 to 3F7E, not ${String(sub)}`);
    }
    return { sub, content: screen.content(), title: title ?? null };
  });
}

type PublishingHost = Pick<Host, "publish" | "publishTti" | "remove" | "release" | "titleOf" | "title">;

/** Publishing: into the owner's copy, and what changed sent to the connections showing it. */
function publishing(parts: HostParts): PublishingHost {
  const { app, copies, sender, titles } = parts;
  const put = (owner: Owner, page: number, subpages: readonly GivenSubPage[], whole: boolean): void => {
    if (!parts.serves(page)) {
      throw new RangeError(`publish: no application serves ${pageText(page)}`);
    }
    if (owner === "channel" || parts.sessions.has(owner)) {
      sender.distribute(owner, page, copies.put(owner, page, subpages, whole));
    }
  };
  return {
    publish: (owner, page, subpages, whole): void => {
      put(owner, page, given(subpages, whole, app), whole);
    },
    publishTti: (owner, page, text): void => {
      const read = readTtiPages(text);
      const subs = numbered(read.length, app.limits());
      put(
        owner,
        page,
        read.map(({ content }, index) => ({ sub: subs[index] ?? 0, content, title: null })),
        true,
      );
    },
    remove: (owner, page, subcodes): void => {
      sender.distribute(owner, page, copies.remove(owner, page, subcodes));
    },
    release: (session, page): void => {
      if (copies.release(session, page)) {
        sender.released(session, page);
      }
    },
    titleOf: (page): string | undefined => titles.get(page),
    title: (page, title): void => {
      if (!parts.serves(page)) {
        throw new RangeError(`title: no application serves ${pageText(page)}`);
      }
      if (titles.get(page) !== title) {
        titles.set(page, title);
        sender.index();
      }
    },
  };
}

type MessagingHost = Pick<Host, "goto" | "sound" | "authorLog" | "log" | "cookie" | "packets">;

/** The messages an application sends to the connections it names. */
function messaging(parts: HostParts): MessagingHost {
  const { app, connections, sender } = parts;
  return {
    goto: (session, page, sub): void => {
      const current = parts.current();
      const named = current !== null && connections.get(current)?.session === session ? [current] : connections.ofSession(session);
      for (const connection of named) {
        sender.goto(connection, page, sub ?? ANY_SUB);
      }
    },
    sound: (to, member): void => {
      const fields = soundFields(member);
      sender.toAudience(to, (named) => ({ type: "sound", connections: named, ...fields }));
    },
    authorLog: (to, level, text, page): void => {
      // As fitText makes a title: the server refuses a control, a bidirectional formatting character, and text not in NFC.
      const fitted = fitBytes(text.replaceAll(/[\p{Cc}\p{Cf}]/gu, " ").normalize("NFC"), app.limits().budgets.authorLogBytes).normalize("NFC");
      if (fitted !== "") {
        sender.toAudience(to, (named) => ({ type: "author_log", connections: named, level, text: fitted, page: page === null ? null : pageText(page) }));
      }
    },
    log: (text): void => {
      if (!app.hasStarted()) {
        parts.errors(text);
        return;
      }
      const fitted = fitText(text, app.limits().budgets.logCharacters);
      if (fitted.trim() !== "") {
        sender.send({ type: "log", level: "info", event: APPLICATION_EVENT, text: fitted });
      }
    },
    cookie: (connection, name, value, options: CookieOptions): void => {
      sender.send({
        type: "cookie",
        connection,
        name,
        value,
        path: options.path ?? null,
        max_age: options.maxAge ?? null,
        same_site: options.sameSite ?? null,
        secure: options.secure ?? false,
        http_only: options.httpOnly ?? false,
      });
    },
    packets: (to, packets): void => {
      const text = Buffer.from(packets.buffer, packets.byteOffset, packets.byteLength).toString("base64");
      sender.toAudience(to, (named) => ({ type: "packets", connections: named, packets: text }));
    },
  };
}

/** The host of every context of the channel. */
export function makeHost(parts: HostParts): Host {
  return {
    app: parts.app,
    random: new Random(parts.seed),
    epochAtStart: parts.epochAtStart,
    wakeAt: parts.wakeAt,
    ...publishing(parts),
    ...messaging(parts),
    connection: parts.current,
    connectionsOf: (session): number[] => parts.connections.ofSession(session),
  };
}

// What a context reaches of its channel (context.ts's Host), made from the
// channel's parts: publishing into the copies it keeps, and the messages it
// sends to the connections an application names.

// oxlint-disable import/max-dependencies -- the host is where a context meets every part of the channel: its copies, connections, sending, sounds and the TTI and numbering of what it publishes
import { animationCalls } from "./animation-calls.ts";
import { commandCalls } from "./command-calls.ts";
import { fitText } from "./channel-index.ts";
import type { Connections } from "./connections.ts";
import type { Host } from "./context.ts";
import type { Copies, GivenSubPage, Owner } from "./copies.ts";
import type { Measures } from "./measures.ts";
import type { PictureTextMeasures } from "./picture-text-measures.ts";
import type { Queries } from "./queries.ts";
import { Random } from "./random.ts";
import type { Sender } from "./sender.ts";
import { ANY_SUB, fitBytes, subText } from "./wire-page.ts";
import { numbered } from "../page/numbering.ts";
import { pageText } from "../page/page-numbers.ts";
import { type Subpage, contentOf } from "../page/subpage.ts";
import { readTtiPages } from "../tti/read-tti.ts";
import { pictureFields } from "../picture/parts.ts";
import type { Viewer } from "./viewer.ts";
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
  /** The connections applications have been told of, which may own copies. */
  readonly known: ReadonlySet<number>;
  readonly epochAtStart: () => number;
  readonly wakeAt: (index: number, at: number) => void;
  readonly current: () => number | null;
  readonly errors: (text: string) => void;
  readonly measures: Measures;
  readonly pictureTextMeasures: PictureTextMeasures;
  readonly queries: Queries;
}

/** The sub-pages given, each with its sub-code: a whole page's numbered by place, a put's its own. */
function given(subpages: readonly Subpage[], whole: boolean, app: App): GivenSubPage[] {
  const subs = whole ? numbered(subpages.length, app.limits()) : [];
  return subpages.map((subpage, index) => {
    const { subcode, title } = subpage;
    const sub = whole ? subs[index] : subcode;
    if (sub === undefined || !Number.isInteger(sub) || sub < 0 || sub >= ANY_SUB || (sub & ~ANY_SUB) !== 0) {
      throw new RangeError(`put: each sub-page is named by a sub-code, 0000 to 3F7E, not ${String(sub)}`);
    }
    return { sub, content: contentOf(subpage), title: title ?? null };
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
    if (owner === "channel" || parts.known.has(owner)) {
      sender.distribute(owner, page, copies.put(owner, page, subpages, whole));
    }
  };
  return {
    publish: (owner, page, subpages, whole): void => {
      put(owner, page, given(subpages, whole, app), whole);
    },
    publishTti: (owner, page, text, subpageTitles): void => {
      const read = readTtiPages(text);
      if (subpageTitles.length > read.length) {
        throw new RangeError(`publishTti: ${subpageTitles.length} titles for ${read.length} sub-pages`);
      }
      const subs = numbered(read.length, app.limits());
      put(
        owner,
        page,
        read.map(({ content }, index) => ({ sub: subs[index] ?? 0, content, title: subpageTitles[index] ?? null })),
        true,
      );
    },
    remove: (owner, page, subcodes): void => {
      sender.distribute(owner, page, copies.remove(owner, page, subcodes));
    },
    release: (connection, page): void => {
      const countBefore = copies.get(connection, page)?.subpages.size ?? 0;
      if (copies.release(connection, page)) {
        sender.released(connection, page, countBefore);
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

type SelectionHost = Pick<Host, "redirect" | "deny">;

type MessagingHost = Pick<Host, "sound" | "authorLog" | "log" | "measure" | "packets">;

/** What an application does with a viewer's selection. */
function selecting(parts: HostParts): SelectionHost {
  const { sender } = parts;
  return {
    redirect: (connection, to, sub): void => {
      sender.redirectTo(connection, to, sub ?? ANY_SUB);
    },
    deny: (connection, status): void => {
      sender.deny(connection, status);
    },
  };
}

type ViewerHost = Pick<Host, "viewer" | "remembered" | "requestState" | "endState" | "offerRemember">;

/** A connection's viewer, and what a program asks of the viewer's state (viewer-state.md VS-352). */
function viewing(parts: HostParts): ViewerHost {
  const { connections, sender } = parts;
  return {
    viewer: (connection): Viewer | null => connections.get(connection)?.viewer ?? null,
    remembered: (connection): boolean => connections.get(connection)?.remembered ?? false,
    requestState: (connection): void => {
      sender.send({ type: "request_state", connection });
    },
    endState: (viewer): void => {
      sender.send({ type: "end_state", viewer: viewer.handle });
    },
    offerRemember: (connection): void => {
      sender.send({ type: "offer_remember", connection });
    },
  };
}

type PictureHost = Pick<Host, "regis" | "regisLinks" | "regisCursor" | "naplps" | "naplpsLinks" | "naplpsCursor" | "forgetPicture" | "measurePictureText">;

/** A sub-page's picture (renderer parity PAR-16 to PAR-22): its ReGIS and NAPLPS, given as bytes or parts, its links and its cursor, to the audience named or kept; a kept picture forgotten; and picture text measured. */
function pictures(parts: HostParts): PictureHost {
  const { app, sender } = parts;
  return {
    regis: (to, page, sub, data, restart): void => {
      const fields = pictureFields("regis", data);
      sender.toPictureAudience(to, (named) => ({ type: "regis", connections: named, page: pageText(page), sub: subText(sub), ...fields, restart }));
    },
    naplps: (to, page, sub, data, restart): void => {
      const fields = pictureFields("naplps", data);
      sender.toPictureAudience(to, (named) => ({ type: "naplps", connections: named, page: pageText(page), sub: subText(sub), ...fields, restart }));
    },
    regisLinks: (to, page, sub, links): void => {
      const listed = links.map(({ drawing, target }) => ({ drawing, target }));
      sender.toPictureAudience(to, (named) => ({ type: "regis_links", connections: named, page: pageText(page), sub: subText(sub), links: listed }));
    },
    regisCursor: (to, page, sub, drawing): void => {
      sender.toPictureAudience(to, (named) => ({ type: "regis_cursor", connections: named, page: pageText(page), sub: subText(sub), drawing }));
    },
    naplpsLinks: (to, page, sub, links): void => {
      const listed = links.map(({ object, target }) => ({ object, target }));
      sender.toPictureAudience(to, (named) => ({ type: "naplps_links", connections: named, page: pageText(page), sub: subText(sub), links: listed }));
    },
    naplpsCursor: (to, page, sub, object): void => {
      sender.toPictureAudience(to, (named) => ({ type: "naplps_cursor", connections: named, page: pageText(page), sub: subText(sub), object }));
    },
    forgetPicture: (page, sub): void => {
      sender.send({ type: "forget_picture", page: pageText(page), sub: subText(sub) });
    },
    measurePictureText: (text, options) => parts.pictureTextMeasures.measure(app, text, options),
  };
}

/** The messages an application sends to the connections it names. */
function messaging(parts: HostParts): MessagingHost {
  const { app, sender } = parts;
  return {
    // The member as the program built it, with `type` and `connections` added and nothing else changed (typescript.md TS-19).
    sound: (to, member): void => {
      sender.toAudience(to, (named) => ({ type: "sound", connections: named, ...member }));
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
    measure: (page, screen) => parts.measures.measure(app, page, screen.content()),
    packets: (to, packets): void => {
      sender.toAudience(to, (named) => ({ type: "packets", connections: named, packets }));
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
    ...selecting(parts),
    ...messaging(parts),
    ...viewing(parts),
    ...pictures(parts),
    ...animationCalls(parts.sender),
    ...commandCalls(parts.sender),
    queryState: (connection, page, sub) => parts.queries.query(parts.app, connection, page, sub),
    connection: parts.current,
  };
}

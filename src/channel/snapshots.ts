// Snapshots (tab-thumbnails.md section 7.1; REQ-6901): the server asks the
// program to draw a page for no one in particular, and the kit runs the
// page's own selection for a stranger on a connection of its own. That
// connection is numbered below zero, so it can never be a server's
// connection number (1 and up) nor be keyed by any stored state, and it is
// held here, apart from the connections the server announced
// (connections.ts), so that no fan-out reaches it. What the application
// sends to it is not sent: the picture is gathered for the answer, and
// everything else is dropped. Which kept pictures the program has sent is
// tracked here too, so that an answer can name one.

import type { Connection } from "./connections.ts";
import { subText } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";
// The bound counts data's bytes alone: the server writes text parts, and counts them once it has, as for every picture message (picture-rules.ts).
import { MOST_SNAPSHOT_PICTURE_BYTES } from "../wire/snapshot-rules.ts";
import type { NaplpsObject, PictureLanguageName, PicturePart, ProgramMessage, SnapshotPicture } from "../wire/generated/protocol.js";

/** The most parts a snapshot's picture has: a picture message's (the server's MOST_PICTURE_PARTS, renderer parity PAR-21). */
const MOST_SNAPSHOT_PICTURE_PARTS = 64;
/** A snapshot's selection number, which nothing sent carries: the field is the connection's, and is never written. */
const NO_REQUEST = 0;

/** A picture's bytes gathered from the messages sent to a snapshot connection: each message's data or parts in order. */
interface GatheredPicture {
  readonly language: PictureLanguageName;
  readonly parts: PicturePart[];
  /** Its data's bytes, as the bound counts them. */
  bytes: number;
}

/** One snapshot being drawn: the stranger's connection the application is called for, and what it was sent. */
export interface Snapshot {
  /** The server's number for it. */
  readonly snapshot: number;
  /** The connection's state as every connection has one, held here and never among the server's connections. */
  readonly state: Connection;
  readonly page: number;
  readonly sub: number;
  /** The application denied or redirected it, a handler failed, or a picture passed its bound: it is declined. */
  declined: boolean;
  /** Each sub-page's picture sent to it, by sub-code. */
  readonly pictures: Map<number, GatheredPicture>;
  /** Each sub-page's latest NAPLPS objects sent to it, by sub-code. */
  readonly objects: Map<number, NaplpsObject[]>;
}

/** The connection number of snapshot `snapshot`: its negative (section 7.1 item 1). */
function snapshotConnection(snapshot: number): number {
  return -snapshot;
}

/** `message`'s sub-page, when it is a message of sub-page pictures or objects about `page`. */
function pictureSub(message: ProgramMessage, page: number): number | undefined {
  if (message.type !== "regis" && message.type !== "naplps" && message.type !== "naplps_objects") {
    return undefined;
  }
  return message.page === pageText(page) ? Number.parseInt(message.sub, 16) : undefined;
}

/** `parts` with the bytes that stand together joined into one part, as the kit sends a list (parts.ts). */
function joined(parts: readonly PicturePart[]): PicturePart[] {
  const out: PicturePart[] = [];
  let pending: Uint8Array[] = [];
  const flush = (): void => {
    if (pending.length > 0) {
      out.push({ data: Buffer.concat(pending) });
      pending = [];
    }
  };
  for (const part of parts) {
    if ("data" in part) {
      pending.push(part.data);
    } else {
      flush();
      out.push(part);
    }
  }
  flush();
  return out;
}

/** The objects after a `naplps_objects` message: its list, or with `one` the one object put in place of its number's (ANIM-11). */
function objectsAfter(before: readonly NaplpsObject[], message: Extract<ProgramMessage, { type: "naplps_objects" }>): NaplpsObject[] {
  if (message.one !== true) {
    return [...message.objects];
  }
  const [given] = message.objects;
  return given === undefined ? [...before] : [...before.filter((object) => object.number !== given.number), given];
}

/** The snapshots being drawn, by their connections' numbers, and the kept pictures the program has sent. */
export class Snapshots {
  readonly #open = new Map<number, Snapshot>();
  /** Each kept picture sent and not forgotten, as `PPP/SSSS` (DEC-6599: a page and its sub-code together). */
  readonly #kept = new Set<string>();

  /** A snapshot begins: its connection, with no viewer, not remembered and no query (section 7.1 item 1). */
  begin(snapshot: number, page: number, sub: number): Snapshot {
    const connection = snapshotConnection(snapshot);
    const state: Connection = {
      connection,
      viewer: null,
      remembered: false,
      page,
      sub: null,
      request: NO_REQUEST,
      query: null,
      requested: false,
      pending: true,
      denied: null,
    };
    const begun: Snapshot = { snapshot, state, page, sub, declined: false, pictures: new Map(), objects: new Map() };
    this.#open.set(connection, begun);
    return begun;
  }

  /** The snapshot answered: forgotten. */
  end(connection: number): void {
    this.#open.delete(connection);
  }

  /** Whether `connection` is a snapshot's. */
  has(connection: number): boolean {
    return this.#open.has(connection);
  }

  /** The snapshot connections among `connections`. */
  among(connections: readonly number[]): number[] {
    return connections.filter((connection) => this.#open.has(connection));
  }

  /** The application declined the snapshot on `connection` (a deny or a redirect), or a handler failed while it was drawn. */
  decline(connection: number): void {
    const snapshot = this.#open.get(connection);
    if (snapshot !== undefined) {
      snapshot.declined = true;
    }
  }

  /**
   * A message the application addressed to the snapshot on `connection`, which is never sent (section 7.1 item 5): a
   * picture of its page or NAPLPS objects for one are gathered for the answer, and everything else is dropped.
   */
  heard(connection: number, message: ProgramMessage): void {
    const snapshot = this.#open.get(connection);
    const sub = snapshot === undefined ? undefined : pictureSub(message, snapshot.page);
    if (snapshot === undefined || sub === undefined) {
      return;
    }
    if (message.type === "naplps_objects") {
      snapshot.objects.set(sub, objectsAfter(snapshot.objects.get(sub) ?? [], message));
      return;
    }
    if (message.type !== "regis" && message.type !== "naplps") {
      return;
    }
    const before = snapshot.pictures.get(sub);
    const picture = message.restart === true || before?.language !== message.type ? { language: message.type, parts: [], bytes: 0 } : before;
    const given: readonly PicturePart[] = message.data === undefined || message.data === null ? (message.parts ?? []) : [{ data: message.data }];
    picture.parts.push(...given);
    picture.bytes += given.reduce((sum, part) => sum + ("data" in part ? part.data.length : 0), 0);
    snapshot.pictures.set(sub, picture);
    if (picture.bytes > MOST_SNAPSHOT_PICTURE_BYTES) {
      snapshot.declined = true;
    }
  }

  /**
   * The picture of sub-page `sub` for the answer (section 7.1 item 4): what was sent to the snapshot's connection, with
   * a NAPLPS picture's objects; else the kept picture of that sub-page, by its sub-code; else none. Undefined when what
   * was sent cannot be carried, which declines the snapshot.
   */
  pictureOf(snapshot: Snapshot, sub: number): SnapshotPicture | null | undefined {
    const gathered = snapshot.pictures.get(sub);
    if (gathered === undefined) {
      return this.#kept.has(`${pageText(snapshot.page)}/${subText(sub)}`) ? { kept: subText(sub) } : null;
    }
    const parts = joined(gathered.parts);
    if (parts.length === 0 || parts.length > MOST_SNAPSHOT_PICTURE_PARTS || gathered.bytes > MOST_SNAPSHOT_PICTURE_BYTES) {
      return undefined;
    }
    const [only] = parts;
    const bytes = parts.length === 1 && only !== undefined && "data" in only ? { data: only.data } : { parts };
    const objects = gathered.language === "naplps" ? snapshot.objects.get(sub) : undefined;
    return objects === undefined ? { language: gathered.language, ...bytes } : { language: gathered.language, ...bytes, objects };
  }

  /**
   * What a message the program sends does to the kept pictures (renderer parity PAR-16, PAR-19): a picture sent to
   * the audience `"kept"` is kept; a restart to another audience, or `forget_picture`, ends it.
   */
  sent(message: ProgramMessage): void {
    if (message.type === "forget_picture") {
      this.#kept.delete(`${message.page}/${message.sub}`);
      return;
    }
    if (message.type !== "regis" && message.type !== "naplps") {
      return;
    }
    const key = `${message.page}/${message.sub}`;
    if (message.connections === "kept") {
      this.#kept.add(key);
    } else if (message.restart === true) {
      this.#kept.delete(key);
    }
  }

  /** `start`: the server keeps no picture of before, and no snapshot is being drawn. */
  clear(): void {
    this.#open.clear();
    this.#kept.clear();
  }
}

// What the channel's tests build their applications from: a screen with
// some text and links, and an application that records what it heard.

import { type Application, Colour, type Context, type Input, type PageEntry, Screen } from "../src/index.ts";

/** A page with `text` on row 1 and Fastext links. */
export function screen(text: string, links: readonly [number | null, number | null, number | null, number | null] = [null, null, null, null]): Screen {
  const drawn = new Screen();
  drawn.coloured(1, 0, Colour.White, text);
  drawn.fastext(links);
  return drawn;
}

/** An application that records what it is told. */
export class Recorder implements Application {
  readonly heard: string[] = [];
  readonly #entries: readonly PageEntry[];

  constructor(entries: readonly PageEntry[]) {
    this.#entries = entries;
  }

  pages(): readonly PageEntry[] {
    return this.#entries;
  }

  start(context: Context): void {
    for (const { page, title } of this.#entries) {
      context.publish("channel", page, screen(title, [0x100, 0x101, null, null]));
    }
  }

  joined(session: number): void {
    this.heard.push(`joined ${session}`);
  }

  opened(session: number, page: number): void {
    this.heard.push(`opened ${session} ${page.toString(16)}`);
  }

  leftPage(session: number, page: number): void {
    this.heard.push(`left ${session} ${page.toString(16)}`);
  }

  input(session: number, page: number, input: Input): void {
    this.heard.push(`input ${session} ${page.toString(16)} ${JSON.stringify(input)}`);
  }

  ended(session: number): void {
    this.heard.push(`ended ${session}`);
  }
}

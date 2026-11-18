// The commands of a page's rule table sent as messages of their own
// (page-rules.md RULE-114): each is a program message the server encodes as
// the same record a group holds, for the connections named that have the
// page selected. Each is built as the schema's type gives it; nothing here
// checks a command, which the server does (DEC-6462, RULE-55).

import type { Host } from "./context.ts";
import type { Sender } from "./sender.ts";
import { subText } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";

/** What a context reaches of the commands sent directly. */
export type CommandHost = Pick<Host, "localMidi" | "variable" | "timer" | "report" | "run" | "sequence">;

/** A page's fields as every command message carries them: its number and its sub-code together (RULE-112). */
function at(page: number, sub: number): { readonly page: string; readonly sub: string } {
  return { page: pageText(page), sub: subText(sub) };
}

/** The calls of the commands, writing through `sender`. */
export function commandCalls(sender: Sender): CommandHost {
  return {
    localMidi: (to, page, sub, channel, message): void => {
      sender.toAudience(to, (named) => ({ type: "local_midi", connections: named, ...at(page, sub), channel, message }));
    },
    variable: (to, page, sub, command): void => {
      sender.toAudience(to, (named) => ({ type: "variable", connections: named, ...at(page, sub), ...command }));
    },
    timer: (to, page, sub, op, timer): void => {
      sender.toAudience(to, (named) => ({ type: "timer", connections: named, ...at(page, sub), op, timer }));
    },
    report: (to, page, sub, value): void => {
      sender.toAudience(to, (named) => ({ type: "report", connections: named, ...at(page, sub), value }));
    },
    run: (to, page, sub, group): void => {
      sender.toAudience(to, (named) => ({ type: "run", connections: named, ...at(page, sub), group }));
    },
    sequence: (to, page, sub, op, sequence, start): void => {
      // `at` left out is the next tick (RULE-103), and a stop has none: the field is written only when the program gives it.
      const when = start === undefined ? {} : { at: start };
      sender.toAudience(to, (named) => ({ type: "sequence", connections: named, ...at(page, sub), op, sequence, ...when }));
    },
  };
}

// Every optional handler of Application, by name, each with its arguments
// by meaning as neoteletext-common's kit-calls.tsv lists them (typescript.md
// TS-2): test/kit-calls.test.ts holds the list to that file and, by the type
// check, each handler's count of parameters to it; `satisfies` holds the
// names to Application's optional methods, every one and nothing else.

import type { Application } from "./application.ts";

/** The optional handlers: every method of Application but `pages` and `start`. */
export type OptionalHandler = Exclude<keyof Application, "pages" | "start">;

/** Each optional handler's arguments but its context, by meaning as kit-calls.tsv writes them. */
export const HANDLER_ARGUMENTS = {
  joined: ["connection"],
  request: ["connection", "page", "request"],
  opened: ["connection", "page"],
  leftPage: ["connection", "page"],
  input: ["connection", "page", "input event", "sub-page"],
  ruleEvent: ["event"],
  rulesFault: ["fault"],
  wake: [],
  gone: ["connection"],
  stats: ["stats"],
  describe: ["page"],
  refused: ["refusal"],
  soundBuilt: ["report"],
  viewerBegan: ["connection", "viewer", "remembered"],
  viewerLeft: ["connection"],
  stateRefused: ["connection", "reason"],
  viewersReset: [],
} as const satisfies Readonly<Record<OptionalHandler, readonly string[]>>;

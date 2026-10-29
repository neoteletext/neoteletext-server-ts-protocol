// What teletext-server's `start` tells a program (its docs/applications.md
// section 2), for a test harness that stands in for the server. Only tests
// read these; a program takes its limits from the `start` it is sent.

import type { Limits } from "../wire/limits.ts";

export type { Limits };

/** The figures of teletext-server's `start`, from the engine's `neoteletext_core::limits` and the server's budgets. */
export const SERVER_LIMITS: Limits = {
  standard: { magazines: 8, pages: 2022, keyablePages: 800, subpages: 8190, numberedSubpages: 8069, decimalSubpages: 3199 },
  budgets: { lineBytes: 16 * 1024 * 1024, titleCharacters: 120 },
};

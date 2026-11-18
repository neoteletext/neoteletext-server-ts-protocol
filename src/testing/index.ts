// neoteletext-server-ts-protocol/testing: a channel driven as the server drives
// it, and what it wrote read back, for tests.

export { ManualClock } from "./manual-clock.ts";
export { fakeOpus } from "./fake-opus.ts";
export { Harness } from "./harness.ts";
export { serverStats } from "./server-stats.ts";
export { keptTti } from "./kept-tti.ts";
export { limitFigureLines } from "./limit-figures.ts";
export { SERVER_LANGUAGES, SERVER_LIMITS } from "./server-limits.ts";
export type { HarnessOptions, PageStateAnswer, SoundReport, TimelineSend } from "./harness.ts";
export type { FakeViewer } from "./fake-viewers.ts";
export type { Sent } from "./sent.ts";
export { text, rowOf, shows } from "./rows.ts";

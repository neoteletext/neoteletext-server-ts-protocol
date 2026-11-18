// The kit's whole interface (typescript.md TS-27): what each entry point
// exports at run time. The protocol's types are types only, from
// neoteletext-server-ts-protocol/protocol; for sound the main entry gives the
// Opus encoder and the profile's constants it uses, and nothing of a
// synthesizer.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as kit from "../src/index.ts";
import * as protocol from "../src/protocol.ts";
import * as testing from "../src/testing/index.ts";

/** Every export of the main entry at run time. */
const KIT = [
  "ANY_SUB",
  "ANY_SUBCODE",
  "App",
  "Attribute",
  "Button",
  "COLUMNS",
  "CONTROL_CHARACTER",
  "Channel",
  "Colour",
  "Context",
  "CursorFlag",
  "FASTEXT_ROW",
  "FIRST_CURSOR_ROW",
  "FIRST_PAGE",
  "HEADER_TEXT_COLUMN",
  "Held",
  "Key",
  "LANGUAGE_TAGS",
  "LAST_CURSOR_ROW",
  "LAST_PAGE",
  "LONGEST_LINE",
  "LineSplitter",
  "MOST_OPUS_PACKETS",
  "MOST_RUNS",
  "MOST_SAMPLES",
  "MeasureRefusedError",
  "Mods",
  "NO_CONTROL",
  "NO_LINKS",
  "Navigation",
  "OPUS_BITRATE",
  "OPUS_FRAME_MS",
  "OPUS_FRAME_SAMPLES",
  "OPUS_PACKET_BYTES",
  "OPUS_RATE",
  "OggOpusReader",
  "PACKED_LINKS",
  "PACKED_LINKS_ROW",
  "PROTOCOL",
  "ProtocolError",
  "ProtocolVersionError",
  "ROWS",
  "RUN_CHARACTERS",
  "Random",
  "SAMPLE_RATES",
  "SIXELS_ACROSS",
  "SIXELS_DOWN",
  "SPACE",
  "Screen",
  "Sixels",
  "Viewer",
  "X27_LINKS",
  "blankContent",
  "cellsOf",
  "channelIndex",
  "character",
  "checkProgram",
  "checkServer",
  "clicked",
  "clickedLink",
  "decimalDigit",
  "decimalSubcode",
  "decodeRow",
  "dispatch",
  "encodeRow",
  "ffmpegOpus",
  "fitText",
  "hasRightToLeft",
  "isCharacterKey",
  "isConnection",
  "isPageNumber",
  "isReserved",
  "keyText",
  "mosaicColour",
  "mostNumbered",
  "numberAt",
  "numbered",
  "oggCrc",
  "packedLinksLine",
  "pageText",
  "pcmBytes",
  "pressed",
  "processStreams",
  "promptAt",
  "promptLink",
  "readBack",
  "readInput",
  "readLimits",
  "readMessage",
  "readPackedLinks",
  "readPage",
  "readTti",
  "readTtiPages",
  "released",
  "rowsOf",
  "runChannel",
  "runText",
  "serveLines",
  "textCells",
  "textColour",
  "tti",
  "typed",
];

test("TS-27: the main entry exports exactly the kit's interface, and nothing of a synthesizer", () => {
  assert.deepEqual(Object.keys(kit).toSorted(), KIT.toSorted());
  assert.deepEqual(
    Object.keys(kit).filter((name) => /synth|instrument|slot|midi|Patch|soundFields|pcmBase64/u.test(name)),
    [],
  );
});

test("TS-27: the protocol's sub-path holds types only, and the testing entry the harness and its helpers", () => {
  assert.deepEqual(Object.keys(protocol), []);
  assert.deepEqual(Object.keys(testing).toSorted(), [
    "Harness",
    "ManualClock",
    "SERVER_LANGUAGES",
    "SERVER_LIMITS",
    "fakeOpus",
    "keptTti",
    "rowOf",
    "serverStats",
    "shows",
    "text",
  ]);
});

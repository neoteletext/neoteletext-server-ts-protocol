// neoteletext-server-ts-protocol: the NeoTeletext server's channel protocol for
// programs in TypeScript (DOC-1974).
// This is the package's whole interface; the test harness is apart, in
// neoteletext-server-ts-protocol/testing, and the protocol's types,
// generated from the server's schema, in neoteletext-server-ts-protocol/protocol
// (typescript.md TS-27).

export { PROTOCOL, LONGEST_LINE, readLimits } from "./wire/limits.ts";
export { LANGUAGE_TAGS } from "./wire/language-tags.ts";
export type { Language, LanguageTag } from "./wire/languages.ts";
export { ProtocolError, checkProgram, checkServer } from "./wire/validate.ts";
export type { Fault } from "./wire/fault.ts";
export type { Budgets, Limits, Standard } from "./wire/limits.ts";
export { isConnection, readPage, readMessage } from "./wire/server-message.ts";
export type { Selection, ServerStats } from "./wire/server-message.ts";
export { dispatch } from "./wire/server-events.ts";
export type { ServerEvents } from "./wire/server-events.ts";
export { App } from "./wire/app.ts";
export type { Owner } from "./channel/copies.ts";
export { LineSplitter } from "./wire/line-splitter.ts";
export { ProtocolVersionError, processStreams, serveLines } from "./wire/streams.ts";
export type { Streams } from "./wire/streams.ts";
export { Key, isCharacterKey, pressed, released } from "./input/keys.ts";
export type { KeyAction, HoverAction } from "./input/keys.ts";
export { Button, Held, Mods, clicked } from "./input/input.ts";
export type { Input, InputSource, Pointed } from "./input/input.ts";
export { CONTROL_CHARACTER, keyText, typed, character } from "./input/typed.ts";
export { readInput } from "./input/read-input.ts";
export { decimalDigit } from "./input/decimal-digit.ts";
export { ROWS, COLUMNS, HEADER_TEXT_COLUMN, SPACE } from "./page/geometry.ts";
export { FIRST_PAGE, LAST_PAGE, pageText, isPageNumber, isReserved } from "./page/page-numbers.ts";
export { Colour, textColour, mosaicColour, Attribute } from "./page/colours.ts";
export { CursorFlag, FIRST_CURSOR_ROW, LAST_CURSOR_ROW } from "./page/cursor.ts";
export type { Cursor } from "./page/cursor.ts";
export { NO_LINKS } from "./page/fastext.ts";
export type { FastextLinks } from "./page/fastext.ts";
export { Screen } from "./page/screen.ts";
export { tti } from "./page/subpage.ts";
export { MOST_RUNS, RUN_CHARACTERS } from "./page/text-runs.ts";
export { NO_CONTROL, X27_LINKS, blankContent, decodeRow, encodeRow, readBack, rowsOf } from "./page/content.ts";
export type { ReadPage as ReadSubPage, SubPageContent } from "./page/content.ts";
export { mostNumbered, numbered } from "./page/numbering.ts";
export type { Subpage, SubpageBody } from "./page/subpage.ts";
export { SIXELS_ACROSS, SIXELS_DOWN, Sixels } from "./page/sixels.ts";
export { decimalSubcode } from "./tti/subcode.ts";
export { readTti, readTtiPages } from "./tti/read-tti.ts";
export type { Rows, ReadPage, TtiSubPage } from "./tti/read-tti.ts";
export { PACKED_LINKS, PACKED_LINKS_ROW, ANY_SUBCODE, packedLinksLine, readPackedLinks } from "./tti/packed-links.ts";
export type { PageLink, ReadLinks } from "./tti/packed-links.ts";
export { cellsOf, hasRightToLeft, runText, textCells } from "./text/cells.ts";
export type { PageKeys, Navigated } from "./navigation/page-keys.ts";
export { FASTEXT_ROW, clickedLink, promptLink, promptAt, numberAt } from "./navigation/clicked-link.ts";
export type { PageView } from "./navigation/clicked-link.ts";
export { Navigation } from "./navigation/navigation.ts";
export {
  SAMPLE_RATES,
  MOST_SAMPLES,
  OPUS_RATE,
  OPUS_FRAME_MS,
  OPUS_FRAME_SAMPLES,
  OPUS_BITRATE,
  OPUS_PACKET_BYTES,
  MOST_OPUS_PACKETS,
} from "./sound/profile.ts";
export type { SampleRate } from "./sound/profile.ts";
export type { Audience, PictureAudience } from "./channel/audience.ts";
export type { EncodedOpus, OpusEncoder, OpusStream } from "./sound/opus-encoder.ts";
export { ffmpegOpus } from "./sound/ffmpeg-opus.ts";
export type { FfmpegOptions } from "./sound/ffmpeg-opus.ts";
export { OggOpusReader, oggCrc } from "./sound/ogg-opus.ts";
export { pcmBytes } from "./sound/pcm.ts";
export { channelIndex, fitText } from "./channel/channel-index.ts";
export type { DescribedPicture, PageDescription, PageEntry, Application } from "./channel/application.ts";
export type { PageRequest } from "./channel/request.ts";
export { Random } from "./channel/random.ts";
export { Context } from "./channel/context.ts";
export { MeasureRefusedError } from "./channel/measure-refused.ts";
export { QueryRefusedError } from "./channel/query-refused.ts";
export { PictureTextRefusedError } from "./channel/picture-text-refused.ts";
export type { MeasuredPictureText, PictureTextOptions } from "./channel/picture-text-measures.ts";
// A sub-page's picture as parts (renderer parity PAR-21).
export type { PictureData, PicturePart, PictureText } from "./picture/parts.ts";
export { TextNotWritableError } from "./channel/text-bytes.ts";
export { Timeline } from "./animation/timeline.ts";
export type { TimelineStep } from "./animation/step.ts";
// The limits of a page's rule table by the engine's names (page-rules.md RULE-57, REQ-6608), TICKS_PER_SECOND among them.
export * from "./rules/limits.ts";
export { characterKey, fired, level, namedKey, noteOff, noteOn, phase, physicalKey, plus, row, variable } from "./rules/builders.ts";
export { Modes, modes } from "./rules/modes.ts";
export type { PageState } from "./rules/page-state.ts";
export type { DrawingLink, NaplpsObjectSet, ObjectLink, ObjectPage, VariableCommand } from "./channel/context.ts";
export type { DeniedStatus } from "./channel/connections.ts";
export { Viewer } from "./channel/viewer.ts";
export { ANY_SUB, Channel } from "./channel/channel.ts";
export type { Clock, ChannelOptions } from "./channel/channel-options.ts";
export { runChannel } from "./channel/run-channel.ts";
export type { RunOptions } from "./channel/run-channel.ts";

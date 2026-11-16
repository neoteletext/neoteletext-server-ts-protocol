// neoteletext-server-ts-protocol: the NeoTeletext server's channel protocol for
// programs in TypeScript (DOC-1974).
// This is the package's whole interface; the test harness is apart, in
// neoteletext-server-ts-protocol/testing.

export { PROTOCOL, LONGEST_LINE, readLimits } from "./wire/limits.ts";
export type * from "./wire/protocol.ts";
export type * from "./wire/server-wire.ts";
export { LANGUAGE_TAGS } from "./wire/language-tags.ts";
export type { Language, LanguageTag } from "./wire/languages.ts";
export { ProtocolError, checkProgram, checkServer } from "./wire/validate.ts";
export type { Fault } from "./wire/fault.ts";
export type { Budgets, Limits, Standard } from "./wire/limits.ts";
export type { ChannelCounts, ChannelTotals, PageOpens, ServerFigures, ServerStats, ServerTotals } from "./wire/stats.ts";
export { isConnection, isSession, readPage, readMessage } from "./wire/server-message.ts";
export type { CookiePair, Measured, Refusal, RunCost, Selection, ServerMessage } from "./wire/server-message.ts";
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
export type { Input, Pointed } from "./input/input.ts";
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
  AUDIO_CHANNELS,
  LAST_HANDLE,
  LAST_GENERATION,
  FULL_GAIN,
  LONGEST_FADE_MS,
  DEEPEST_DUCK,
  MOST_SAMPLES,
  OPUS_RATE,
  OPUS_FRAME_MS,
  OPUS_FRAME_SAMPLES,
  OPUS_BITRATE,
  OPUS_PACKET_BYTES,
  MOST_OPUS_PACKETS,
} from "./sound/profile.ts";
export type { SampleRate } from "./sound/profile.ts";
export type {
  Audience,
  SoundObject,
  LiveSound,
  LiveBlocks,
  OpusSound,
  OpusLive,
  OpusPackets,
  Play,
  Stop,
  Gain,
  SampledMember,
  SoundMember,
} from "./sound/members.ts";
export {
  INSTRUMENT_RATE,
  INSTRUMENT_BLOCK_MS,
  MOST_INSTRUMENT_BLOCKS,
  MOST_LIVE_INSTRUMENT_BLOCKS,
  SID_IMAGE_BYTES,
  SID_IMAGES_PER_BLOCK,
  DX7_SLOT_BYTES,
  DX7_MOST_SLOTS,
  DX7_PATCH_BYTES,
  DX7_MOST_PATCHES,
} from "./sound/instrument-profile.ts";
export type { ImagesPerBlock } from "./sound/instrument-profile.ts";
export type { SidChip, SidClock, SidSound, SidLive, SidBlocks, Dx7Sound, Dx7Live, Dx7Blocks, Dx7Bank, InstrumentMember } from "./sound/instrument-members.ts";
export { SID_PAL_CLOCK_HZ, SID_NTSC_CLOCK_HZ, sidClockHz, sidFrequency } from "./sound/sid-clock.ts";
export { SidImage } from "./sound/sid-image.ts";
export type { SidControl, SidEnvelope, SidFilterMode, SidVoice } from "./sound/sid-image.ts";
export { SidTrack } from "./sound/sid-track.ts";
export type { SidSoundOptions } from "./sound/sid-track.ts";
export { SID_HARD_RESTART_FRAMES, SID_HARD_RESTART_MS, sidGate, sidHardRestart, sidNote } from "./sound/sid-note.ts";
export type { SidNote } from "./sound/sid-note.ts";
export { Controller, DX7_PARTS, Midi, dx7SlotFault } from "./sound/dx7-slot.ts";
export type { Dx7Slot } from "./sound/dx7-slot.ts";
export { Dx7Score } from "./sound/dx7-score.ts";
export type { Dx7Event, Dx7ScoreBlocks } from "./sound/dx7-score.ts";
export { DX7_SYSEX_BYTES, dx7BankFromSysex, dx7Patches } from "./sound/dx7-sysex.ts";
export { dx7InitVoice, packDx7Patch } from "./sound/dx7-patch.ts";
export type { Dx7Four, Dx7Operator, Dx7Patch } from "./sound/dx7-patch.ts";
export { DX7_PROGRAM_REPEAT_BLOCKS, Dx7ProgramRepeater } from "./sound/dx7-live.ts";
export { MOST_MIDI_EVENTS, MOST_MIDI_FILE_BYTES, readMidiFile } from "./sound/midi-file.ts";
export type { MidiDropped, MidiFileScore } from "./sound/midi-file.ts";
export type { EncodedOpus, OpusEncoder, OpusStream } from "./sound/opus-encoder.ts";
export { ffmpegOpus } from "./sound/ffmpeg-opus.ts";
export type { FfmpegOptions } from "./sound/ffmpeg-opus.ts";
export { OggOpusReader, oggCrc } from "./sound/ogg-opus.ts";
export { pcmBase64, soundFields } from "./sound/sound-fields.ts";
export { channelIndex, fitText } from "./channel/channel-index.ts";
export type { PageDescription, PageEntry, Application } from "./channel/application.ts";
export type { PageRequest } from "./channel/request.ts";
export { Random } from "./channel/random.ts";
export { Context } from "./channel/context.ts";
export { MeasureRefusedError } from "./channel/measure-refused.ts";
export type { CookieOptions, DrawingLink } from "./channel/context.ts";
export { ANY_SUB, Channel } from "./channel/channel.ts";
export type { Clock, ChannelOptions } from "./channel/channel-options.ts";
export { runChannel } from "./channel/run-channel.ts";
export type { RunOptions } from "./channel/run-channel.ts";

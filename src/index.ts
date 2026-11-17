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
  SYNTH6581_IMAGE_BYTES,
  SYNTH6581_IMAGES_PER_BLOCK,
  SLOT_BYTES,
  MOST_SLOTS,
  SYNTH7_PATCH_BYTES,
  MOST_PATCHES,
  REGISTER_SYNTHS,
  SYNTHS,
  SYNTH_FAMILY,
  SYNTH_PATCH_BYTES,
} from "./sound/instrument-profile.ts";
export type { ImagesPerBlock, RegisterSynth, Synth, SynthFamily } from "./sound/instrument-profile.ts";
export type {
  Synth6581Clock,
  Synth6581Sound,
  Synth6581Live,
  Synth6581Blocks,
  SynthSound,
  SynthLive,
  SynthBlocks,
  SynthBank,
  Synth8KeyMode,
  Synth8Live,
  Synth8Sound,
  RegisterMember,
  SynthMember,
  InstrumentMember,
} from "./sound/instrument-members.ts";
export { SYNTH6581_PAL_CLOCK_HZ, SYNTH6581_NTSC_CLOCK_HZ, synth6581ClockHz, synth6581Frequency } from "./sound/synth6581-clock.ts";
export { Synth6581Image } from "./sound/synth6581-image.ts";
export type { Synth6581Control, Synth6581Envelope, Synth6581FilterMode, Synth6581Voice } from "./sound/synth6581-image.ts";
export { Synth6581Track } from "./sound/synth6581-track.ts";
export type { Synth6581SoundOptions } from "./sound/synth6581-track.ts";
export { SYNTH6581_HARD_RESTART_FRAMES, SYNTH6581_HARD_RESTART_MS, synth6581Gate, synth6581HardRestart, synth6581Note } from "./sound/synth6581-note.ts";
export type { Synth6581Note } from "./sound/synth6581-note.ts";
export {
  Controller,
  MIDI_PARTS,
  SYNTH8_PROGRAM_PARTS,
  Synth106Controller,
  Synth8Controller,
  Midi,
  synth7SlotFault,
  instrumentSlotFault,
} from "./sound/synth7-slot.ts";
export type { Slot } from "./sound/synth7-slot.ts";
export { Synth7Score } from "./sound/synth7-score.ts";
export type { SlotEvent, SlotScoreBlocks } from "./sound/synth7-score.ts";
export { SYNTH7_SYSEX_BYTES, synth7BankFromSysex, synth7Patches } from "./sound/synth7-sysex.ts";
export { synth7InitVoice, packSynth7Patch } from "./sound/synth7-patch.ts";
export type { Synth7Four, Synth7Operator, Synth7Patch } from "./sound/synth7-patch.ts";
export { PROGRAM_REPEAT_BLOCKS, Synth7ProgramRepeater } from "./sound/synth7-live.ts";
export { SynthProgramRepeater } from "./sound/synth-live.ts";
export { SynthScore } from "./sound/synth-score.ts";
export { synthPatchFault } from "./sound/synth-patch-rules.ts";
export { synth106InitPatch, synth60InitPatch, packSynth106Patch, packSynth60Patch } from "./sound/synth106-patch.ts";
export type { Synth106Patch, Synth106Range, Synth106Slider, Synth60Patch } from "./sound/synth106-patch.ts";
export { synthdInitPatch, packSynthdPatch } from "./sound/synthd-patch.ts";
export type { SynthDContour, SynthDOscillator, SynthDPatch, SynthDRange, SynthDTunedOscillator, SynthDWaveform } from "./sound/synthd-patch.ts";
export {
  packSynth51Patch,
  packSynth52Patch,
  packSynth53Patch,
  synth51InitPatch,
  synth52InitPatch,
  synth53Dial,
  synth53InitPatch,
} from "./sound/synth53-patch.ts";
export type { Synth51Patch, Synth52Patch, Synth53Knob, Synth53Patch, Synth53Switch } from "./sound/synth53-patch.ts";
export { synth8InitPatch, packSynth8Patch } from "./sound/synth8-patch.ts";
export type { Synth8Patch } from "./sound/synth8-patch.ts";
export { synth80InitPatch, synth80InitTone, packSynth80Patch } from "./sound/synth80-patch.ts";
export type { Synth80Feet, Synth80GlobalLever, Synth80Lever, Synth80Patch, Synth80SubFunction, Synth80Tone } from "./sound/synth80-patch.ts";
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

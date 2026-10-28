// neoteletext-server-ts-protocol: the NeoTeletext server's channel protocol for
// programs in TypeScript (teletext-server's docs/applications.md section
// 5). This is the package's whole interface; the test harness is apart, in
// neoteletext-server-ts-protocol/testing.

export { PROTOCOL, LONGEST_LINE, MOST_PAGES, LONGEST_TITLE, MOST_SUBPAGES } from "./wire/limits.ts";
export { figure, figuresIn } from "./wire/stats.ts";
export type { Figures, ServerStats } from "./wire/stats.ts";
export { isSession, readPage, readMessage } from "./wire/server-message.ts";
export type { ServerMessage } from "./wire/server-message.ts";
export { dispatch } from "./wire/server-events.ts";
export type { ServerEvents } from "./wire/server-events.ts";
export { App } from "./wire/app.ts";
export type { Owner, PageDeclaration } from "./wire/app.ts";
export { LineSplitter } from "./wire/line-splitter.ts";
export { processStreams, serveLines } from "./wire/streams.ts";
export type { Streams } from "./wire/streams.ts";
export { Key, isCharacterKey, pressed, released } from "./input/keys.ts";
export type { KeyAction, HoverAction } from "./input/keys.ts";
export { Button, Held, clicked } from "./input/input.ts";
export type { Input } from "./input/input.ts";
export { CONTROL_CHARACTER, keyText, typed, character } from "./input/typed.ts";
export { readInput } from "./input/read-input.ts";
export { decimalDigit } from "./input/decimal-digit.ts";
export { ROWS, COLUMNS, HEADER_TEXT_COLUMN, SPACE } from "./page/geometry.ts";
export { FIRST_PAGE, LAST_PAGE, pageText, isPageNumber } from "./page/page-numbers.ts";
export { Colour, textColour, mosaicColour, Attribute } from "./page/colours.ts";
export { CursorFlag } from "./page/cursor.ts";
export type { Cursor } from "./page/cursor.ts";
export { NO_LINKS } from "./page/fastext.ts";
export type { FastextLinks } from "./page/fastext.ts";
export { Screen } from "./page/screen.ts";
export { tti } from "./page/subpage.ts";
export type { Subpage } from "./page/subpage.ts";
export { SIXELS_ACROSS, SIXELS_DOWN, Sixels } from "./page/sixels.ts";
export { decimalSubcode } from "./tti/subcode.ts";
export { readTti } from "./tti/read-tti.ts";
export type { Rows, ReadPage } from "./tti/read-tti.ts";
export { PACKED_LINKS, PACKED_LINKS_ROW, ANY_SUBCODE, packedLinksLine, readPackedLinks } from "./tti/packed-links.ts";
export type { PageLink, ReadLinks } from "./tti/packed-links.ts";
export { SPACE_CODE, UNSHOWN, foldCharacter, englishCodes } from "./text/english.ts";
export { ENGLISH } from "./text/signs.ts";
export type { PageKeys, Navigated } from "./navigation/page-keys.ts";
export { FASTEXT_ROW, clickedLink, promptLink, promptAt, numberAt } from "./navigation/clicked-link.ts";
export type { PageView } from "./navigation/clicked-link.ts";
export { Navigation } from "./navigation/navigation.ts";
export { SAMPLE_RATES, AUDIO_CHANNELS, LAST_HANDLE, LAST_GENERATION, FULL_GAIN, LONGEST_FADE_MS, DEEPEST_DUCK, MOST_SAMPLES } from "./sound/profile.ts";
export type { SampleRate } from "./sound/profile.ts";
export type { Audience, SoundObject, LiveSound, LiveBlocks, Play, Stop, Gain, SoundMember } from "./sound/members.ts";
export { pcmBase64, soundFields } from "./sound/sound-fields.ts";
export type { PageEntry, Application } from "./channel/application.ts";
export { Random } from "./channel/random.ts";
export { Context } from "./channel/context.ts";
export { Channel } from "./channel/channel.ts";
export type { Clock, ChannelOptions } from "./channel/channel.ts";
export { runChannel } from "./channel/run-channel.ts";
export type { RunOptions } from "./channel/run-channel.ts";

# neoteletext-server-ts-protocol

The NeoTeletext server's channel protocol for programs in TypeScript: the
reference kit of DOC-1974. A
channel is a program the server starts; they talk in lines of JSON on its
standard input and output. This package speaks protocol version 13
(DEC-1482, DEC-6471): every message in both directions is typed by types
generated from the server's published JSON Schema (`schema/protocol-13.json`,
the server's `protocol/schema-13.json`) and checked against it by
validators Ajv 8 compiles from it at build, in standalone mode, so nothing
compiles a schema at run time. A page, an index and a log line are then
held to the server's rules of text the schema cannot state: no control or
bidirectional formatting character, Unicode normalisation form C, and an
author's log line bounded in bytes; a sound is held to the schema alone,
every other rule of it being the server's (typescript.md TS-17). A message the
program would write that the server would refuse is never written: the
call throws a `ProtocolError` naming the path and the rule. The titles,
names and log lines the kit fits itself are fitted in NFC. A line from
the server that is not valid is reported and never acted on.

## Install

The package is released as a built tarball, not to a registry. Commit the
release under your `vendor/` and depend on it:

    npm install --save-exact ./vendor/neoteletext-server-ts-protocol-<version>.tgz

It needs Node 22.18 or later.

## A channel

```ts
import { type Application, Colour, runChannel, Screen } from "neoteletext-server-ts-protocol";

const hello: Application = {
  pages: () => [{ page: 0x100, title: "Hello" }],
  start(context) {
    const screen = new Screen();
    screen.header("HELLO");
    screen.doubleHeight(2, 0, Colour.Yellow, "Hello, teletext");
    screen.fastext([0x101, null, null, null]);
    context.publish("channel", 0x100, screen);
  },
};

await runChannel([hello]);
```

`runChannel` serves the server's lines and resolves when the server closes
standard input.

**A program that runs as a service of its own** (the server's REQ-1043)
connects to the server over a Unix domain socket, on Linux or macOS, and
so outlives a restart of the server and keeps what it holds in memory.
The channels file names the channel's `socket` in place of its `command`
and `directory`, and the program is started with the socket's path in
the environment variable `NEOTELETEXT_SOCKET` (DEC-2452):

    NEOTELETEXT_SOCKET=/srv/neoteletext/sockets/hello.sock node hello.js

With it set, `runChannel` (given no `streams`) speaks the same lines over
the socket in place of standard input and output, and never resolves:
when the server goes it connects again, at once after a connection that
heard `start`, otherwise after a pause of 1 second doubling up to 30, and
each socket connection starts afresh, since the server sends `start` on it.
Lines written while no connection is open are dropped. Each failed attempt
is written to standard error. In a systemd unit, `Environment=` sets the
variable.

Each application is called with what happened (`start`,
`joined`, `request`, `opened`, `leftPage`, `input`, `wake`, `gone`, `stats`,
`describe`, `refused`, `soundBuilt`, `viewerBegan`, `viewerLeft`,
`stateRefused`, `viewersReset`) and answers through its `Context`: publish a
page for everyone or for one connection, send a connection to a page, end a
selection without a page (`deny`, with 403, 404, 429 or 503), retitle a
page, send a sound, write to the viewer's console (`authorLog`) or the
server's log, ask for a viewer's state, ask to be woken. The calls,
handlers and harness calls are the Python kit's, name for name, as
neoteletext-common's `docs/audio/kit-calls.tsv` lists them (its copy is
`kit-calls.tsv`).

**Connections and viewers** (viewer-state.md VS-401 to VS-409). Every
browser tab is a connection of its own, and an application keeps each
connection's state until its `gone`. There is no server session and no
cookie. A connection may carry a viewer: `context.viewer(connection)` is a
`Viewer` or null, `context.remembered(connection)` whether the viewer chose
to be remembered. A `Viewer` is one object a handle, so `===` compares two
by value, and it prints as `[viewer]`; its `handle` is for a store keyed by
viewer. After the viewer has acted, `requestState(connection)` asks for
state, answered by `viewerBegan` or `stateRefused`; `offerRemember(connection)`
asks the browser to offer "remember me"; `endState(viewer)` ends the
viewer's state, every connection presenting it hearing `viewerLeft`.
`viewersReset` voids every handle. A program may use a handle only to
provide what the viewer asked for on this channel (a poll's one vote,
choices the viewer made, the viewer's language, a sign-in the viewer
started), never for advertising, profiling, analytics beyond aggregate
counts or sharing with anyone; it deletes what it keeps for a handle at
`endState` and at its store's limits, and says on its privacy page what it
keeps (VS-409).

**A selection is a request** (DEC-1730). An address's query always comes
with a selection, never with the connection, and `request` hears it before
the page opens, as `{ method: "GET", path: "302/0002", query: { a: "1" },
queryText: "a=1" }`: `PageRequest`. `query` is what
`URLSearchParams` reads, the last value of a name given twice; `queryText` is
the query as written, for when the repeats matter. It is called again when the query changes, and with
null once a selection without one has left it behind, the viewer leaving
the page included. All of it is untrusted, from the viewer.

**A page is public only when a program says so** (REQ-1728). A web visitor at
a page's address makes the server send `describe`, with the page number and
nothing else. The kit answers with the application's `describe(page)`,
`{ public: true, title, text }` for a page anyone may read, with the channel's
copy of it, and otherwise says it is not public. The server also asks once
when the program starts, for the page viewers arrive at, and the channel is
ready at `/readyz` from the first answer: so a program answers as soon as it
has loaded, and an application needs do nothing for that.

**How the kit answers the server.** One connection is one browser tab,
with one selection (DEC-1527). The kit keeps every page the applications
publish, the channel's copy and each viewer's own, each sub-page by its
sub-code in ascending order, and answers the server for them:

- `connected`: one `reply` with the channel's index (its magazines, each
  page's title, section and sub-page count, never the sub-pages) and the
  one sub-page the connection's selection shows (the initial page, 100 or
  the lowest, when it has none); then the page's `subpages` list when it
  has more than one sub-page.
- `selected`: exactly one `page` message, one sub-page. A selection of
  sub-code 3F7F (the page, no sub-page in particular) is answered with the
  page's **first sub-page in ascending sub-code order** (0000 when it has
  it); any other sub-code with that sub-page alone. A page selection also
  sends the page's `subpages` list. Nothing rotates: a page's sub-pages
  are sent one at a time, each only when it is selected.
- A selection of a page no application has published is answered with
  `denied` 404. An application ends a selection itself with
  `context.deny(connection, status)`, 403, 404, 429 or 503: from `request` or
  `opened` that is the selection's answer in place of the page, and the
  connection stays open.
- A page published again sends each connection whose selection shows it
  the changed sub-page, to the connections named; a changed list sends the
  list again, and a changed count the index.

A page given whole (`publish`, `publishSubpages`, `publishTti`) is
numbered by place by the code of practice (the engine's REQ-317 and
REQ-314 part 1; EN 300 706 Annex A.1), as the engine's `limits::sub_code_of`
numbers them: one sub-page is 0000; 2 to 79 are 0001 to 0079 in order
(0009, then 0010); more take only sub-codes above 0079, the 3,120 decimal
ones first in ascending order (0100 to 3979), then the 4,949 with a
hexadecimal digit in ascending order, 3F7F left out, so a page given whole
has at most 8,069 sub-pages. `put` and `remove` name sub-pages by their
sub-codes, which are kept as given, 0000 beside others included
(DEC-1526), and a `Subpage`'s `title` is its title in the page's list (at
most 40 characters).

## What is in it

- **Pages:** `Screen`, a page drawn as a terminal draws its screen (text
  and colour at a row and column, double height, backgrounds, Fastext and
  index links, a cursor on rows 1 to 23, and the Link Extension's `keyLink`, `numberLink`
  and `textLink`), written as the typed sub-page the protocol carries
  (`Screen.content()`: rows as the bytes of 40 seven-bit codes, the six
  links, the named control bits, the character set, enhancement packets,
  the cursor, the text runs), or as TTI for a file when it holds codes
  only; `Sixels`, mosaic graphics; `Colour` and `Attribute`, the spacing
  attributes of EN 300 706 Table 26; `packed`, an enhancement or other
  packed line the program writes itself.
- **Text, in any language** (DEC-2199, REQ-2214): the program never
  encodes text. `Screen.text(row, column, text, language)` (and
  `coloured`, `centred`, `doubleHeight`) keeps Unicode text with its
  language, a tag of `start.languages`, as a run the server encodes with
  the engine's encoder; `Screen.language(tag)` is the page's own language,
  which sets its character sets, and `Screen.level` its presentation
  level. A run takes a cell for each character it shows once its marks
  join it (`cellsOf`, `textCells`); what is written over a run cuts it,
  and runs that only spaces part, or colours that change nothing (which
  show as spaces, EN 300 706 Table 26), are sent as one, at most 64 a page of 40
  characters each. Past 64, a page leaves to the codes under them the runs
  of only the printable ASCII its own set shows at their own codes, which
  read as those characters in it: English's are known
  (all but the national positions), another language's are what the
  program says with `Screen.ownCodes(characters)` after
  `Screen.language`, none until it does. Rows 1 to 24 carry text; row 0, the header, is the
  program's own codes (`header`), so letters, digits and the signs every
  Latin national option shares. A character the run's language cannot
  show makes the server refuse the page (`text_unshown`).
- **Languages:** `Context.languages()` is `start.languages`: each
  language's `tag`, English `name`, and `direction` (`rtl` for a language
  written right to left, which the server puts in visual order).
- **Measuring** (REQ-2216): `Context.measure(page, screen)` sends the page
  to the server to encode, for no viewer, and resolves to `Measured`: the
  triplets it uses of its `limit` of 208, its designation, and each run's
  cells and triplets; or rejects with `MeasureRefusedError`,
  the server's refusal naming the run. A channel's tests can measure every
  page against a running server.
- **The protocol's version:** the kit speaks protocol 13 (`PROTOCOL`); a
  `start` of any other stops it before it sends anything, naming both
  (`ProtocolVersionError`, REQ-2215 item 3).
- **Input:** `Input`, what a viewer did, with `Mods`, the modifier keys
  a key or the pointer has, and `pressed`, `clicked`, `typed`, `character`
  and `decimalDigit` to read it.
- **Navigation:** pages that do not take digits or the coloured keys
  themselves get page selection by them, and a click a page does not take
  follows the prompt or page number it is on.
- **Sound** (typescript.md TS-19 to TS-28): one call sends every sound of
  every kind the schema gives, each synthesizer's stored sound, live
  sound, events and bank, the sampled sounds and the commands:
  `context.sound(to, member)`. The member is one of the generated member
  types (`SoundSynth7BankMember`, `SoundPlayMember`, any of `SoundMember`,
  from `neoteletext-server-ts-protocol/protocol`); the kit adds `type` and
  `connections`, one line for each chunk of the audience's connections, and
  changes nothing else. `to` is an audience: `{ connection }`, `{ page }`
  (the connections whose selection is on the page now),
  `{ connections: [...] }` or `{ connections: "all" }`. Every field the
  schema marks bytes is a `Uint8Array`, written as exact base64. Send a
  connection a page's `play` once, when it opens the page: a new play
  starts the sound again (integration.md INT-28).

  The kit holds no instrument logic: no patch packer, default patch,
  block builder, MIDI file reader or note helper (TS-1). A patch is given
  as named fields or as the instrument's own bytes, music as timed events
  in microseconds or a Standard MIDI File's bytes, a bank as a list of
  patches or a dump, exactly as neoteletext-common's `docs/audio/server.md`
  (SRV-1 to SRV-48) and its documentation items define each message, field
  and rule; the generated types carry the schema's words for every field.
  `context.sound` throws a `ProtocolError` for what the schema refuses,
  which is a fault of the program, not to be caught and ignored. Every
  other rule is the server's, and a refusal names the sound it concerns:
  **a program that sends sounds has a `refused` handler that does something
  a person will see**, a log line with the path, the rule and the detail at
  least (TS-25). `soundBuilt` hears the server's report of a stored sound,
  with what a Standard MIDI File's reading dropped and the banks lifted
  from it. A sound call returns nothing and waits for nothing (TS-24).
  A program keeps a viewer's sound settings keyed on the connection, or
  on the viewer under VS-409's rule. neoteletext-common's
  `docs/audio/typescript.md` section 4 has worked examples of each family,
  compiled and run here as tests (`test/examples/`).

  Opus is the program's to encode, the server carrying it unchanged
  (teletext-server's decision 21): `ffmpegOpus` encodes a whole sound or a
  stream with ffmpeg's libopus, in the profile's constant-rate 16 kbit/s
  packets of 20 ms, as an `opus` member's `packet_bytes`, `samples` and
  `packets`. `OggOpusReader` reads an Ogg Opus stream, checked and bounded.
  `pcmBytes` gives samples as the `object` and `blocks` members' bytes,
  which the server encodes as IMA ADPCM for microcontroller receivers. The
  testing entry's `fakeOpus` stands in for ffmpeg in tests.
- **TTI, for files:** `readTtiPages` reads TTI into typed sub-pages as
  the engine's reader does (rows, the packed lines OL,26 to OL,29, FL,
  PS, RE, CU and the Link Extension's LN, LK and LT); `readTti` reads it
  back as rows and links; `packedLinksLine`, Fastext links that name a
  sub-page.
- **Limits:** the kit holds no limit of its own: `Context.limits()` is
  what the server's `start` said, the standard's maxima (8,190 sub-pages
  a page, 2,022 pages a channel) and the server's budgets (the longest
  title, log line, the connections one message may name).
- **The wire:** every message's type, generated from the schema under
  its generated name (`ProgramMessagePage`, `ServerMessageRefused`,
  `SoundSynth7Bank`, `Page`, `Rule` and the rest), from
  `neoteletext-server-ts-protocol/protocol`; `checkProgram` and
  `checkServer`, `App` (which sends a message only when it is valid),
  `readMessage`, `dispatch` and `serveLines`, for a program that runs its
  own loop.

Everything is exported from the package's root, its types from
`neoteletext-server-ts-protocol/protocol` and its harness from
`neoteletext-server-ts-protocol/testing`; nothing else may be imported.

## Tests

`neoteletext-server-ts-protocol/testing` drives a channel as the server
does (`join(connection, page)` opens a connection with no viewer,
`open(connection, page, sub?)` selects, `close` ends it), keeps every line
the program wrote in `sent`, and reads back the pages the channel keeps
(`shared`, `own`, `seen`, `sharedPages`). It has fake viewers with fixed
handles (VS-404): `const alice = harness.viewer("alice")`, and
`harness.join(alice, page)` twice is alice in two tabs;
`privateViewer(name)` is a private window, `remember(viewer, true)` a
viewer who chose to be remembered, `forget(viewer)` a reset,
`grantState(connection)` and `refuseState(connection, reason)` the
server's answers to `requestState`, and `restart()` a server restart
(connection numbers start again; handles do not). For sounds,
`sounds(connection)`, `soundsOfKind(connection, kind)` and
`soundsToEveryone()` give back the members the program built, bytes as
`Uint8Array`; `refuse(member, path, rule, detail)` and
`report(member, report)` give the channel the server's refusal or report of
a sound it wrote, held to the schema. The harness refuses and reports
nothing of its own accord: only the server can say that a sound is right.

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, Colour, Screen } from "neoteletext-server-ts-protocol";
import { Harness, shows } from "neoteletext-server-ts-protocol/testing";

const hello: Application = {
  pages: () => [{ page: 0x100, title: "Hello" }],
  start(context) {
    const screen = new Screen();
    screen.doubleHeight(2, 0, Colour.Yellow, "Hello, teletext");
    context.publish("channel", 0x100, screen);
  },
};

test("the page says hello", () => {
  const harness = new Harness([hello]);
  harness.join(1, 0x100);
  assert.ok(shows(harness.shared(0x100), "Hello, teletext"));
});
```

## Development

`BUILD.md` says how the package is checked, built and released.

## Licence

MIT: see `LICENSE`.

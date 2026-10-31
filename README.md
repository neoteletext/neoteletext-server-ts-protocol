# neoteletext-server-ts-protocol

The NeoTeletext server's channel protocol for programs in TypeScript: the
reference kit of teletext-server's `docs/applications.md` section 5. A
channel is a program the server starts; they talk in lines of JSON on its
standard input and output. This package speaks protocol version 3
(DEC-1482): every message in both directions is checked against the
server's published JSON Schema (`schema/protocol-3.json`, the server's
`protocol/schema-3.json`) by validators Ajv 8 compiles from it at build, in
standalone mode, so nothing compiles a schema at run time, and then held
to the server's rules of text the schema cannot state: no control or
bidirectional formatting character, Unicode normalisation form C, and a
cookie's fields and an author's log line bounded in bytes. A message the
program would write that the server would refuse is never written: the
call throws a `ProtocolError` naming the path and the rule. The titles,
names and log lines the kit fits itself are fitted in NFC. A line from
the server that is not valid is reported and never acted on.

## Install

The package is released as a built tarball, not to a registry. Commit the
release under your `vendor/` and depend on it:

    npm install ./vendor/neoteletext-server-ts-protocol-1.0.0.tgz

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
standard input. Each application is called with what happened (`start`,
`joined`, `query`, `opened`, `leftPage`, `input`, `wake`, `ended`, `stats`) and
answers through its `Context`: publish a page for everyone or for one
viewer, send a viewer to a page, retitle a page, play a sound, write to
the viewer's console (`authorLog`) or the server's log, set a cookie,
ask to be woken.

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
  index links, a cursor, and the Link Extension's `keyLink`, `numberLink`
  and `textLink`), written as the typed sub-page the protocol carries
  (`Screen.content()`: rows as base64 of 40 seven-bit codes, the six
  links, the named control bits, the character set, enhancement packets,
  the cursor), or as TTI for a file; `Sixels`, mosaic graphics;
  `Colour` and `Attribute`, the spacing attributes of EN 300 706 Table 26.
- **Text:** `englishCodes`, any text as the English G0 set shows it, the
  characters it lacks folded to the nearest it has.
- **Input:** `Input`, what a viewer did, and `pressed`, `clicked`,
  `typed`, `character` and `decimalDigit` to read it.
- **Navigation:** pages that do not take digits or the coloured keys
  themselves get page selection by them, and a click a page does not take
  follows the prompt or page number it is on.
- **Sound:** stored and live sounds and the commands that play them, in
  the engine's audio profile. Desktop and phone receivers play Opus alone,
  which the program encodes and the server carries unchanged
  (teletext-server's decision 21): `ffmpegOpus` encodes a whole sound or
  a stream with ffmpeg's libopus, in the profile's constant-rate 16 kbit/s
  packets of 20 ms, and the `opus`, `opusLive` and `opusPackets` members
  carry them. `OggOpusReader` reads an Ogg Opus stream, checked and
  bounded. The PCM members, which the server encodes as IMA ADPCM, are for
  microcontroller receivers. The testing entry's `fakeOpus` stands in for
  ffmpeg in tests.
- **TTI, for files:** `readTtiPages` reads TTI into typed sub-pages as
  the engine's reader does (rows, the packed lines OL,26 to OL,29, FL,
  PS, RE, CU and the Link Extension's LN, LK and LT); `readTti` reads it
  back as rows and links; `packedLinksLine`, Fastext links that name a
  sub-page.
- **Limits:** the kit holds no limit of its own: `Context.limits()` is
  what the server's `start` said, the standard's maxima (8,190 sub-pages
  a page, 2,022 pages a channel) and the server's budgets (the longest
  title, log line, the connections one message may name).
- **The wire:** the hand-written types of every message (`ProgramMessage`,
  `WireServerMessage`, `WirePage` and the rest), `checkProgram` and
  `checkServer`, `App` (which sends a message only when it is valid),
  `readMessage` and `serveLines`, for a program that runs its own loop.

Everything is exported from the package's root; nothing else may be
imported.

## Tests

`neoteletext-server-ts-protocol/testing` drives a channel as the server
does (each session one connection, numbered as the session: `join`
connects it, `open(session, page, sub?)` selects), keeps every line the
program wrote in `sent`, and reads back the pages the channel keeps
(`shared`, `own`, `seen`, `sharedPages`):

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

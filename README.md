# neoteletext-server-ts-protocol

The NeoTeletext server's channel protocol for programs in TypeScript: the
reference kit of teletext-server's `docs/applications.md` section 5. A
channel is a program the server starts; they talk in lines of JSON on its
standard input and output. This package speaks that protocol, checks
everything the server sends before it is used, and checks everything the
program writes as the server will, so a mistake is caught where it is
made.

## Install

The package is released as a built tarball, not to a registry. Commit the
release under your `vendor/` and depend on it:

    npm install ./vendor/neoteletext-server-ts-protocol-0.4.0.tgz

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

`runChannel` declares the applications' pages, serves the server's lines
and resolves when the server closes standard input. Each application is
called with what happened (`start`, `joined`, `opened`, `input`, `wake`,
`ended`, `stats`) and answers through its `Context`: publish a page for
everyone or for one viewer, send a viewer to a page, retitle a page, play
a sound, ask to be woken.

## What is in it

- **Pages:** `Screen`, a page drawn as a terminal draws its screen (text
  and colour at a row and column, double height, backgrounds, Fastext and
  index links, a cursor), written as TTI; `Sixels`, mosaic graphics;
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
- **TTI:** `readTti`, TTI read back as the server's reader takes it, and
  `packedLinksLine`, Fastext links that name a sub-page.
- **Sub-pages and limits:** a whole page's sub-pages are numbered by the
  server; `Context.put` and `Context.remove` change some of a page's
  sub-pages by their sub-codes and keep the rest. The kit holds no limit
  of its own: `Context.limits()` is what the server's `start` said, the
  standard's maxima (8,190 sub-pages a page, 2,022 pages a channel) and
  the server's budgets (teletext-server's requirement 3.3).
- **The wire:** `App`, `readMessage` and `serveLines`, for a program that
  runs its own loop.

Everything is exported from the package's root; nothing else may be
imported.

## Tests

`neoteletext-server-ts-protocol/testing` drives a channel as the server does,
and reads back what it wrote:

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

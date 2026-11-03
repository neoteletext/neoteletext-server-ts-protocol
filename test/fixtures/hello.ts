// A small channel whose answers (hello.jsonl, checked by fixture.test.ts)
// to a connection and its selections are kept, for the server's tests to
// replay: pages drawn with the kit, with control codes, the English set's
// own signs, mosaics, Fastext, links to a sub-page and sub-pages, so a
// test can check the server encodes the typed sub-pages the kit writes as
// they were drawn; a page of text in several languages for the server to
// encode (REQ-2214): Russian, Greek, Arabic and Hebrew on an English page;
// and a section and a new title, which the index shows.

import {
  Colour,
  CursorFlag,
  decimalSubcode,
  packedLinksLine,
  type PageEntry,
  runChannel,
  Screen,
  Sixels,
  SIXELS_ACROSS,
  SIXELS_DOWN,
} from "../../src/index.ts";

/** The pages the test reads. */
const INDEX = 0x100;
const CAROUSEL = 0x101;
const RAW = 0x102;
const SUBPAGE_LINK = 0x103;
const LANGUAGES = 0x104;
/** A page in TTI as a converter writes it, with lines the kit never writes (DE, PS). */
const RAW_TTI = "DE,Raw\nPN,10200\nSC,0000\nPS,8000\nOL,1,\u001BBRaw\nFL,100,8FF,8FF,8FF,8FF,100\n";
/** The carousel's sub-pages. */
const SUBPAGES = [1, 2] as const;
/** A page whose red link names the carousel's second sub-page, which only a packed OL,27 line can say. */
const SUBPAGE_LINK_TTI = `PN,10300\nSC,0000\n${packedLinksLine(
  SUBPAGE_LINK,
  [{ page: CAROUSEL, subcode: decimalSubcode(2) }, null, null, null, null, { page: INDEX, subcode: null }],
  true,
)}\nOL,1,Links\n`;

function index(): Screen {
  const screen = new Screen();
  screen.header("Kit");
  screen.coloured(1, 0, Colour.Red, "Red #1 £2");
  screen.doubleHeight(2, 0, Colour.Yellow, "Tall");
  // One cell of every sixel and one of none.
  const canvas = new Sixels(SIXELS_ACROSS * 2, SIXELS_DOWN);
  for (let y = 0; y < SIXELS_DOWN; y += 1) {
    for (let x = 0; x < SIXELS_ACROSS; x += 1) {
      canvas.set(x, y, true);
    }
  }
  canvas.draw(screen, 4, 1, Colour.Green);
  screen.fastext([CAROUSEL, null, null, INDEX]);
  screen.indexLink(INDEX);
  // A cursor, which the server must accept too.
  screen.cursor(6, 2, CursorFlag.Block);
  return screen;
}

function languages(): Screen {
  const screen = new Screen();
  screen.language("en");
  screen.coloured(1, 0, Colour.White, "Languages: café");
  screen.coloured(2, 0, Colour.Cyan, "Привет", "ru");
  screen.coloured(2, 20, Colour.Cyan, "Γειά σου", "el");
  screen.coloured(3, 0, Colour.Yellow, "مرحبا", "ar");
  screen.coloured(5, 0, Colour.Green, "שלום", "he");
  return screen;
}

function subpage(number: number): Screen {
  const screen = new Screen();
  screen.coloured(1, 0, Colour.White, `Sub-page ${number}`);
  return screen;
}

await runChannel([
  {
    pages: (): PageEntry[] => [
      { page: INDEX, title: "Kit index" },
      { page: CAROUSEL, title: "Kit carousel" },
      { page: RAW, title: "Kit raw" },
      { page: SUBPAGE_LINK, title: "Kit sub-page link", section: "Kit links" },
      { page: LANGUAGES, title: "Kit languages" },
    ],
    start: (context): void => {
      // Before the pages, whose publication the test waits for.
      context.title(RAW, "Kit raw, retitled");
      context.publish("channel", INDEX, index());
      context.publishSubpages(
        "channel",
        CAROUSEL,
        SUBPAGES.map((number) => ({ screen: subpage(number) })),
      );
      context.publishTti("channel", RAW, RAW_TTI);
      context.publishTti("channel", SUBPAGE_LINK, SUBPAGE_LINK_TTI);
      context.publish("channel", LANGUAGES, languages());
    },
  },
]);

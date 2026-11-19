# Deploying neoteletext-server-ts-protocol

A library is deployed by releasing it. Nothing of this repository runs on
a host by itself: a release reaches the deploy host inside the programs
that use it.

## Release

Raise `version` in `package.json` (semantic versioning: a change to what
`exports` names is a new major version) and commit, then:

    scripts/release.sh

On a clean tree it runs the checks and the build, packs
`tmp/release/neoteletext-server-ts-protocol-<version>.tgz` and tags the commit
`v<version>`. A version already tagged is refused.

## What the host needs

A program that sends sound through `ffmpegOpus` runs ffmpeg built with
libopus (`ffmpeg -encoders` lists `libopus`), on its path or at the path
it is given. Measured with ffmpeg 8.0.1.

## Into the programs that use it

Each consumer commits the release under its own `vendor/`:

- **neoteletext-server-ts-ui-components**, as its peer dependency and, for its
  tests, a development dependency (its `BUILD.md`, "A new release of the
  protocol"). It then releases a version built against this one.
- **The four TypeScript channels,** neoteletext-server-channel-demosite,
  neoteletext-server-channel-uicomponentsdemo,
  neoteletext-server-channel-home-www.neoteletext.com and
  neoteletext-server-channel-hackaday, as a dependency:

      cp tmp/release/neoteletext-server-ts-protocol-<version>.tgz <consumer>/vendor/
      git -C <consumer> rm vendor/neoteletext-server-ts-protocol-<old version>.tgz
      cd <consumer> && npm install --save-exact ./vendor/neoteletext-server-ts-protocol-<version>.tgz

  `package.json` then names `file:vendor/<the file>`, and the lockfile
  pins its checksum. A consumer that also uses the component library
  takes the library's release built against the same version. The
  consumer's gates run, and it commits.

The package exports `neoteletext-server-ts-protocol`,
`neoteletext-server-ts-protocol/protocol` (the protocol's types) and
`neoteletext-server-ts-protocol/testing` (the test harness); nothing else.

## Release 19.2.0: snapshots for tabs' thumbnails

Release 19.2.0 answers the server's `snapshot`, added to program protocol
16 before its release (neoteletext-common `docs/tab-thumbnails.md`
sections 6 and 7; REQ-6901, DEC-6875), at the server's schema of
neoteletext-app-server `c5557e4` (branch `parity`, not yet merged). The kit runs
the page's own selection for a stranger on a connection of its own,
numbered below zero, and answers `snapshot_page` with the sub-page that
connection is shown first and the picture sent to it, or the kept picture
of that sub-page, or `snapshot_declined`; nothing else addressed to that
connection is sent. New: `Context.isSnapshot(connection)`,
`PageEntry.snapshots` (false declines every snapshot of the page),
`Limits.budgets.snapshotLimitMs` (`start.budgets.snapshot_limit_ms`,
2,000) and the harness's `snapshot(page, sub?)`. A server built before
the snapshot messages sends a `start` this release refuses (its budgets
lack `snapshot_limit_ms`), and a program on 19.1.0 refuses the new
server's `snapshot`: the kit, the component library 27.2.0, the Python
kit 1.2.0, the channels and the server are deployed together (section
6.1). Its shared files are neoteletext-common's at a8d9163, which lists
`isSnapshot` and the harness's `snapshot`.

## Release 19.1.0: double-height NAPLPS text

Release 19.1.0 adds `rows` to `Naplps.text`'s options: `text(text,
{ row, column, rows: 2 })` writes teletext's double height, each
character 12 dots by two rows from the upper row `row` (1 to 22), with
TEXT's field 3,276 by 8,904 steps and the point at the lower left of the
row below (neoteletext-common `docs/naplps-raster.md` RAS-8 item 5,
TODO-6890). Nothing else changes: a call without `rows` writes the bytes
19.0.0 wrote. `NaplpsTextOptions` and `TextRows` are exported. Its
shared files are neoteletext-common's at 92ecc72, with the example
`naplps-double-height-text`. The component library takes it to draw
double height in NAPLPS (DEC-6889).

## Release 19.0.0: program protocol 16, NAPLPS on the teletext raster

Release 19.0.0 speaks program protocol 16, at the server's schema of
neoteletext-app-server `303e75d` (branch `parity`, not yet merged), and
stops on a server of 15 (neoteletext-common `docs/naplps-raster.md`
RAS-10). Every NAPLPS coordinate is a dot of the 480 by 500 teletext
raster (DEC-6853), the picture drawn on its 460 lines from line 20,
teletext rows 1 to 23 (DEC-6857): an object's `x`, `y`, `width`
(1 to 480), `height` (1 to 500) and origin, and every place the `Naplps`
builder takes. The builder writes six-byte operands (DOMAIN 2/1 5/4 and
six 4/0), eighteen bits an axis; colours are six bytes too, each
primary's eight bits then four zero bits; `rect` covers exactly its dots
and lines; and `text(text, { row, column })` sets TEXT's field to 3,276
by 4,452 steps and the point to the cell's lower left before the text
part, so that every character is one Noto cell (RAS-6, RAS-8). It
replaces 18.4.0's four bytes and its 640 by 480 design picture below.
Bytes of a program's own are read in the six-byte domain. Every channel
moves to 19.0.0 before or with the server of protocol 16, and the
component library releases against it.

## Release 18.4.0: NAPLPS at four-byte precision

Release 18.4.0 still speaks program protocol 15, at the server's schema of
neoteletext-app-server `9059c09`. The `Naplps` builder writes every
coordinate at four-byte precision (renderer parity PAR-40, DEC-6849): it
sends DOMAIN (ANSI X3.110-1983 section 5.3.2.2) before its first PDI or
bytes of the program's own, again after its own `reset()`, and in each
macro's contents, and then writes twelve bits an axis, a step of 1/2048
of the unit screen, so that a fill can begin and end on any pixel of the
teletext raster's 480 by 462 canvas, including its last dot, 479
(TODO-6846, TODO-6848). SET COLOR's operand takes four bytes too, each
primary's eight bits. Design coordinates need not be whole numbers. A
picture's bytes change: each coordinate and colour operand is a byte
longer, and each builder that draws pays DOMAIN's 6 or 7 bytes once.
Bytes of a program's own are read in the four-byte domain, so a program
that writes multi-value operands itself writes them in four bytes, or in
three when the operand is the last of its instruction (a short operand is
read with zero bits after it, section 5.3.2.2.5).

## Release 18.3.0: a picture's links and cursor in a rule table's group

Release 18.3.0 still speaks program protocol 15, at the server's schema of
neoteletext-app-server `9059c09` (branch `parity`, not yet merged), which
adds four commands a rule table's group may hold (renderer parity PAR-20;
page-rules.md RULE-35, RULE-119): `regis_links`, `regis_cursor`,
`naplps_links` and `naplps_cursor`, each the message without
`connections`, `page` and `sub`, so that a group changes a picture's links
and cursor at local speed. `RuleCommand` gains the four, and the kit holds
their links as the messages' links are held, refusing them as
`invalid_group` at the path the server names. A table that holds none of
them changes nothing; one that does needs a server built from that commit
or later.

## Release 18.2.1: a picture's bytes written before restart

Release 18.2.1 is 18.2.0 with `regis` and `naplps` written with `data` or
`parts` before `restart`, the order the Python kit writes, so that both
kits write one line (DEC-6462). The server reads either; nothing changes
for a consumer.

## Release 18.2.0: kept pictures, picture text, and the ReGIS and NAPLPS builders

Release 18.2.0 still speaks program protocol 15, at the server's schema of
neoteletext-app-server `25bc0e7` (branch `parity`, not yet merged), whose
picture messages renderer parity adds (neoteletext-common's
`docs/renderer-parity.md`, PAR-16 to PAR-26). A program that uses the new
calls needs a server built from that commit or later; one that does not
changes nothing. It adds:

- **`{ kept: true }`**, a `PictureAudience` that only `regis`,
  `regisLinks`, `regisCursor`, `naplps`, `naplpsObjects`, `naplpsLinks` and
  `naplpsCursor` take: the server keeps what they send for the page and
  sub-code named and sends it to every viewer of them, now or later, until
  **`context.forgetPicture(page, sub)`**.
- **`context.naplpsLinks(to, page, sub, links)`** and
  **`context.naplpsCursor(to, page, sub, object)`**, a NAPLPS picture's
  object links and cursor.
- **`context.regis` and `context.naplps`** take a list of parts too, each
  bytes or `{ text, language?, outside? }`, Unicode text the server writes
  in the provided character sets; `naplps` takes text written a byte a
  character as `regis` does.
- **`context.measurePictureText(text, { language, outside })`**, what a
  text part costs, or `PictureTextRefusedError`.
- **`PageDescription.picture`**, a public page's ReGIS or NAPLPS picture.
- **`Regis` and `Naplps`**, builders of the parts, with the renderers'
  limits by their names, `regisLimits` and `naplpsLimits`.

While the server's commit is unpublished, a consumer takes the release
built from this repository's branch `parity` as any other (below): the
tarball names no server commit, which is the consumer's to run.

## Release 18.1.0: NAPLPS labels, the picture's title and one object redefined

Release 18.1.0 still speaks program protocol 15, at the server's schema of
neoteletext-app-server `9d5eb99`, whose `naplps_objects` takes a label on
each object, the picture's title, and one object redefined (ANIM-11). It
adds and changes nothing a consumer already calls:

- **`NaplpsObject.label`**, new and optional: what a screen reader says
  for the object, at most 64 bytes of plain text.
- **`context.naplpsObjects(to, page, sub, objects)`** also takes a
  `NaplpsObjectSet`: `{ objects, title }` sets the picture's title with
  the objects, and `{ objects: [object], one: true }` redefines that one
  object, keeping every other object and the title. A list is read as
  before, and clears the title as the server always has.

## Release 18.0.0: the object page by its objects, and the rule table's limits

Release 18.0.0 still speaks program protocol 15, at the server's schema of
neoteletext-app-server `db7f927`, whose `object_page` carries the object
page by its objects. What a consumer changes to take it:

- **`context.objectPage(to, page, sub, object)`** takes the object page's
  sub-page whole (`ObjectPage`: `page`, `s1`, `global`, `last`, and
  `objects`, each a `kind`, an `index` and its `triplets`), in place of an
  object page number, a sub-code and a page's content. A channel that
  never called it changes nothing.
- **A sequence started with `at` null** is written with no `at`, as one
  started with none; the server reads both alike.
- **The rule table's limits** are exported by the engine's names
  (`MAX_RULES`, `MAX_RECTS`, …, `TICKS_PER_SECOND`): a consumer that wrote
  a figure, or found one by probing the kit's check, uses the constant,
  and may test its own repository with `limitFigureLines` of
  `neoteletext-server-ts-protocol/testing` (REQ-6608).
- **`PageEntry.keysOf(connection, sub)`**, new and optional, says the keys
  each sub-page takes itself (DEC-6599); an entry without it is read as
  before.

## Release 17.0.0: program protocol 15

Release 17.0.0 speaks program protocol 15 (the second form of the page
rule table, a rule running one group of protocol commands, and animation:
neoteletext-common's `docs/page-rules.md` and `docs/animation.md`) and
nothing else, so it runs only under a server that speaks 15, and a server
that speaks 15 runs no program on an older kit. The server, every channel
and the browser are deployed together, because the browser's push
protocol changes with it (push protocol 10).

What a consumer changes to take it:

- **Nothing in a channel's source,** when the server's channel
  configuration gives the channel `"default_rules": "send_all"`
  (RULE-53) and the channel calls none of the calls below: its pages are
  sent the default table and it hears the input it heard, each input now
  also naming its `ruleRow` (null under the default table).
- **Every call that concerns a page takes its sub-code** (DEC-6599):
  `rules(to, page, sub, table)`, `queryState(connection, page, sub)`,
  `spriteSheet(to, page, sub, kind, data, restart?)` and
  `stopTimeline(to, page, sub, id)`. The server keeps nothing for a viewer
  who selects a page later or reconnects: send the page's table, sheet
  and objects at every selection.
- **A table of protocol 14 is rewritten:** a rule's `do` holds protocol
  commands (`{ type: "report" }`, `{ type: "animate", ops }`,
  `{ type: "variable", … }`, …), never the first form's actions; the
  sixteen variables `v0` to `v15` and the timers `t0` to `t7` are not
  declared; a mode is a variable a condition tests (`modes`); a row is one
  parameter, read as `row(plus)`.
- **Text above 255** given to `regis` or `spriteSheet` throws
  `TextNotWritableError`, where 16.0.0 sent its low byte.
- **A test that compares a whole input** finds `ruleRow` in it; a test
  that answers a state query gives sixteen `variables` and `sequences`.
- **A program that reads `harness.sent` for every line's type** meets the
  new ones: `local_midi`, `variable`, `timer`, `report`, `run`, `sequence`
  and `object_page`.

## To the host

neoteletext-app-server's `deploy/ionos/deploy.sh` copies the channels to the
host and runs `npm ci --omit=dev` there, which installs the release from each
one's `vendor/`.

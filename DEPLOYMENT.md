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

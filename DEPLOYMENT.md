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

## Release 16.0.0: program protocol 14

Release 16.0.0 speaks program protocol 14 (the page rule table and
animation: neoteletext-common's `docs/page-rules.md` and
`docs/animation.md`) and nothing else, so it runs only under a server that
speaks 14, and a server that speaks 14 runs no program on an older kit. The
server, every channel and the browser are deployed together, because the
browser's push protocol changes with it and refuses the old one both ways
(page-rules.md RULE-49).

What a consumer changes to take it:

- **Nothing in a channel's source,** when the server's channel
  configuration gives the channel `"default_rules": "send_all"`
  (RULE-53): its pages are sent the default table and it hears the input
  it heard, each input now also naming its `rule`, `tick` and `target`.
- **A test that compares a whole input** with a literal now finds those
  three fields in it, from the harness as from the server; compare the
  fields the test is about, or add the three.
- **A program that implements `ServerEvents` itself,** in place of
  `runChannel`, adds `ruleEvent`, `pageState` and `rulesFault`.
- **A program that reads `harness.sent` for every line's type** meets the
  new ones: `rules`, `query_state`, `frame`, `animate`, `sprites`,
  `naplps_objects`, `sprite_sheet`, `timeline` and `timeline_stop`.

A channel then moves to tables of its own, page by page, and its
configuration to `"default_rules": "none"` (RULE-53, RULE-54).

## To the host

neoteletext-app-server's `deploy/ionos/deploy.sh` copies the channels to the
host and runs `npm ci --omit=dev` there, which installs the release from each
one's `vendor/`.

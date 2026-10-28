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

`test/fixtures/hello.jsonl` must stay the same as teletext-server's
`crates/teletext-native/tests/fixtures/kit-channel.jsonl`, which the
server's end-to-end test replays (teletext-server's decision 13, item 3):
a release that changes what the kit writes changes both.

## What the host needs

A program that sends sound through `ffmpegOpus` runs ffmpeg built with
libopus (`ffmpeg -encoders` lists `libopus`), on its path or at the path
it is given. Measured with ffmpeg 8.0.1.

## Into the programs that use it

Each consumer commits the release under its own `vendor/`:

- **neoteletext-server-ts-ui-components**, as its peer dependency and, for its
  tests, a development dependency (its `BUILD.md`, "A new release of the
  protocol"). It then releases a version built against this one.
- **neoteletext-server-channels** (kitchensink and showcase) and
  **neoteletext-server-channel-hackaday**, as a dependency:

      cp tmp/release/neoteletext-server-ts-protocol-<version>.tgz <consumer>/vendor/
      git -C <consumer> rm vendor/neoteletext-server-ts-protocol-<old version>.tgz
      cd <consumer> && npm install --save-exact ./vendor/neoteletext-server-ts-protocol-<version>.tgz

  `package.json` then names `file:vendor/<the file>`, and the lockfile
  pins its checksum. A consumer that also uses the component library
  takes the library's release built against the same version. The
  consumer's gates run, and it commits.

The package exports `neoteletext-server-ts-protocol` and
`neoteletext-server-ts-protocol/testing` (the test harness); nothing else.

## To the host

teletext-server's `scripts/deploy.sh` copies neoteletext-server-channels
to the host and runs `npm ci --omit=dev` there, which installs the release
from its `vendor/`. That repository's `DEPLOYMENT.md` has the rest.

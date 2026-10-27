# Building neottx-server-ts-protocol

The source is TypeScript that Node runs as it is, by stripping its types
(Node 22.18 and later), so the tests run the source. A release is built:
Node strips no types from a package installed under `node_modules`, so a
consumer takes the JavaScript and declarations in `dist/`.

## What is needed

- **Node 22.18 or later.** `scripts/check.sh` refuses an older one.
- **TypeScript 7.0.2**, the latest release, pinned in `package-lock.json`.

## Check

    scripts/check.sh stage    # the locked tools, the type check, the tests
    scripts/check.sh build    # the release build into dist/

The git hooks (`git config core.hooksPath .githooks`) run
`scripts/check.sh commit` on commit and `scripts/check.sh full` on push:
the stage, the build, and the stage again on the Linux host. A hook is
never bypassed.

## Release

Raise `version` in `package.json` and commit, then:

    scripts/release.sh

On a clean tree it checks, builds, packs
`tmp/release/neottx-server-ts-protocol-<version>.tgz` and tags the commit
`v<version>`. A consumer commits the file under its `vendor/`, depends on
it as `"neottx-server-ts-protocol": "file:vendor/<the file>"`, and imports
`neottx-server-ts-protocol`, `neottx-server-ts-protocol/testing` or
`neottx-server-ts-protocol/read-tti`; nothing else is exported.

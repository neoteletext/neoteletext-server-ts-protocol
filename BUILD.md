# Building neoteletext-server-ts-protocol

The source is TypeScript that Node runs as it is, by stripping its types
(Node 22.18 and later), so the tests run the source. A release is built:
Node strips no types from a package installed under `node_modules`, so a
consumer takes the JavaScript and declarations in `dist/`.

## What is needed

- **Node 22.18 or later.** `scripts/check.sh` refuses an older one.
- **TypeScript 7.0.2**, the latest release, and the quality tools (oxlint
  with oxlint-tsgolint, Prettier, Knip), all pinned in `package-lock.json`.
- **Ajv 8**, pinned, at build only: `scripts/validators.ts` compiles the
  server's schema (`schema/protocol-6.json`, a copy of the server's
  `protocol/schema-6.json`) with Ajv's standalone mode into
  `src/wire/generated/`, which every check and build makes again and git
  never holds. The release ships those plain functions, with Ajv's two
  run-time helpers written in, so it needs nothing of Ajv when it runs.
  A new schema from the server is taken by copying it over
  `schema/protocol-6.json` and naming the server's commit it is from in
  `scripts/check.sh` (`SCHEMA_FROM`): the commit gate, and
  `scripts/check.sh schema`, fail when the copy differs from the server's
  `protocol/schema-6.json` at that commit, read from the server's
  repository at `~/devel/neoteletext-app-server` (or `NEOTELETEXT_SERVER`).

## Check

    scripts/check.sh stage    # the locked tools, the type check, formatting,
                              # lint and Knip, the tests
    scripts/check.sh build    # the release build into dist/

The git hooks (`git config core.hooksPath .githooks`) run `scripts/check.sh`;
`~/devel/neoteletext-common/gates.md` says how the gates and the work branch `livedevelopment` work.

## Release and deploy

`DEPLOYMENT.md`: the release, and how it reaches the programs that use it
and the host they run on.

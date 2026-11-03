# neoteletext-server-ts-protocol

The NeoTeletext server's channel protocol for programs in TypeScript: the
reference kit of DOC-1974. These
rules add to `~/.claude/CLAUDE.md`.

## How we work

@~/devel/neoteletext-common/DEVELOPMENT.md

That is the one document of how we work, for every NeoTeletext repository, with rdm as the record of all work (DEC-2162). This file says only what is particular to this repository; where the two differ, that document holds. The gates and the work branch are its section 9.

## Working on the code

- **Always leave the code cleaner and better organised than you found
  it.** Each change is a chance to split what does two things, name what
  is unnamed, and delete what is unused.
- **The development process always uses the best-regarded linters and
  code analysis tools**, pinned, with their findings fixed rather than
  silenced. A suppression is narrow, at its site, with its reason.
- **Security is important and is always a factor** in every change: what
  a program reads from the server, its files and the programs it runs is
  untrusted, checked before it is used, and bounded.
- **Always use the latest TypeScript.** Never fall back to an older
  TypeScript to suit a tool: a tool that cannot run on the latest
  TypeScript is replaced, not accommodated.
- **This is a library.** What `package.json`'s `exports` names is its
  whole interface; a change to it is a change of version, and its
  consumers take a release, never its source.
- **The fixture is half of a check.** `test/fixtures/hello.jsonl` is what
  `test/fixtures/hello.ts` writes, byte for byte (`test/fixture.test.ts`).
  The server keeps a copy of it as `tests/fixtures/kit-channel.jsonl` and
  replays it in `the_kits_fixture_channel_is_served_as_the_kit_means_it`
  (neoteletext-app-server `9fe934d`, TODO-1537); the server's commit gate
  (`check_kit_fixture`) fails when that copy differs from this file at the
  kit commit its `KIT_FIXTURE_FROM` names. So a change to `hello.jsonl`
  also needs the server to take the new file and move `KIT_FIXTURE_FROM`.

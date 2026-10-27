# neottx-server-ts-protocol

The NeoTeletext server's channel protocol for programs in TypeScript: the
reference kit of teletext-server's `docs/applications.md` section 5. These
rules add to `~/.claude/CLAUDE.md`.

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
- **The fixture is half of a check.** `test/fixtures/hello.jsonl` must stay
  the same as teletext-server's `tests/fixtures/kit-channel.jsonl`, which
  the server's end-to-end test replays.

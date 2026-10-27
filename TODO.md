# neottx-server-ts-protocol: to do

1. The quality tools' pass: oxlint (type-aware, with oxlint-tsgolint),
   Prettier and Knip, at the versions and settings
   neoteletext-server-channels uses, their findings fixed, then run by
   `scripts/check.sh`.

After the work in hand is done (this list's first item, and moving
hackaday-next to a repository of its own), the owner's cleanup of
28 October 2026, as hackaday-next had:

2. **Files:** the code broken down into as many files as make sense,
   one concept to a file, and the files organised in a way that makes
   sense.
3. **Modern TypeScript:** the best practices of a highly expert 2026
   TypeScript programmer, on the latest TypeScript.
4. **Security review:** everything read from the server, a viewer or a
   file is untrusted; every length and allocation bounded.
5. **Comments:** up to date, explaining the key things that need
   explaining, and nothing that is obvious.
6. **A README** (the owner, 28 October 2026): what the library is, how to
   install and use it, its API, and its licence, MIT; written once the
   cleanup above has settled the API.

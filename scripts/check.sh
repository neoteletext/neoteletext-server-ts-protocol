#!/usr/bin/env bash
# The repository's one check script, which its git hooks run: its own
# steps, on the gate machinery every neoteletext repository shares
# (scripts/gate.sh, copied from neoteletext-common; DEVELOPMENT.md section 9
# there).
#   scripts/check.sh commit   the stage, on what is staged
#   scripts/check.sh push     nothing the commit gate passed on the same
#                             code: a push of livedevelopment
#   scripts/check.sh full     the release build, and the stage again on
#                             $TELETEXT_LINUX_HOST alongside, as the deploy
#                             host runs it: a push to main
#   scripts/check.sh stage    Node, the locked tools, the type check, the
#                             formatting, lint and Knip checks, and the
#                             tests: what the gates run, here or on the host
#   scripts/check.sh build    the release build into dist/
#   scripts/check.sh schema   schema/protocol-12.json against the server's
set -euo pipefail
cd "$(dirname "$0")/.."

# The Linux host of the neoteletext full gates (DEVELOPMENT.md section 12).
linux_host="${TELETEXT_LINUX_HOST:-foundintelquiet4060}"
# Node runs .ts files itself by stripping their types from 22.18 on.
readonly NODE_LEAST="22.18.0"
# The lockfile's SHA-256 when node_modules was installed from it, so a
# changed lockfile installs again.
readonly INSTALLED_FROM="node_modules/.installed-from.sha256"
# Every file is the program or its checks.
readonly CHECKED_PATHS=(.)
# The server's repository, and the commit whose protocol/schema-12.json
# schema/protocol-12.json is a copy of: a new schema is taken by copying it
# and naming its commit here.
server="${NEOTELETEXT_SERVER:-$HOME/devel/neoteletext-app-server}"
readonly SCHEMA_FROM="df662b92de74155e793e7dbd27330b7077913319"
# The server commit whose PROGRAM_REPLY_LIMIT_MS the testing entry's
# SERVER_LIMITS must equal (DEC-2438).
readonly REPLY_LIMIT_FROM="fa18b08928651a6161c1158375171b61aabf56f7"
readonly REPLY_LIMIT_SOURCE="crates/teletext-runtime/src/channel.rs"

. scripts/gate.sh

# Git in the server's repository. A hook in a linked worktree inherits GIT_DIR
# and its neighbours, which would override -C and read this repository.
server_git() { env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE git -C "$server" "$@"; }

sha256_of() {
    if command -v sha256sum >/dev/null; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

# node_modules as package-lock.json has it. Every step that runs a package
# calls this first: the full gate skips the stage when the push gate has
# passed on the tree, and its build must not then use an older install.
locked_tools() {
    local lock
    lock="$(sha256_of package-lock.json)"
    if [[ ! -f "$INSTALLED_FROM" || "$(cat "$INSTALLED_FROM")" != "$lock" ]]; then
        step "the locked tools (npm ci)"
        # No package's install scripts run: the tools need none.
        npm ci --ignore-scripts --no-audit --no-fund
        printf '%s\n' "$lock" >"$INSTALLED_FROM"
    fi
}

stage() {
    step "Node $NODE_LEAST or later"
    need_tool node "the checks need Node $NODE_LEAST or later; install it with nvm"
    local version
    version="$(node --version)"
    node -e '
const [least, found] = process.argv.slice(1).map((text) => text.replace(/^v/, "").split(".").map(Number));
const newer = least.findIndex((part, index) => found[index] !== part);
process.exit(newer === -1 || found[newer] > least[newer] ? 0 : 1);
' "$NODE_LEAST" "$version" || fail "Node $version is older than $NODE_LEAST, which runs TypeScript by stripping its types"
    printf 'node %s\n' "$version"

    locked_tools

    step "the validators, from the server's schema (Ajv's standalone mode)"
    node scripts/validators.ts

    step "type check, every strict option, errors fail"
    npx --no -- tsc --version
    npx --no -- tsc -p tsconfig.json

    # The quality tools run on TypeScript 7: oxlint's type-aware rules are
    # typescript-go's own.
    step "formatting (Prettier, .prettierrc.json)"
    npx --no -- prettier --check src test scripts/validators.ts

    step "lint, type-aware, warnings fail (oxlint, .oxlintrc.json)"
    npx --no -- oxlint --type-aware --tsconfig tsconfig.json --deny-warnings src test

    step "unused files, exports and dependencies (Knip, knip.jsonc)"
    npx --no -- knip --no-progress

    step "tests"
    node --test "test/**/*.test.ts"
}

build() {
    locked_tools
    step "the release build (tsconfig.build.json)"
    rm -rf dist
    node scripts/validators.ts
    npx --no -- tsc -p tsconfig.build.json
    # The validators are generated JavaScript, which tsc does not emit.
    mkdir -p dist/wire/generated
    cp src/wire/generated/validators.js src/wire/generated/validators.d.ts dist/wire/generated/
}

# The copy is the server's file at the commit named, byte for byte, so the
# validators check what the server checks. The server's repository is on
# this machine, not on the Linux host, whose steps (stage) do not ask it.
schema() {
    step "schema/protocol-12.json is the server's protocol/schema-12.json at ${SCHEMA_FROM:0:7}"
    server_git rev-parse --git-dir >/dev/null 2>&1 || fail "the server's repository is needed at $server (or NEOTELETEXT_SERVER) to check the schema's copy"
    server_git cat-file -e "$SCHEMA_FROM:protocol/schema-12.json" 2>/dev/null || fail "$server has no protocol/schema-12.json at $SCHEMA_FROM"
    cmp -s schema/protocol-12.json <(server_git show "$SCHEMA_FROM:protocol/schema-12.json") ||
        fail "schema/protocol-12.json differs from $server's protocol/schema-12.json at $SCHEMA_FROM; copy that file, or name in scripts/check.sh the commit the copy is from"
}

reply_limit() {
    step "SERVER_LIMITS's replyLimitMs is the server's PROGRAM_REPLY_LIMIT_MS at ${REPLY_LIMIT_FROM:0:7}"
    server_git rev-parse --git-dir >/dev/null 2>&1 || fail "the server's repository is needed at $server (or NEOTELETEXT_SERVER) to read its reply limit"
    local servers kits
    servers="$(server_git show "$REPLY_LIMIT_FROM:$REPLY_LIMIT_SOURCE" 2>/dev/null |
        sed -n 's/^pub const PROGRAM_REPLY_LIMIT_MS: u64 = \([0-9_]*\);$/\1/p' | tr -d _)"
    [[ -n "$servers" ]] || fail "$server has no PROGRAM_REPLY_LIMIT_MS in $REPLY_LIMIT_SOURCE at $REPLY_LIMIT_FROM"
    kits="$(node -e 'import("./src/testing/server-limits.ts").then(({ SERVER_LIMITS }) => console.log(SERVER_LIMITS.budgets.replyLimitMs))')"
    [[ "$kits" == "$servers" ]] ||
        fail "SERVER_LIMITS's replyLimitMs is $kits but the server's PROGRAM_REPLY_LIMIT_MS is $servers at $REPLY_LIMIT_FROM; take the server's, or name in scripts/check.sh the commit it is from"
    printf 'both %s ms\n' "$kits"
}

commit_steps() {
    schema
    reply_limit
    stage
}
full_steps() { build; }

linux_steps() {
    local here
    here="$(basename "$PWD")"
    step "Linux on $linux_host: the stage"
    need_host
    # By content, with the host's own times (DEVELOPMENT.md section 9.3).
    rsync -a --no-times --checksum --delete --exclude tmp --exclude .git --exclude node_modules --exclude dist ./ "$linux_host:$here-check/"
    ssh "$linux_host" "set -e; cd $here-check && scripts/check.sh stage"
}

case "${1:-}" in
schema | reply_limit | stage | build)
    "$1"
    step "All checks passed ($1)"
    step_name=""
    ;;
*) gate_main "$@" ;;
esac

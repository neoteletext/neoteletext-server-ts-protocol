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
#   scripts/check.sh schema   schema/protocol-16.json against the server's
#   scripts/check.sh shared   kit-calls.tsv and the shared fixtures of
#                             test/fixtures against neoteletext-common's
#   scripts/check.sh limits   src/rules/limits.ts against the engine's
#                             neoteletext_rules::limits
#   scripts/check.sh picture_limits
#                             src/picture/regis-limits.ts and
#                             naplps-limits.ts against the renderers'
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
# The server's repository, and the commit whose protocol/schema-16.json
# schema/protocol-16.json is a copy of: a new schema is taken by copying it
# and naming its commit here (typescript.md TS-5 to TS-7).
server="${NEOTELETEXT_SERVER:-$HOME/devel/neoteletext-app-server}"
readonly SCHEMA_FROM="c5557e4be601bd2337b0054adc9c893123271c28"
# neoteletext-common's repository, and the commit whose files the shared
# copies below are copies of: the calls and the worked examples' lines both
# kits must have (typescript.md TS-2, TS-6), and protocol 15's rule tables and
# timelines as both kits must write them (python.md PY-80; page-rules.md
# section 7.5 and RULE-93; animation.md ANIM-19), and the picture builders'
# calls and bytes (renderer-parity.md PAR-39, PAR-40).
common="${NEOTELETEXT_COMMON:-$HOME/devel/neoteletext-common}"
readonly COMMON_FROM="a8d9163128cd0ded1fb0a20e6fbef63d6dd712e3"
# Each copy and the file of neoteletext-common it is a copy of.
readonly SHARED_COPIES=(
    "kit-calls.tsv:docs/audio/kit-calls.tsv"
    "test/fixtures/examples.jsonl:docs/audio/examples.jsonl"
    "test/fixtures/rules-examples.jsonl:docs/rules-examples.jsonl"
    "test/fixtures/timelines.jsonl:docs/timelines.jsonl"
    "test/fixtures/command-lines.jsonl:docs/command-lines.jsonl"
    "test/fixtures/picture-examples.jsonl:docs/picture-examples.jsonl"
)
# The engine's repository, and the commit whose
# crates/neoteletext-rules/src/limits.rs src/rules/limits.ts is generated
# from (page-rules.md RULE-57, REQ-6608): the one home of the rule table's
# limits, at the commit the server pins.
engine="${NEOTELETEXT_ENGINE:-$HOME/devel/neoteletext-renderer-teletext}"
readonly LIMITS_FROM="33d9089610d1ee2d920dd26d42fb22388c97e709"
readonly LIMITS_SOURCE="crates/neoteletext-rules/src/limits.rs"
# The ReGIS and NAPLPS renderers' repositories, and the commits whose limits
# src/picture/regis-limits.ts and naplps-limits.ts are generated from
# (renderer parity PAR-39, PAR-40): the commits the server of SCHEMA_FROM
# pins, so that the builders' bounds are the receivers' and the server's.
regis="${NEOTELETEXT_REGIS:-$HOME/devel/neoteletext-renderer-regis}"
readonly REGIS_FROM="9c1a162cc1a8d17d727e19fa9a2253dee7f8bcc2"
readonly REGIS_SOURCES=(crates/regis/src/limits.rs crates/regis/src/palette.rs crates/regis/src/surface.rs)
naplps="${NEOTELETEXT_NAPLPS:-$HOME/devel/neoteletext-renderer-naplps}"
readonly NAPLPS_FROM="a96be84e03fc064c5aa76eb87862c46e3f507ea0"
readonly NAPLPS_SOURCES=(crates/naplps/src/limits.rs crates/naplps/src/surface.rs crates/naplps-render/src/main.rs)
# The server commit whose PROGRAM_REPLY_LIMIT_MS the testing entry's
# SERVER_LIMITS must equal (DEC-2438).
readonly REPLY_LIMIT_FROM="9d5eb99f0bb281dad8bb51e3fa26d35132a783be"
readonly REPLY_LIMIT_SOURCE="crates/teletext-runtime/src/channel.rs"

. scripts/gate.sh

# Git in the server's repository. A hook in a linked worktree inherits GIT_DIR
# and its neighbours, which would override -C and read this repository.
server_git() { env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE git -C "$server" "$@"; }
# Git in neoteletext-common's repository, for the same reason.
common_git() { env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE git -C "$common" "$@"; }
# Git in the engine's repository, for the same reason.
engine_git() { env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE git -C "$engine" "$@"; }
# Git in a renderer's repository, for the same reason.
renderer_git() {
    local repository="$1"
    shift
    env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE git -C "$repository" "$@"
}

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

    # Generated twice, the second time into memory only, so that one schema gives one text (typescript.md TS-12).
    step "the types, from the server's schema"
    node scripts/types.ts
    node scripts/types.ts --check

    step "the validators, from the server's schema (Ajv's standalone mode)"
    node scripts/validators.ts

    step "type check, every strict option, errors fail"
    npx --no -- tsc --version
    npx --no -- tsc -p tsconfig.json

    # The quality tools run on TypeScript 7: oxlint's type-aware rules are
    # typescript-go's own.
    step "formatting (Prettier, .prettierrc.json)"
    npx --no -- prettier --check src test scripts/validators.ts scripts/types.ts scripts/limits.ts scripts/picture-limits.ts

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
    node scripts/types.ts
    node scripts/validators.ts
    npx --no -- tsc -p tsconfig.build.json
    # The generated files are JavaScript and declarations, which tsc does not emit (TS-12).
    mkdir -p dist/wire/generated
    cp src/wire/generated/validators.js src/wire/generated/validators.d.ts src/wire/generated/protocol.d.ts src/wire/generated/bytes.js src/wire/generated/bytes.d.ts dist/wire/generated/
}

# The copy is the server's file at the commit named, byte for byte, so the
# validators check what the server checks. The server's repository is on
# this machine, not on the Linux host, whose steps (stage) do not ask it.
schema() {
    step "schema/protocol-16.json is the server's protocol/schema-16.json at ${SCHEMA_FROM:0:7}"
    server_git rev-parse --git-dir >/dev/null 2>&1 || fail "the server's repository is needed at $server (or NEOTELETEXT_SERVER) to check the schema's copy"
    server_git cat-file -e "$SCHEMA_FROM:protocol/schema-16.json" 2>/dev/null || fail "$server has no protocol/schema-16.json at $SCHEMA_FROM"
    cmp -s schema/protocol-16.json <(server_git show "$SCHEMA_FROM:protocol/schema-16.json") ||
        fail "schema/protocol-16.json differs from $server's protocol/schema-16.json at $SCHEMA_FROM; copy that file, or name in scripts/check.sh the commit the copy is from"
}

# The copies are neoteletext-common's files at the commit named, byte for byte,
# so that both kits are held to one list of calls and one set of lines.
shared() {
    step "kit-calls.tsv and the shared fixtures are neoteletext-common's at ${COMMON_FROM:0:7}"
    common_git rev-parse --git-dir >/dev/null 2>&1 || fail "neoteletext-common's repository is needed at $common (or NEOTELETEXT_COMMON) to check the shared files' copies"
    local pair copy source
    for pair in "${SHARED_COPIES[@]}"; do
        copy="${pair%%:*}"
        source="${pair#*:}"
        common_git cat-file -e "$COMMON_FROM:$source" 2>/dev/null || fail "$common has no $source at $COMMON_FROM"
        cmp -s "$copy" <(common_git show "$COMMON_FROM:$source") ||
            fail "$copy differs from $common's $source at $COMMON_FROM; copy that file, or name in scripts/check.sh the commit the copy is from"
    done
}

# The copy is generated from the engine's file at the commit named, and is
# what generating it again gives (REQ-6608: "a kit may carry a generated
# copy checked against it"). Read on this machine only, as the schema is.
limits() {
    step "src/rules/limits.ts is generated from the engine's $LIMITS_SOURCE at ${LIMITS_FROM:0:7}"
    engine_git rev-parse --git-dir >/dev/null 2>&1 || fail "the engine's repository is needed at $engine (or NEOTELETEXT_ENGINE) to check the limits' copy"
    engine_git cat-file -e "$LIMITS_FROM:$LIMITS_SOURCE" 2>/dev/null || fail "$engine has no $LIMITS_SOURCE at $LIMITS_FROM"
    mkdir -p tmp
    engine_git show "$LIMITS_FROM:$LIMITS_SOURCE" >tmp/limits.rs
    node scripts/limits.ts tmp/limits.rs --check ||
        fail "src/rules/limits.ts is not what the engine's $LIMITS_SOURCE at $LIMITS_FROM gives: run node scripts/limits.ts on it, or name in scripts/check.sh the commit it is from"
}

# The copies are generated from the renderers' files at the commits named
# (PAR-39, PAR-40). Read on this machine only, as the engine's are.
picture_limits() {
    step "src/picture/regis-limits.ts and naplps-limits.ts are generated from the renderers' at ${REGIS_FROM:0:7} and ${NAPLPS_FROM:0:7}"
    local sources="tmp/picture-limits" name repository from path
    rm -rf "$sources"
    for name in regis naplps; do
        if [[ "$name" == regis ]]; then
            repository="$regis" from="$REGIS_FROM"
            local -a paths=("${REGIS_SOURCES[@]}")
        else
            repository="$naplps" from="$NAPLPS_FROM"
            local -a paths=("${NAPLPS_SOURCES[@]}")
        fi
        renderer_git "$repository" rev-parse --git-dir >/dev/null 2>&1 || fail "the $name renderer's repository is needed at $repository (or NEOTELETEXT_${name^^}) to check the picture limits' copy"
        for path in "${paths[@]}"; do
            renderer_git "$repository" cat-file -e "$from:$path" 2>/dev/null || fail "$repository has no $path at $from"
            mkdir -p "$sources/$name/$(dirname "$path")"
            renderer_git "$repository" show "$from:$path" >"$sources/$name/$path"
        done
    done
    node scripts/picture-limits.ts "$sources" --check ||
        fail "src/picture/regis-limits.ts or naplps-limits.ts is not what the renderers' files give: run node scripts/picture-limits.ts on them, or name in scripts/check.sh the commits they are from"
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
    shared
    limits
    picture_limits
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
schema | shared | limits | picture_limits | reply_limit | stage | build)
    "$1"
    step "All checks passed ($1)"
    step_name=""
    ;;
*) gate_main "$@" ;;
esac

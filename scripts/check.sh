#!/usr/bin/env bash
# The repository's one check script, which its git hooks run: its own
# steps, on the gate machinery every neoteletext repository shares
# (scripts/gate.sh, copied from neoteletext-common; gates.md there).
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

. scripts/gate.sh

sha256_of() {
    if command -v sha256sum >/dev/null; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

stage() {
    step "Node $NODE_LEAST or later"
    command -v node >/dev/null || fail "node is not installed; the checks need Node $NODE_LEAST or later"
    local version
    version="$(node --version)"
    node -e '
const [least, found] = process.argv.slice(1).map((text) => text.replace(/^v/, "").split(".").map(Number));
const newer = least.findIndex((part, index) => found[index] !== part);
process.exit(newer === -1 || found[newer] > least[newer] ? 0 : 1);
' "$NODE_LEAST" "$version" || fail "Node $version is older than $NODE_LEAST, which runs TypeScript by stripping its types"
    printf 'node %s\n' "$version"

    local lock
    lock="$(sha256_of package-lock.json)"
    if [[ ! -f "$INSTALLED_FROM" || "$(cat "$INSTALLED_FROM")" != "$lock" ]]; then
        step "the locked tools (npm ci)"
        # No package's install scripts run: the tools need none.
        npm ci --ignore-scripts --no-audit --no-fund
        printf '%s\n' "$lock" >"$INSTALLED_FROM"
    fi

    step "type check, every strict option, errors fail"
    npx --no -- tsc --version
    npx --no -- tsc -p tsconfig.json

    # The quality tools run on TypeScript 7: oxlint's type-aware rules are
    # typescript-go's own.
    step "formatting (Prettier, .prettierrc.json)"
    npx --no -- prettier --check src test

    step "lint, type-aware, warnings fail (oxlint, .oxlintrc.json)"
    npx --no -- oxlint --type-aware --tsconfig tsconfig.json --deny-warnings src test

    step "unused files, exports and dependencies (Knip, knip.jsonc)"
    npx --no -- knip --no-progress

    step "tests"
    node --test "test/**/*.test.ts"
}

build() {
    step "the release build (tsconfig.build.json)"
    rm -rf dist
    npx --no -- tsc -p tsconfig.build.json
}

commit_steps() { stage; }
full_steps() { build; }

linux_steps() {
    local here
    here="$(basename "$PWD")"
    step "Linux on $linux_host: the stage"
    ssh -o BatchMode=yes -o ConnectTimeout=10 "$linux_host" true || fail "$linux_host is unreachable; the full gate needs it"
    # By content, with the host's own times (gates.md).
    rsync -a --no-times --checksum --delete --exclude tmp --exclude .git --exclude node_modules --exclude dist ./ "$linux_host:$here-check/"
    ssh "$linux_host" "set -e; cd $here-check && scripts/check.sh stage"
}

case "${1:-}" in
stage | build)
    "$1"
    step "All checks passed ($1)"
    step_name=""
    ;;
*) gate_main "$@" ;;
esac

#!/usr/bin/env bash
# The repository's one check script, which its git hooks run. Every step
# either passes or fails the run: nothing is skipped, and a missing tool or
# an unreachable host is a failure.
#   scripts/check.sh commit   the pre-commit gate, refused while anything
#                             is unstaged or untracked, so that what is
#                             checked is what is committed
#   scripts/check.sh full     the pre-push gate: on a clean tree at the
#                             commit being pushed, the stage, the release
#                             build, and the stage again on
#                             $TELETEXT_LINUX_HOST, as the deploy host runs it
#   scripts/check.sh stage    Node, the locked tools, the type check and the
#                             tests: what both gates run, here or on the host
set -euo pipefail
cd "$(dirname "$0")/.."

mode="${1:-}"
# The Linux host of the neoteletext full gates (DEVELOPMENT.md section 12).
linux_host="${TELETEXT_LINUX_HOST:-foundintelquiet4060}"
# Node runs .ts files itself by stripping their types from 22.18 on.
readonly NODE_LEAST="22.18.0"
# The lockfile's SHA-256 when node_modules was installed from it, so a
# changed lockfile installs again.
readonly INSTALLED_FROM="node_modules/.installed-from.sha256"

step() { printf '\n== %s\n' "$*"; }
fail() {
    printf '\nFAILED: %s\n' "$*" >&2
    exit 1
}

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

commit_gate() {
    if [[ -z "$(git diff --cached --name-only)" ]]; then
        step "nothing staged"
        return
    fi
    local loose
    loose="$(git diff --name-only; git ls-files --others --exclude-standard)"
    [[ -z "$loose" ]] || fail "changes that are not staged would make this check test something other than the commit; stage or stash them:
$loose"
    stage
}

check_linux() {
    local here
    here="$(basename "$PWD")"
    step "Linux on $linux_host: the stage"
    ssh -o BatchMode=yes -o ConnectTimeout=10 "$linux_host" true || fail "$linux_host is unreachable; the full gate needs it"
    rsync -a --delete --exclude tmp --exclude .git --exclude node_modules --exclude dist ./ "$linux_host:$here-check/"
    ssh "$linux_host" "set -e; cd $here-check && scripts/check.sh stage"
}

full_gate() {
    # The commit being pushed is the one checked: the pre-push hook passes
    # the pushed commits, and the tree must be clean at HEAD.
    local pushed
    for pushed in "$@"; do
        [[ "$pushed" == "$(git rev-parse HEAD)" ]] || fail "pushing $pushed, but HEAD is $(git rev-parse HEAD); check out what you push"
    done
    local loose
    loose="$(git status --porcelain)"
    [[ -z "$loose" ]] || fail "the tree has changes that are not committed; the full gate checks the commit being pushed:
$loose"
    stage
    build
    check_linux
}

case "$mode" in
commit) commit_gate ;;
stage) stage ;;
build) build ;;
full)
    shift
    full_gate "$@"
    ;;
*) fail "usage: scripts/check.sh commit | stage | build | full [pushed commit]..." ;;
esac

step "All checks passed ($mode)"

#!/usr/bin/env bash
# Releases the package at package.json's version: on a clean tree, the
# checks, the build, and the packed package in tmp/release/, for a
# consumer to commit under its vendor/ and pin in its lockfile; the commit
# released is tagged v<version>. Raise the version, commit, then run it.
#   scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
    printf '\nFAILED: %s\n' "$*" >&2
    exit 1
}

[[ -z "$(git status --porcelain)" ]] || fail "the tree has changes that are not committed; a release is of a commit"
version="$(node -p 'require("./package.json").version')"
tag="v$version"
[[ -z "$(git tag --list "$tag")" ]] || fail "$tag is released already; raise the version in package.json"

scripts/check.sh stage
scripts/check.sh build
mkdir -p tmp/release
npm pack --pack-destination tmp/release --ignore-scripts
git tag "$tag"
printf '\nreleased %s: tmp/release/%s-%s.tgz\n' "$tag" "$(node -p 'require("./package.json").name')" "$version"

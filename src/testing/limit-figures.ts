// REQ-6608 (page-rules.md RULE-57): a limit of a page's rule table is
// written by its name, never by its figure, outside the engine's
// neoteletext_rules::limits and the copy generated from it. The lines of a
// repository's files that name a limit and also hold that limit's figure
// as a number of its own (16384, 16_384 or 16,384; not a digit of a longer
// number, a word or a clause such as RULE-4), as the server's
// scripts/limit-figures.sh finds them. The files are walked rather than
// asked of git, since the Linux host's copy has no repository. A channel's
// or a library's test calls it on its own repository.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import * as limits from "../rules/limits.ts";

/** The limits: every constant of the generated copy, by name and figure. */
const LIMITS: readonly (readonly [string, number])[] = Object.entries(limits);

/** The folders that are no source of the repository's: installed packages, builds, scratch and git's own. */
const NOT_SOURCE = new Set(["node_modules", "dist", "tmp", ".git", "vendor"]);

/** A digit group of three, as a figure's thousands may be written. */
const THOUSANDS = 3;

/** Every file under `root`, relative to it, but those in folders that are not source. */
function files(root: string, folder = root): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return NOT_SOURCE.has(entry.name) || entry.name === "generated" ? [] : files(root, path);
    }
    return entry.isFile() ? [relative(root, path)] : [];
  });
}

/** A pattern of `figure` alone: its thousands optionally separated by `_` or `,`. */
function figurePattern(figure: number): RegExp {
  const digits = String(figure);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= THOUSANDS) {
    groups.unshift(digits.slice(Math.max(0, end - THOUSANDS), end));
  }
  return new RegExp(`(^|[^0-9A-Za-z_.-])${groups.join("[_,]?")}($|[^0-9A-Za-z_])`, "u");
}

/** Each line of a file under `root`, but those `allowed`, that names a limit and holds its figure: `path:line: text`. */
export function limitFigureLines(root: string, allowed: readonly string[]): string[] {
  const found: string[] = [];
  for (const path of files(root).filter((file) => !allowed.includes(file))) {
    const text = readFileSync(join(root, path), "utf8");
    if (text.includes("\u0000")) {
      continue;
    }
    text.split("\n").forEach((line, at) => {
      for (const [name, figure] of LIMITS) {
        if (new RegExp(`\\b${name}\\b`, "u").test(line) && figurePattern(figure).test(line)) {
          found.push(`${path}:${at + 1}: ${name} is ${figure}: ${line.trim()}`);
        }
      }
    });
  }
  return found;
}

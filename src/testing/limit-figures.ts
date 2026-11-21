// REQ-6608 (page-rules.md RULE-57): a limit of a page's rule table is
// written by its name, never by its figure, outside the engine's
// neoteletext_rules::limits and the copy generated from it; and so is a
// limit of animation (animation.md ANIM-16), outside each renderer's
// `limits` and the copies generated from them. The lines of a
// repository's files that name a limit and also hold that limit's figure
// as a number of its own (16384, 16_384 or 16,384; not a digit of a longer
// number, a word or a clause such as RULE-4), as the server's
// scripts/limit-figures.sh finds them. The files are walked rather than
// asked of git, since the Linux host's copy has no repository. A channel's
// or a library's test calls it on its own repository.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import * as teletext from "../animation/teletext-limits.ts";
import * as naplps from "../picture/naplps-limits.ts";
import * as regis from "../picture/regis-limits.ts";
import * as limits from "../rules/limits.ts";

/**
 * The limits of animation (ANIM-16) by name and figure, those the shared call list's note names (kit-calls.tsv, "Each
 * kit also exports the limits of animation"): a name the renderers share is looked for with each renderer's figure.
 */
const ANIMATION_LIMITS: readonly (readonly [string, number])[] = [
  ["LAYERS", teletext.LAYERS],
  ["MAX_SPRITES", teletext.MAX_SPRITES],
  ["MAX_ANIMATED_OBJECTS", teletext.MAX_ANIMATED_OBJECTS],
  ["MAX_CYCLING_OBJECTS", teletext.MAX_CYCLING_OBJECTS],
  ["MAX_OBJECT_FRAMES", teletext.MAX_OBJECT_FRAMES],
  ["MAX_CONTROLS", teletext.MAX_CONTROLS],
  ["OBJECT_TYPES", teletext.OBJECT_TYPES],
  ["OBJECTS_PER_TYPE", teletext.OBJECTS_PER_TYPE],
  ["OBJECT_SUBPAGES", teletext.OBJECT_SUBPAGES],
  ["MAX_ANIMATED_DRAWINGS", regis.MAX_ANIMATED_DRAWINGS],
  ["MAX_CYCLING_OBJECTS", regis.MAX_CYCLING_OBJECTS],
  ["MAX_OBJECT_FRAMES", regis.MAX_OBJECT_FRAMES],
  ["MAX_OBJECTS", naplps.MAX_OBJECTS],
  ["MAX_ANIMATED_OBJECTS", naplps.MAX_ANIMATED_OBJECTS],
  ["MAX_CYCLING_OBJECTS", naplps.MAX_CYCLING_OBJECTS],
  ["MAX_OBJECT_FRAMES", naplps.MAX_OBJECT_FRAMES],
  ["DEFINABLE_CODES", naplps.DEFINABLE_CODES],
];

/** The limits: every constant of the rule table's generated copy and the limits of animation, each name and figure once. */
const LIMITS: readonly (readonly [string, number])[] = [
  ...new Map([...Object.entries(limits), ...ANIMATION_LIMITS].map((limit) => [limit.join(" "), limit] as const)).values(),
];

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

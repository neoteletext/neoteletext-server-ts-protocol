// The harness gives a lost release as the server does (DOC-1944, DOC-6600;
// the server's REQ-5548 and DEC-7065; TODO-7057): when a connection's
// selection changes, by `open` or the program's redirect, or it closes, the
// channel is first given a release, marked lost and named with its press's
// rule, row and tick, of each press whose release the page's table asks for,
// and of every press when the program gave the page no table, since the
// harness then stands for the default table, which asks for every release.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Context, Input, PageEntry } from "../../src/index.ts";
import { Harness } from "../../src/testing/index.ts";
import { INDEX, serving } from "./serving.ts";

/** The page a connection goes to from the index. */
const OTHER = 0x200;
/** The sub-code the index's table is for: the first sub-page, which a selection of the index shows. */
const TABLE_SUB = 0;
/** The sub-page of the index a test opens as another selection of the same page (RULE-112). */
const OTHER_SUB = 1;
/** The tick the tests' presses name, so that a lost release is seen to carry its press's. */
const PRESS_TICK = 5;
/** The rule the tests' presses name. */
const PRESSES = "down";
/** The key whose press makes the input handler redirect the connection. */
const REDIRECT_KEY = "r";

/** A rule table, as a program gives one. */
type RuleTable = Parameters<Context["rules"]>[3];

/** A rule that reports every key press and every button press. */
const PRESS_RULE = {
  name: PRESSES,
  on: [
    { event: "key", keys: "any" },
    { event: "press", target: "page", button: "any" },
  ],
  do: [{ type: "report" }],
} as const;

/** A table of the press rule and one more rule on `trigger`. */
function pressesAnd(trigger: object): RuleTable {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the tests' tables are written as the schema has them, and the channel's App checks each as it is written
  return { rules: [PRESS_RULE, { name: "up", on: trigger, do: [{ type: "report" }] }] } as unknown as RuleTable;
}

/** A table that reports key presses and asks for no key's release, but for the release of button 0. */
const NO_KEY_UP = pressesAnd({ event: "release", target: "page", button: 0 });
/** A table that asks for the release of the key `a`. */
const KEY_UP_A = pressesAnd({ event: "key_up", keys: [{ char: "b" }, { char: "a" }] });
/** A table that asks for the release of every key. */
const KEY_UP_ANY = pressesAnd({ event: "key_up", keys: "any" });

/** What the index's application was told, in order: an input, or the connection leaving a page. */
type Told = { readonly kind: "input"; readonly page: number; readonly input: Input } | { readonly kind: "left"; readonly page: number };

/**
 * A harness of the index and another page, connection 1 on the index, whose
 * program gives the index `table` (none when null) each time the index is
 * opened, and redirects the connection to the other page when it is told the
 * press of `REDIRECT_KEY`; and everything the program was told after the join.
 */
function onTheIndex(table: RuleTable | null): { readonly harness: Harness; readonly told: Told[] } {
  const told: Told[] = [];
  const harness = new Harness([
    {
      ...serving([INDEX, OTHER], {}),
      pages: (): PageEntry[] => [INDEX, OTHER].map((page) => ({ page, title: "Page", ownsDigits: true, ownsColourKeys: true })),
      opened: (connection, page, context): void => {
        if (table !== null && page === INDEX) {
          context.rules({ connection }, INDEX, TABLE_SUB, table);
        }
      },
      leftPage: (_connection, page): void => {
        told.push({ kind: "left", page });
      },
      input: (connection, page, input, context): boolean => {
        told.push({ kind: "input", page, input });
        if (input.kind === "key" && input.action === "press" && input.key === REDIRECT_KEY) {
          context.redirect(connection, OTHER);
        }
        return true;
      },
    },
  ]);
  harness.join(1, INDEX);
  return { harness, told };
}

/** Presses `key` on connection 1, named with the press rule at `PRESS_TICK`. */
function pressKey(harness: Harness, key: string): void {
  harness.send(1, { kind: "key", action: "press", key, rule: PRESSES, tick: PRESS_TICK });
}

/** Presses button `button` on connection 1, named with the press rule at `PRESS_TICK`. */
function pressButton(harness: Harness, button: number): void {
  harness.send(1, { kind: "mouse", action: "press", button, column: 3, row: 4, rule: PRESSES, tick: PRESS_TICK });
}

/** Whether `told` is an input marked lost. */
function isLost(told: Told): boolean {
  // An input marked lost carries `lost: true`, the one value the type allows.
  return told.kind === "input" && "lost" in told.input && told.input.lost !== undefined;
}

/** What `input` releases: its key, its button, or else its kind. */
function releasedBy(input: Input): string | number {
  if (input.kind === "key") {
    return input.key;
  }
  if ("button" in input) {
    return input.button;
  }
  return input.kind;
}

/** The lost releases among `told`, each as what it releases, its page, rule, row and tick. */
function lostReleases(told: readonly Told[]): unknown[] {
  return told.flatMap((one) => {
    if (one.kind !== "input" || !isLost(one)) {
      return [];
    }
    const { input } = one;
    const action = "action" in input ? input.action : undefined;
    return [{ kind: input.kind, action, what: releasedBy(input), page: one.page, rule: input.rule, ruleRow: input.ruleRow, tick: input.tick }];
  });
}

/** The lost release of key `key` pressed on the index, as `lostReleases` gives it. */
function lostKey(key: string): unknown {
  return { kind: "key", action: "release", what: key, page: INDEX, rule: PRESSES, ruleRow: null, tick: PRESS_TICK };
}

/** The lost release of button `button` pressed on the index, as `lostReleases` gives it. */
function lostButton(button: number): unknown {
  return { kind: "mouse", action: "release", what: button, page: INDEX, rule: PRESSES, ruleRow: null, tick: PRESS_TICK };
}

/** Checks that every lost release in `told` comes before the index's `left`, which is told. */
function lostBeforeLeft(told: readonly Told[], why: string): void {
  const left = told.findIndex((one) => one.kind === "left" && one.page === INDEX);
  assert.notEqual(left, -1, `${why}: the index is left`);
  const late = told.slice(left).filter((one) => isLost(one));
  assert.deepEqual(late, [], `${why}: no lost release after left`);
}

/** The ways a connection leaves the index after its presses. */
const LEAVINGS: readonly { readonly name: string; readonly leave: (harness: Harness, told: readonly Told[]) => void }[] = [
  {
    name: "open of another page",
    leave: (harness): void => {
      harness.open(1, OTHER);
    },
  },
  {
    name: "close",
    leave: (harness): void => {
      harness.close(1);
    },
  },
  {
    // The program's redirect in its input handler, then the SELECT the
    // receiver sends after a redirect (DOC-1960), which repeats it: the
    // releases are the redirect's, and the SELECT gives none again.
    name: "redirect from the input handler",
    leave: (harness, told): void => {
      pressKey(harness, REDIRECT_KEY);
      const atTheRedirect = lostReleases(told);
      assert.notDeepEqual(atTheRedirect, [], "given at the redirect");
      harness.open(1, OTHER);
      assert.deepEqual(lostReleases(told), atTheRedirect, "none again at the SELECT that follows the redirect");
    },
  },
];

test("DEC-7065: a key press on a page whose table asks for no key's release gives no lost release, while a button whose release it asks for does", () => {
  for (const { name, leave } of LEAVINGS) {
    const { harness, told } = onTheIndex(NO_KEY_UP);
    pressKey(harness, "a");
    pressButton(harness, 0);
    leave(harness, told);
    assert.deepEqual(lostReleases(told), [lostButton(0)], name);
    lostBeforeLeft(told, name);
  }
});

test("DEC-7065: a key press on a page whose table has a key_up rule including the key gives one lost release, named as its press, before left", () => {
  for (const table of [KEY_UP_A, KEY_UP_ANY]) {
    for (const { name, leave } of LEAVINGS) {
      const { harness, told } = onTheIndex(table);
      pressKey(harness, "a");
      leave(harness, told);
      const expected = table === KEY_UP_ANY && name.startsWith("redirect") ? [lostKey("a"), lostKey(REDIRECT_KEY)] : [lostKey("a")];
      assert.deepEqual(lostReleases(told), expected, `${JSON.stringify(table)}, ${name}`);
      lostBeforeLeft(told, name);
    }
  }
});

test("DEC-7065: with no table from the program, the default table's, every press gives its lost release", () => {
  for (const { name, leave } of LEAVINGS) {
    const { harness, told } = onTheIndex(null);
    pressKey(harness, "a");
    pressButton(harness, 2);
    leave(harness, told);
    const expected = name.startsWith("redirect") ? [lostKey("a"), lostButton(2), lostKey(REDIRECT_KEY)] : [lostKey("a"), lostButton(2)];
    assert.deepEqual(lostReleases(told), expected, name);
    lostBeforeLeft(told, name);
  }
});

test("DOC-1944: a press whose real release was given gives no lost release; one still held does", () => {
  const { harness, told } = onTheIndex(KEY_UP_ANY);
  pressKey(harness, "a");
  harness.send(1, { kind: "key", action: "release", key: "a", rule: "up", tick: PRESS_TICK + 1 });
  pressKey(harness, "b");
  harness.open(1, OTHER);
  assert.deepEqual(lostReleases(told), [lostKey("b")]);
});

test("DOC-1944: opening the same page, sub-page and query again changes no selection and gives no lost release; another sub-page or query does", () => {
  const { harness, told } = onTheIndex(KEY_UP_ANY);
  harness.open(1, INDEX, TABLE_SUB, "q=1");
  pressKey(harness, "a");
  harness.open(1, INDEX, TABLE_SUB, "q=1");
  assert.deepEqual(lostReleases(told), [], "the same selection");
  harness.open(1, INDEX, TABLE_SUB, "q=2");
  assert.deepEqual(lostReleases(told), [lostKey("a")], "another query");
  pressKey(harness, "c");
  harness.open(1, INDEX, OTHER_SUB, "q=2");
  assert.deepEqual(lostReleases(told), [lostKey("a"), lostKey("c")], "another sub-page");
});

// Small builders of a rule table's pieces (page-rules.md RULE-55): each only
// constructs the object the schema's type gives, and checks nothing. A
// table is otherwise written as the typed object of RULE-35.

import type { KeyName, RuleKey, RuleValueSound } from "../wire/generated/protocol.js";

/** The key that carries `character` on a United States layout, whatever the viewer's layout (RULE-10): a musical keyboard's keys. */
export function physicalKey(character: string): RuleKey {
  return { physical: character };
}

/** The key the viewer's layout gives `character` without Shift (RULE-10). */
export function characterKey(character: string): RuleKey {
  return { char: character };
}

/** A functional key by its name (RULE-10; DOC-1936). */
export function namedKey(name: KeyName): RuleKey {
  return { name };
}

/** The output level of audio channel `channel`, 0 to 255, over the last tick (RULE-27, RULE-32): the value a meter's `becomes` rules read. */
export function level(channel: number): RuleValueSound {
  return { of: "sound", channel, property: "level" };
}

// What a link target is, read as the engine reads one (Appendix E.1 and the
// web-native concept section 3, decision E.88): a port of
// neoteletext-formats' src/tti/targets.rs (`parse_target`, `link_target`,
// `is_link_address`) and src/tti/fields.rs (`page_address`, `subcode`,
// `service_name`) at the engine commit 4ddd34b the server pins, which the
// server's check.rs (`target`) uses to refuse a target in no form.

/** A target's kind: a page of this service, a page of another service or an address, or a web page to open outside teletext. */
export type TargetKind = "here" | "elsewhere" | "web";

/** The mark of a web page (the engine's page::WEB_MARK). */
const WEB_MARK = "web:";
/** What makes a target an address rather than a page or a named service (concept section 3). */
const ADDRESS_MARK = "://";
/** The schemes an address in a page may use, compared without case. */
const ADDRESS_SCHEMES = ["https://", "http://"] as const;
/** The longest service name, in bytes (the engine's page::SERVICE_NAME_BYTES). */
const SERVICE_NAME_BYTES = 32;
/** Digits of a page number and of a sub-code. */
const PAGE_DIGITS = 3;
const SUBCODE_DIGITS = 4;
/** A page number's magazine digit is 1 to 8 (the engine's PageAddress::from_mpp). */
const MAGAZINE = /^[1-8]$/u;
const HEX_DIGITS = /^[0-9A-Fa-f]+$/u;
/** Printable ASCII without a space or a comma (the server's target and the engine's is_link_address). */
const TARGET_CHARACTERS = /^[!-+\--~]+$/u;
const SERVICE_NAME = /^[A-Za-z0-9-]+$/u;

/** An address of `http` or `https`, alone or after `web:`, kept whole (the engine's is_link_address). */
function isLinkAddress(text: string): boolean {
  const address = text.startsWith(WEB_MARK) ? text.slice(WEB_MARK.length) : text;
  const lower = address.toLowerCase();
  return ADDRESS_SCHEMES.some((scheme) => lower.startsWith(scheme)) && TARGET_CHARACTERS.test(text);
}

function isPageAddress(text: string): boolean {
  return text.length === PAGE_DIGITS && HEX_DIGITS.test(text) && MAGAZINE.test(text.charAt(0));
}

function isSubcode(text: string): boolean {
  return text.length === SUBCODE_DIGITS && HEX_DIGITS.test(text);
}

function isServiceName(text: string): boolean {
  return SERVICE_NAME.test(text) && text.length <= SERVICE_NAME_BYTES;
}

/** `mpp`, `mpp:ssss`, `name:mpp` or `name:mpp:ssss`, with whether it names a service (the engine's link_target). */
function pageTarget(text: string): "here" | "elsewhere" | null {
  const parts = text.split(":");
  const [first = "", second, third] = parts;
  if (parts.length > PAGE_DIGITS) {
    return null;
  }
  if (second === undefined) {
    return isPageAddress(first) ? "here" : null;
  }
  if (third === undefined) {
    if (isPageAddress(first) && isSubcode(second)) {
      return "here";
    }
    return isServiceName(first) && isPageAddress(second) ? "elsewhere" : null;
  }
  return isServiceName(first) && isPageAddress(second) && isSubcode(third) ? "elsewhere" : null;
}

/**
 * A target's kind, or null for a target in no form of Appendix E.1 (the
 * server's check.rs `target`). Its length is not looked at here: the
 * longest target is `start`'s `link_target_bytes`, which the schema
 * states and the server's rules check (page-rules.ts).
 */
export function targetKind(text: string): TargetKind | null {
  if (!TARGET_CHARACTERS.test(text)) {
    return null;
  }
  if (text.startsWith(WEB_MARK) || text.includes(ADDRESS_MARK)) {
    if (!isLinkAddress(text)) {
      return null;
    }
    return text.startsWith(WEB_MARK) ? "web" : "elsewhere";
  }
  return pageTarget(text);
}

/** A key link's longest label: 9 characters for a page of this service, 8 for another service or the web (the server's LINK_LABEL_CHARACTERS and OTHER_SERVICE_LABEL_CHARACTERS; Appendix E.2). */
const LABEL_HERE = 9;
const LABEL_ELSEWHERE = 8;

/** The longest label a key link to a target of `kind` may have. */
export function longestLabel(kind: TargetKind): number {
  return kind === "here" ? LABEL_HERE : LABEL_ELSEWHERE;
}

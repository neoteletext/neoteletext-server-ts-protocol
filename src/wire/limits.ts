// The protocol's bounds (docs/applications.md): what either side may send.

/** The protocol's version, in `start` (docs/applications.md). */
export const PROTOCOL = 1;

/** The longest line either side may send (docs/applications.md section 1): 16 MiB. */
export const LONGEST_LINE = 16 * 1024 * 1024;

/** The most pages a program may declare (docs/applications.md section 3.1). */
export const MOST_PAGES = 800;

/** The longest page title, and section name, the server takes (section 3.1): the engine's `contents::MAX_TITLE`, a whole headline (its decision E.120), as the Python kit's TITLE_LIMIT. */
export const LONGEST_TITLE = 120;

/** The most sub-pages one publication may hold (docs/applications.md section 3.2). */
export const MOST_SUBPAGES = 64;

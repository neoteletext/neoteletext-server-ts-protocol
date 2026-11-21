// Painting as a show (DEC-7031 items 1 and 6; REQ-7024, REQ-7025): what a
// program may say, when it begins a sub-page's ReGIS or NAPLPS stream again,
// of how the receiver paints that generation of it. A line speed replays the
// stream as if its bytes arrived over a serial line of that speed, ten bits a
// byte; a default paint rate is the rate every ReGIS numbered drawing takes
// that sets no `T` of its own. The bounds are the engine's, by its
// neoteletext-web constants MIN_LINE_SPEED, MAX_LINE_SPEED and
// MAX_DEFAULT_PAINT_RATE (crates/neoteletext-web/src/consts.rs), which the
// server holds a program's values to; the kit refuses what the server would
// (`invalid_paint`) before anything is written.

/** The slowest line speed, in bits a second: the engine's MIN_LINE_SPEED, the speed of the earliest videotex modems. */
export const LINE_SPEED_MIN = 300;
/** The fastest line speed, in bits a second: the engine's MAX_LINE_SPEED, the fastest of the standard serial speeds. */
export const LINE_SPEED_MAX = 115_200;
/** The least default paint rate: a ReGIS numbered drawing's least `T` that paints gradually (DEC-6382 item 1; 0 there is at once, which a program says by giving no rate). */
export const DEFAULT_PAINT_RATE_MIN = 1;
/** The greatest default paint rate: the engine's MAX_DEFAULT_PAINT_RATE, the greatest `T` of a ReGIS numbered drawing (DEC-6382 item 1). */
export const DEFAULT_PAINT_RATE_MAX = 32_767;

/** The line speeds a program names rather than writes (DEC-7031 item 1), in bits a second: 300, which is also the slowest a line may be. */
export const LINE_SPEED_300 = 300;
/** 1,200 bits a second: the line NAPLPS pictures arrived over (REQ-7024). */
export const LINE_SPEED_1200 = 1200;
/** 2,400 bits a second. */
export const LINE_SPEED_2400 = 2400;
/** 9,600 bits a second. */
export const LINE_SPEED_9600 = 9600;

/** How a NAPLPS stream is sent: whether it begins again, and how that generation is painted. */
export interface NaplpsStreamOptions {
  /** Begin the sub-page's stream again: a new generation, with nothing drawn. */
  readonly restart?: boolean;
  /** The line speed the generation is painted at, {@link LINE_SPEED_MIN} to {@link LINE_SPEED_MAX} bits a second; only with `restart` (REQ-7024). */
  readonly lineSpeed?: number;
}

/** How a ReGIS stream is sent: as {@link NaplpsStreamOptions}, and the generation's default paint rate. */
export interface RegisStreamOptions extends NaplpsStreamOptions {
  /** The rate every numbered drawing of the generation takes that sets no `T` of its own, {@link DEFAULT_PAINT_RATE_MIN} to {@link DEFAULT_PAINT_RATE_MAX}; only with `restart` (REQ-7025). */
  readonly defaultRate?: number;
}

/** A stream's options as its message's fields, in the message's order: `restart` always, a line speed and a default rate when given. */
export function streamFields(options: RegisStreamOptions): { readonly restart: boolean; readonly line_speed?: number; readonly default_rate?: number } {
  return {
    restart: options.restart === true,
    ...(options.lineSpeed === undefined ? {} : { line_speed: options.lineSpeed }),
    ...(options.defaultRate === undefined ? {} : { default_rate: options.defaultRate }),
  };
}

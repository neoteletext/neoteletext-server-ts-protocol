// Pseudo-random numbers for games: xorshift64*, as the runtime's
// `Context::random`.

/** The 64 bits of xorshift64*'s state. */
const STATE_BITS = 64;

/** The multiplier of xorshift64* (Vigna 2016, "An experimental exploration of Marsaglia's xorshift generators"). */
const XORSHIFT_MULTIPLIER = 0x2545_f491_4f6c_dd1dn;

/** Its three shifts. */
const SHIFT_A = 12n;

const SHIFT_B = 25n;

const SHIFT_C = 27n;

/** The output is the product's top 32 bits. */
const OUTPUT_SHIFT = 32n;

/**
 * Pseudo-random numbers from a seed (xorshift64*, as the runtime's
 * `Context::random`): for games, never for secrets.
 */
export class Random {
  #state: bigint;

  /** Numbers from `seed`; xorshift needs a state other than zero. */
  constructor(seed: bigint) {
    this.#state = BigInt.asUintN(STATE_BITS, seed) | 1n;
  }

  /** The next number, 0 to 2^32 - 1. */
  next(): number {
    let state = this.#state;
    state ^= state >> SHIFT_A;
    state = BigInt.asUintN(STATE_BITS, state ^ (state << SHIFT_B));
    state ^= state >> SHIFT_C;
    this.#state = state;
    return Number(BigInt.asUintN(STATE_BITS, state * XORSHIFT_MULTIPLIER) >> OUTPUT_SHIFT);
  }

  /** A number below `bound`; 0 when `bound` is 0. */
  below(bound: number): number {
    return bound > 0 ? this.next() % bound : 0;
  }
}

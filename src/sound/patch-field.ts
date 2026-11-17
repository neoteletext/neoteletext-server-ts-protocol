// The checks every analogue synthesizer's packer makes of a field before
// it writes it (DEC-6429): a fault is a RangeError that names the
// instrument, the field as its panel names it, its range and the value.

/** `value`, once it is a whole number from `least` to `most`. */
export function whole(instrument: string, name: string, value: number, least: number, most: number): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`${instrument}: ${name} is ${least} to ${most}, not ${value}`);
  }
  return value;
}

/** The position of `value` among `positions`, the switch's positions from its first. */
export function position<T>(instrument: string, name: string, value: T, positions: readonly T[]): number {
  const at = positions.indexOf(value);
  if (at === -1) {
    throw new RangeError(`${instrument}: ${name} is one of ${positions.map(String).join(", ")}, not ${String(value)}`);
  }
  return at;
}

/** A switch's value, once it is a boolean. */
export function onOff(instrument: string, name: string, value: boolean): boolean {
  if (typeof value !== "boolean") {
    throw new RangeError(`${instrument}: ${name} is true or false, not ${String(value)}`);
  }
  return value;
}

// Red, green and blue percentages as the VT340's hue, lightness and
// saturation (manual chapter 2, "HLS System"): the integer values whose
// colour, as the ReGIS renderer turns HLS back into red, green and blue
// (its palette/hls.rs, followed here step for step), is nearest the colour
// asked for. The manual's RGB system names eight colours by letter and takes
// no values, so HLS is how a program gives any other.

/** Percent at full (manual chapter 2: lightness and saturation 0 to 100). */
const FULL = 100;
/** Degrees in a circle, and in each of its six sectors. */
const CIRCLE = 360;
const SECTOR = 60;
/** DEC puts blue at hue 0, red at 120 and green at 240; the usual colour wheel puts red at 0 (the renderer's DEC_HUE_OFFSET). */
const DEC_HUE_OFFSET = 240;
/** The sectors of the usual wheel, red at 0: which components take the chroma and the second value. */
const SECTORS = 6;
/** How far either way of the rounded values the search looks for the nearest colour. */
const SEARCH = 2;

/** A VT340 colour as hue, lightness and saturation. */
export interface Hls {
  readonly hue: number;
  readonly lightness: number;
  readonly saturation: number;
}

/** The renderer's hls_to_rgb: integer red, green and blue percentages of a hue in degrees and a lightness and saturation in percent. */
export function rgbOf({ hue, lightness, saturation }: Hls): readonly [number, number, number] {
  const turned = ((((hue % CIRCLE) + CIRCLE) % CIRCLE) + DEC_HUE_OFFSET) % CIRCLE;
  const light = Math.min(Math.max(lightness, 0), FULL);
  const saturated = Math.min(Math.max(saturation, 0), FULL);
  const chroma = (FULL - Math.abs(2 * light - FULL)) * saturated;
  const second = Math.trunc((chroma * (SECTOR - Math.abs((turned % (2 * SECTOR)) - SECTOR))) / SECTOR);
  const floor = light * FULL - Math.trunc(chroma / 2);
  const parts: readonly (readonly [number, number, number])[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const [red, green, blue] = parts[Math.min(Math.trunc(turned / SECTOR), SECTORS - 1)] ?? [0, 0, 0];
  const percent = (part: number): number => Math.min(Math.max(Math.trunc((part + floor + FULL / 2) / FULL), 0), FULL);
  return [percent(red), percent(green), percent(blue)];
}

/** The usual hue, lightness and saturation of red, green and blue percentages, the hue turned to DEC's, unrounded. */
function exact(red: number, green: number, blue: number): Hls {
  const [r, g, b] = [red / FULL, green / FULL, blue / FULL];
  const most = Math.max(r, g, b);
  const least = Math.min(r, g, b);
  const lightness = (most + least) / 2;
  const chroma = most - least;
  if (chroma === 0) {
    return { hue: 0, lightness: lightness * FULL, saturation: 0 };
  }
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  let wheel: number;
  if (most === r) {
    wheel = ((g - b) / chroma + SECTORS) % SECTORS;
  } else if (most === g) {
    wheel = (b - r) / chroma + 2;
  } else {
    wheel = (r - g) / chroma + 4;
  }
  const hue = (wheel * SECTOR - DEC_HUE_OFFSET + CIRCLE) % CIRCLE;
  return { hue, lightness: lightness * FULL, saturation: saturation * FULL };
}

/** The integer hue, lightness and saturation the renderer turns into the colour nearest `red`, `green` and `blue`, percentages. */
export function hlsOf(red: number, green: number, blue: number): Hls {
  const near = exact(red, green, blue);
  const distanceOf = (tried: Hls): number => {
    const [r, g, b] = rgbOf(tried);
    return (r - red) ** 2 + (g - green) ** 2 + (b - blue) ** 2;
  };
  // The rounded values unless another near them comes back nearer.
  let best: Hls = { hue: Math.round(near.hue) % CIRCLE, lightness: Math.round(near.lightness), saturation: Math.round(near.saturation) };
  let bestDistance = distanceOf(best);
  for (let hue = -SEARCH; hue <= SEARCH; hue += 1) {
    for (let lightness = -SEARCH; lightness <= SEARCH; lightness += 1) {
      for (let saturation = -SEARCH; saturation <= SEARCH; saturation += 1) {
        const tried: Hls = {
          hue: (((Math.round(near.hue) + hue) % CIRCLE) + CIRCLE) % CIRCLE,
          lightness: Math.min(Math.max(Math.round(near.lightness) + lightness, 0), FULL),
          saturation: Math.min(Math.max(Math.round(near.saturation) + saturation, 0), FULL),
        };
        const distance = distanceOf(tried);
        if (distance < bestDistance) {
          best = tried;
          bestDistance = distance;
        }
      }
    }
  }
  return best;
}

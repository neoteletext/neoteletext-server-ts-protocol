// A synth6581 sound's images gathered step by step (REQ-6414 item 1): a program
// sets the registers it wants on one Synth6581Image, pushes it once for each
// step of time, and takes the bytes a `synth6581` or `synth6581Blocks` member carries.

import type { RegisterMember, Synth6581Clock } from "./instrument-members.ts";
import {
  INSTRUMENT_BLOCK_MS,
  type ImagesPerBlock,
  MOST_INSTRUMENT_BLOCKS,
  type RegisterSynth,
  SYNTH6581_IMAGE_BYTES,
  SYNTH6581_IMAGES_PER_BLOCK,
} from "./instrument-profile.ts";
import type { Synth6581Image } from "./synth6581-image.ts";

/** What a stored sound says of itself besides its images. */
export interface Synth6581SoundOptions {
  readonly handle: number;
  readonly generation: number;
  readonly clock?: Synth6581Clock;
}

function join(images: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(images.length * SYNTH6581_IMAGE_BYTES);
  for (const [index, image] of images.entries()) {
    bytes.set(image, index * SYNTH6581_IMAGE_BYTES);
  }
  return bytes;
}

/** A run of images, one a step: a step is 20 ms, or 10 or 5 ms when a block holds 2 or 4 images. It holds at most two minutes, a stored sound's most; a live sound's track is emptied as it goes by `take`. */
export class Synth6581Track {
  readonly imagesPerBlock: ImagesPerBlock;
  #images: Uint8Array[] = [];

  constructor(imagesPerBlock: ImagesPerBlock = 1) {
    if (!SYNTH6581_IMAGES_PER_BLOCK.includes(imagesPerBlock)) {
      throw new RangeError(`synth6581: a block holds 1, 2 or 4 images, not ${String(imagesPerBlock)}`);
    }
    this.imagesPerBlock = imagesPerBlock;
  }

  /** How long each image plays for, in milliseconds. */
  get stepMs(): number {
    return INSTRUMENT_BLOCK_MS / this.imagesPerBlock;
  }

  /** The images it holds. */
  get steps(): number {
    return this.#images.length;
  }

  /** How long what it holds plays for, in milliseconds. */
  get lengthMs(): number {
    return this.#images.length * this.stepMs;
  }

  /** Adds the registers as `image` has them now, held for `steps` steps; the image may be changed and pushed again. */
  push(image: Synth6581Image, steps = 1): this {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError(`synth6581: an image is held for a whole number of steps, not ${steps}`);
    }
    if (this.#images.length + steps > MOST_INSTRUMENT_BLOCKS * this.imagesPerBlock) {
      throw new RangeError(`synth6581: a track holds at most ${MOST_INSTRUMENT_BLOCKS} blocks, two minutes`);
    }
    const bytes = image.bytes();
    for (let step = 0; step < steps; step += 1) {
      this.#images.push(bytes);
    }
    return this;
  }

  /** Every image as whole blocks, back to back: a part block at the end is filled by holding the last image. */
  images(): Uint8Array {
    const last = this.#images.at(-1);
    const short = (this.imagesPerBlock - (this.#images.length % this.imagesPerBlock)) % this.imagesPerBlock;
    return join(last === undefined ? [] : [...this.#images, ...Array.from({ length: short }, () => last)]);
  }

  /** The whole blocks it holds, removed from it, for a live sound's next `synth6581Blocks`; images that do not yet fill a block stay. Empty when it holds no whole block. */
  take(): Uint8Array {
    const whole = this.#images.length - (this.#images.length % this.imagesPerBlock);
    const taken = this.#images.slice(0, whole);
    this.#images = this.#images.slice(whole);
    return join(taken);
  }

  /** What it holds as a stored sound of `synth`, a synth6581 or a synth8580: the member `context.sound(to, member)` sends. */
  sound(synth: RegisterSynth, options: Synth6581SoundOptions): RegisterMember {
    const sound = { ...options, imagesPerBlock: this.imagesPerBlock, images: this.images() };
    return synth === "synth6581" ? { synth6581: sound } : { synth8580: sound };
  }
}

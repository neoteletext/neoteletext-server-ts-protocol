// A SID sound's images gathered step by step (REQ-6414 item 1): a program
// sets the registers it wants on one SidImage, pushes it once for each
// step of time, and takes the bytes a `sid` or `sidBlocks` member carries.

import type { SidChip, SidClock, SidSound } from "./instrument-members.ts";
import { INSTRUMENT_BLOCK_MS, type ImagesPerBlock, MOST_INSTRUMENT_BLOCKS, SID_IMAGE_BYTES, SID_IMAGES_PER_BLOCK } from "./instrument-profile.ts";
import type { SidImage } from "./sid-image.ts";

/** What a stored sound says of itself besides its images. */
export interface SidSoundOptions {
  readonly handle: number;
  readonly generation: number;
  readonly chip?: SidChip;
  readonly clock?: SidClock;
}

function join(images: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(images.length * SID_IMAGE_BYTES);
  for (const [index, image] of images.entries()) {
    bytes.set(image, index * SID_IMAGE_BYTES);
  }
  return bytes;
}

/** A run of images, one a step: a step is 20 ms, or 10 or 5 ms when a block holds 2 or 4 images. It holds at most two minutes, a stored sound's most; a live sound's track is emptied as it goes by `take`. */
export class SidTrack {
  readonly imagesPerBlock: ImagesPerBlock;
  #images: Uint8Array[] = [];

  constructor(imagesPerBlock: ImagesPerBlock = 1) {
    if (!SID_IMAGES_PER_BLOCK.includes(imagesPerBlock)) {
      throw new RangeError(`sid: a block holds 1, 2 or 4 images, not ${String(imagesPerBlock)}`);
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
  push(image: SidImage, steps = 1): this {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError(`sid: an image is held for a whole number of steps, not ${steps}`);
    }
    if (this.#images.length + steps > MOST_INSTRUMENT_BLOCKS * this.imagesPerBlock) {
      throw new RangeError(`sid: a track holds at most ${MOST_INSTRUMENT_BLOCKS} blocks, two minutes`);
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

  /** The whole blocks it holds, removed from it, for a live sound's next `sidBlocks`; images that do not yet fill a block stay. Empty when it holds no whole block. */
  take(): Uint8Array {
    const whole = this.#images.length - (this.#images.length % this.imagesPerBlock);
    const taken = this.#images.slice(0, whole);
    this.#images = this.#images.slice(whole);
    return join(taken);
  }

  /** What it holds as a stored sound, the member `context.sound(to, { sid })` sends. */
  sound(options: SidSoundOptions): SidSound {
    return { ...options, imagesPerBlock: this.imagesPerBlock, images: this.images() };
  }
}

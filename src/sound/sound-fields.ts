// A sound message's member as the protocol writes it, with samples as
// base64 of 16-bit little-endian mono PCM, which the server encodes as IMA
// ADPCM. Each member is checked here as the server checks it, so a mistake
// is caught where it is made rather than refused in the server's log.

import { isPageNumber, pageText } from "../page/page-numbers.ts";
import type { SoundMember } from "./members.ts";
import {
  AUDIO_CHANNELS,
  DEEPEST_DUCK,
  FULL_GAIN,
  LAST_BLOCK,
  LAST_GENERATION,
  LAST_HANDLE,
  LONGEST_FADE_MS,
  MOST_SAMPLES,
  SAMPLE_BYTES,
  SAMPLE_RATES,
} from "./profile.ts";

/** `samples` as base64 of 16-bit little-endian samples (RFC 4648 section 4). */
export function pcmBase64(samples: Int16Array): string {
  const bytes = new DataView(new ArrayBuffer(samples.length * SAMPLE_BYTES));
  samples.forEach((sample, index) => {
    bytes.setInt16(index * SAMPLE_BYTES, sample, true);
  });
  return Buffer.from(bytes.buffer).toString("base64");
}

function wholeIn(name: string, value: number, least: number, most: number): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`sound: ${name} is ${least} to ${most}, not ${value}`);
  }
  return value;
}

function handleFields(sound: { readonly handle: number; readonly generation: number }): Record<string, number> {
  return { handle: wholeIn("handle", sound.handle, 0, LAST_HANDLE), generation: wholeIn("generation", sound.generation, 0, LAST_GENERATION) };
}

function rateOf(rate: number): number {
  if (!(SAMPLE_RATES as readonly number[]).includes(rate)) {
    throw new RangeError(`sound: ${rate} is not one of the profile's rates`);
  }
  return rate;
}

function samplesOf(samples: Int16Array): string {
  if (samples.length > MOST_SAMPLES) {
    throw new RangeError(`sound: at most ${MOST_SAMPLES} samples, not ${samples.length}`);
  }
  return pcmBase64(samples);
}

function fade(fadeMs: number | undefined): Record<string, number> {
  return fadeMs === undefined ? {} : { fade_ms: wholeIn("fade_ms", fadeMs, 0, LONGEST_FADE_MS) };
}

function pageOf(page: number): string {
  if (!isPageNumber(page)) {
    throw new RangeError(`sound: ${page} is not a page number`);
  }
  return pageText(page);
}

function channelOf(channel: number): number {
  return wholeIn("channel", channel, 0, AUDIO_CHANNELS - 1);
}

/** The member as the protocol writes it, checked as the server checks it. */
export function soundFields(member: SoundMember): Record<string, unknown> {
  if ("object" in member) {
    const { object } = member;
    return { object: { ...handleFields(object), rate: rateOf(object.rate), pcm: samplesOf(object.samples) } };
  }
  if ("live" in member) {
    return { live: { ...handleFields(member.live), rate: rateOf(member.live.rate) } };
  }
  if ("blocks" in member) {
    const { blocks } = member;
    return {
      blocks: { ...handleFields(blocks), rate: rateOf(blocks.rate), first: wholeIn("first", blocks.first, 0, LAST_BLOCK), pcm: samplesOf(blocks.samples) },
    };
  }
  if ("play" in member) {
    const { play } = member;
    return {
      play: {
        channel: channelOf(play.channel),
        ...handleFields(play),
        ...(play.gain === undefined ? {} : { gain: wholeIn("gain", play.gain, 0, FULL_GAIN) }),
        ...fade(play.fadeMs),
        ...(play.loop === undefined ? {} : { loop: play.loop }),
        ...(play.after === undefined ? {} : { after: play.after }),
        ...(play.duck === undefined ? {} : { duck: wholeIn("duck", play.duck, 0, DEEPEST_DUCK) }),
        ...(play.page === undefined ? {} : { page: pageOf(play.page) }),
      },
    };
  }
  if ("stop" in member) {
    return { stop: { channel: channelOf(member.stop.channel), ...fade(member.stop.fadeMs) } };
  }
  const { gain } = member;
  return { gain: { channel: channelOf(gain.channel), gain: wholeIn("gain", gain.gain, 0, FULL_GAIN), ...fade(gain.fadeMs) } };
}

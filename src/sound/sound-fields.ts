// A sound message's fields as the protocol writes them, by kind, with samples as
// base64 of 16-bit little-endian mono PCM, which the server encodes as IMA
// ADPCM. Each member is checked here as the server checks it, so a mistake
// is caught where it is made rather than refused in the server's log.

import { isPageNumber, pageText } from "../page/page-numbers.ts";
import type { SoundMember } from "./members.ts";
import { pcmBytes } from "./pcm.ts";
import { opusFields, opusLiveFields, opusPacketsFields } from "./opus-fields.ts";
import {
  AUDIO_CHANNELS,
  DEEPEST_DUCK,
  FULL_GAIN,
  LAST_BLOCK,
  LAST_GENERATION,
  LAST_HANDLE,
  LONGEST_FADE_MS,
  MOST_SAMPLES,
  SAMPLE_RATES,
  type SampleRate,
} from "./profile.ts";
import type { WireSound } from "../wire/protocol.ts";

/** `samples` as base64 of 16-bit little-endian samples (RFC 4648 section 4). */
export function pcmBase64(samples: Int16Array): string {
  return Buffer.from(pcmBytes(samples)).toString("base64");
}

function wholeIn(name: string, value: number, least: number, most: number): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`sound: ${name} is ${least} to ${most}, not ${value}`);
  }
  return value;
}

function handleFields(sound: { readonly handle: number; readonly generation: number }): { readonly handle: number; readonly generation: number } {
  return { handle: wholeIn("handle", sound.handle, 0, LAST_HANDLE), generation: wholeIn("generation", sound.generation, 0, LAST_GENERATION) };
}

function rateOf(rate: SampleRate): SampleRate {
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

/** A fade, none when absent. */
function fade(fadeMs: number | undefined): number {
  return wholeIn("fade_ms", fadeMs ?? 0, 0, LONGEST_FADE_MS);
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

/** The member as the protocol writes it, a `sound` message's own fields by its `kind`, checked as the server checks it. */
export function soundFields(member: SoundMember): WireSound {
  if ("object" in member) {
    const { object } = member;
    return { kind: "object", ...handleFields(object), rate: rateOf(object.rate), pcm: samplesOf(object.samples) };
  }
  if ("live" in member) {
    return { kind: "live", ...handleFields(member.live), rate: rateOf(member.live.rate) };
  }
  if ("blocks" in member) {
    const { blocks } = member;
    return {
      kind: "blocks",
      ...handleFields(blocks),
      rate: rateOf(blocks.rate),
      first: wholeIn("first", blocks.first, 0, LAST_BLOCK),
      pcm: samplesOf(blocks.samples),
    };
  }
  if ("opus" in member) {
    return opusFields(member.opus);
  }
  if ("opusLive" in member) {
    return opusLiveFields(member.opusLive);
  }
  if ("opusPackets" in member) {
    return opusPacketsFields(member.opusPackets);
  }
  if ("play" in member) {
    const { play } = member;
    return {
      kind: "play",
      channel: channelOf(play.channel),
      ...handleFields(play),
      gain: wholeIn("gain", play.gain ?? FULL_GAIN, 0, FULL_GAIN),
      fade_ms: fade(play.fadeMs),
      loop: play.loop ?? false,
      after: play.after ?? false,
      duck: wholeIn("duck", play.duck ?? 0, 0, DEEPEST_DUCK),
      page: play.page === undefined ? null : pageOf(play.page),
    };
  }
  if ("stop" in member) {
    return { kind: "stop", channel: channelOf(member.stop.channel), fade_ms: fade(member.stop.fadeMs) };
  }
  const { gain } = member;
  return { kind: "gain", channel: channelOf(gain.channel), gain: wholeIn("gain", gain.gain, 0, FULL_GAIN), fade_ms: fade(gain.fadeMs) };
}

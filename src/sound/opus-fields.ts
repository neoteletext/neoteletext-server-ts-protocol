// The Opus members as the protocol writes them (docs/applications.md
// section 3.4): constant-rate packets back to back, base64, checked here as
// the server checks them, so a mistake is caught where it is made rather
// than refused whole in the server's log.

import type { OpusLive, OpusPackets, OpusSound } from "./members.ts";
import { LAST_BLOCK, LAST_GENERATION, LAST_HANDLE, MOST_OPUS_PACKETS, MOST_SAMPLES, OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES } from "./profile.ts";

function wholeIn(name: string, value: number, least: number, most: number): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`sound: ${name} is ${least} to ${most}, not ${value}`);
  }
  return value;
}

function liveFields(sound: OpusLive): Record<string, number> {
  return {
    handle: wholeIn("handle", sound.handle, 0, LAST_HANDLE),
    generation: wholeIn("generation", sound.generation, 0, LAST_GENERATION),
    packet_bytes: wholeIn("packet_bytes", sound.packetBytes, 1, OPUS_PACKET_BYTES),
  };
}

/** How many packets `packets` holds, each `packetBytes` long: at least one, at most a stored sound's. */
function packetCount(packets: Uint8Array, packetBytes: number): number {
  if (packets.length === 0 || packets.length % packetBytes !== 0) {
    throw new RangeError(`sound: packets are whole packets of ${packetBytes} bytes, not ${packets.length} bytes`);
  }
  return wholeIn("the packets' count", packets.length / packetBytes, 1, MOST_OPUS_PACKETS);
}

function base64(packets: Uint8Array): string {
  return Buffer.from(packets.buffer, packets.byteOffset, packets.byteLength).toString("base64");
}

export function opusFields(opus: OpusSound): Record<string, unknown> {
  const fields = liveFields(opus);
  const count = packetCount(opus.packets, opus.packetBytes);
  const samples = wholeIn("samples", opus.samples, 1, MOST_SAMPLES);
  // The engine's Sound::opus takes a sound whose length its packets' frames hold, the last only partly.
  if (Math.ceil(samples / OPUS_FRAME_SAMPLES) !== count) {
    throw new RangeError(`sound: ${samples} samples are ${Math.ceil(samples / OPUS_FRAME_SAMPLES)} packets' frames, not ${count}`);
  }
  return { opus: { ...fields, samples, packets: base64(opus.packets) } };
}

export function opusLiveFields(live: OpusLive): Record<string, unknown> {
  return { opus_live: liveFields(live) };
}

export function opusPacketsFields(packets: OpusPackets): Record<string, unknown> {
  const fields = liveFields(packets);
  packetCount(packets.packets, packets.packetBytes);
  return { opus_packets: { ...fields, first: wholeIn("first", packets.first, 0, LAST_BLOCK), packets: base64(packets.packets) } };
}

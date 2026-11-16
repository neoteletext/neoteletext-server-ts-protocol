// The server's rules for a sound's bytes that its schema cannot state (the
// server's check_sound and Sounds::check_opus): exact base64 of whole
// 16-bit samples or whole Opus packets of the profile, within two minutes;
// an instrument's sound has its rules in instrument-rules.ts.

import type { Fault } from "./fault.ts";
import { instrumentFault, isInstrumentKind } from "./instrument-rules.ts";
import type { WireSound } from "./protocol.ts";
import { base64Bytes, isFault, wholeFault } from "./rule-pieces.ts";
import { opusRefusal } from "../sound/opus-packet.ts";
import { MOST_SAMPLES, OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES, SAMPLE_BYTES } from "../sound/profile.ts";

/** The most bytes of samples and of Opus packets one sound may carry: two minutes of either (the server's MOST_PCM_BYTES and MOST_OPUS_BYTES). */
const MOST_PCM_BYTES = MOST_SAMPLES * SAMPLE_BYTES;
const MOST_OPUS_BYTES = (MOST_SAMPLES / OPUS_FRAME_SAMPLES) * OPUS_PACKET_BYTES;

/** Every packet is the profile's, as the engine's decoder judges it before decoding (the server's Sounds::check_opus, which names no path). */
function profileFault(bytes: Buffer, packetBytes: number): Fault | null {
  for (let index = 0; index * packetBytes < bytes.length; index += 1) {
    const refusal = opusRefusal(bytes.subarray(index * packetBytes, (index + 1) * packetBytes));
    if (refusal !== null) {
      return { path: "", rule: "outside_profile", detail: `packet ${index} is outside the Opus profile: ${refusal}` };
    }
  }
  return null;
}

/** A sound's samples or packets: exact base64 of whole 16-bit samples or whole packets of `packet_bytes` (the server's check_sound). */
export function soundFault(sound: WireSound): Fault | null {
  if (sound.kind === "opus" || sound.kind === "opus_packets") {
    const bytes = wholeFault("packets", sound.packets, MOST_OPUS_BYTES, sound.packet_bytes, "packets");
    return isFault(bytes) ? bytes : profileFault(bytes, sound.packet_bytes);
  }
  if (sound.kind === "object" || sound.kind === "blocks") {
    const bytes = base64Bytes("pcm", sound.pcm, MOST_PCM_BYTES);
    if (isFault(bytes)) {
      return bytes;
    }
    return bytes.length % SAMPLE_BYTES === 0 ? null : { path: "pcm", rule: "wrong_length", detail: "16-bit samples: an even number of bytes" };
  }
  return isInstrumentKind(sound) ? instrumentFault(sound) : null;
}

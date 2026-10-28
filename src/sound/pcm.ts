// Samples as the protocol and ffmpeg both take them: 16-bit little-endian,
// whatever the machine's own order.

import { SAMPLE_BYTES } from "./profile.ts";

/** `samples` as 16-bit little-endian bytes. */
export function pcmBytes(samples: Int16Array): Uint8Array {
  const bytes = new DataView(new ArrayBuffer(samples.length * SAMPLE_BYTES));
  samples.forEach((sample, index) => {
    bytes.setInt16(index * SAMPLE_BYTES, sample, true);
  });
  return new Uint8Array(bytes.buffer);
}

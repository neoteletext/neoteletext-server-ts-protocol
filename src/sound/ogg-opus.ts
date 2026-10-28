// An Ogg Opus stream read as it comes, as an encoder writes it: its pages
// checked (RFC 3533 section 6, their CRC included), its packets put back
// together across pages, its two headers read (RFC 7845 section 5) and the
// audio packets after them kept for the caller to take. What it reads came
// from another program, so every length is bounded before it is used.

/** A page's fixed header: "OggS" to the segment count (RFC 3533 section 6). */
const PAGE_HEADER_BYTES = 27;
/** The segment table's length follows the fixed header. */
const SEGMENTS_AT = 26;
/** A segment of this length continues its packet into the next (RFC 3533 section 5). */
const FULL_SEGMENT = 255;
/** The longest page: its header, a full segment table and full segments. */
const LONGEST_PAGE = PAGE_HEADER_BYTES + FULL_SEGMENT + FULL_SEGMENT * FULL_SEGMENT;
const CAPTURE = "OggS";
const VERSION_AT = 4;
const GRANULE_AT = 6;
const SERIAL_AT = 14;
const CRC_AT = 22;
const CRC_BYTES = 4;
/** RFC 3533 section 6: the CRC's generator polynomial, unreflected, from zero, with no final exclusive-or. */
const CRC_POLYNOMIAL = 0x04_c1_1d_b7;
const BYTE_BITS = 8;
const TOP_BIT = 0x80_00_00_00;
const CRC_TOP_SHIFT = 24;
const BYTE_MASK = 0xff;
/** RFC 7845 section 5.1: "OpusHead", version, channels, pre-skip. */
const OPUS_HEAD = "OpusHead";
const OPUS_TAGS = "OpusTags";
const HEAD_BYTES = 19;
const HEAD_VERSION_AT = 8;
const HEAD_CHANNELS_AT = 9;
const HEAD_PRE_SKIP_AT = 10;
/** A version this reader understands: major version 0, in the upper four bits (RFC 7845 section 5.1). */
const MOST_VERSION = 0x0f;
/** The profile is mono (the engine's decision E.123). */
const MONO = 1;
/** The longest header packet kept while it is put together: an encoder's tags are a few dozen bytes. */
const LONGEST_HEADER = 4_096;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index << CRC_TOP_SHIFT;
  for (let bit = 0; bit < BYTE_BITS; bit += 1) {
    crc = (crc & TOP_BIT) === 0 ? crc << 1 : (crc << 1) ^ CRC_POLYNOMIAL;
  }
  return crc >>> 0;
});

/** RFC 3533 section 6's checksum of a page, its own CRC field taken as zero. */
export function oggCrc(page: Uint8Array): number {
  let crc = 0;
  page.forEach((byte, index) => {
    const value = index >= CRC_AT && index < CRC_AT + CRC_BYTES ? 0 : byte;
    crc = ((crc << BYTE_BITS) ^ (CRC_TABLE[((crc >>> CRC_TOP_SHIFT) ^ value) & BYTE_MASK] ?? 0)) >>> 0;
  });
  return crc;
}

function text(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCodePoint(...bytes.subarray(at, at + length));
}

/** An Ogg Opus stream read as it comes. */
export class OggOpusReader {
  readonly #longestPacket: number;
  readonly #mostPending: number;
  #pending: Uint8Array = new Uint8Array(0);
  #packet: Uint8Array[] = [];
  #packetBytes = 0;
  #headers = 0;
  #serial: number | null = null;
  #packets: Uint8Array[] = [];
  #granule = 0;
  #preSkip: number | null = null;

  /** Reads audio packets of at most `longestPacket` bytes, holding at most `mostPending` of them untaken. */
  constructor(longestPacket: number, mostPending: number) {
    this.#longestPacket = longestPacket;
    this.#mostPending = mostPending;
  }

  /** The last whole page's granule position: the samples at 48 kHz up to its end, the pre-skip with them (RFC 7845 section 4). */
  get granule(): number {
    return this.#granule;
  }

  /** The samples a decoder drops from the start (RFC 7845 section 5.1), once the header is read. */
  get preSkip(): number | null {
    return this.#preSkip;
  }

  /** Reads `bytes`, the stream's next; throws a RangeError at anything that is not Ogg Opus as the profile has it. */
  push(bytes: Uint8Array): void {
    const joined = new Uint8Array(this.#pending.length + bytes.length);
    joined.set(this.#pending);
    joined.set(bytes, this.#pending.length);
    let at = 0;
    for (let length = this.#pageLength(joined, at); length !== null; length = this.#pageLength(joined, at)) {
      this.#page(joined.subarray(at, at + length));
      at += length;
    }
    this.#pending = joined.slice(at);
    if (this.#pending.length > LONGEST_PAGE) {
      throw new RangeError("ogg: a page longer than a page can be");
    }
  }

  /** The audio packets read since the last take, in order. */
  take(): Uint8Array[] {
    const taken = this.#packets;
    this.#packets = [];
    return taken;
  }

  /** The whole page at `at`'s length, or null while it has not all come. */
  #pageLength(bytes: Uint8Array, at: number): number | null {
    if (bytes.length - at < PAGE_HEADER_BYTES) {
      return null;
    }
    if (text(bytes, at, CAPTURE.length) !== CAPTURE || bytes[at + VERSION_AT] !== 0) {
      throw new RangeError("ogg: not an Ogg page of version 0");
    }
    const segments = bytes[at + SEGMENTS_AT] ?? 0;
    if (bytes.length - at < PAGE_HEADER_BYTES + segments) {
      return null;
    }
    const body = bytes.subarray(at + PAGE_HEADER_BYTES, at + PAGE_HEADER_BYTES + segments).reduce((sum, segment) => sum + segment, 0);
    const length = PAGE_HEADER_BYTES + segments + body;
    return bytes.length - at < length ? null : length;
  }

  #page(page: Uint8Array): void {
    const view = new DataView(page.buffer, page.byteOffset, page.byteLength);
    if (view.getUint32(CRC_AT, true) !== oggCrc(page)) {
      throw new RangeError("ogg: a page's checksum is wrong");
    }
    const serial = view.getUint32(SERIAL_AT, true);
    if (this.#serial !== null && serial !== this.#serial) {
      throw new RangeError("ogg: more than one stream");
    }
    this.#serial = serial;
    const segments = page[SEGMENTS_AT] ?? 0;
    let at = PAGE_HEADER_BYTES + segments;
    for (const segment of page.subarray(PAGE_HEADER_BYTES, PAGE_HEADER_BYTES + segments)) {
      this.#segment(page.subarray(at, at + segment), segment < FULL_SEGMENT);
      at += segment;
    }
    // A page that ends no packet has granule -1 (RFC 3533 section 6), and the count stays where it was.
    const granule = view.getBigInt64(GRANULE_AT, true);
    if (granule >= 0n) {
      this.#granule = Number(granule);
    }
  }

  #segment(segment: Uint8Array, ends: boolean): void {
    this.#packetBytes += segment.length;
    if (this.#packetBytes > (this.#headers < 2 ? LONGEST_HEADER : this.#longestPacket)) {
      throw new RangeError(`ogg: a packet longer than ${this.#headers < 2 ? LONGEST_HEADER : this.#longestPacket} bytes`);
    }
    this.#packet.push(segment);
    if (!ends) {
      return;
    }
    const packet = new Uint8Array(this.#packetBytes);
    let at = 0;
    for (const part of this.#packet) {
      packet.set(part, at);
      at += part.length;
    }
    this.#packet = [];
    this.#packetBytes = 0;
    this.#take(packet);
  }

  #take(packet: Uint8Array): void {
    if (this.#headers === 0) {
      this.#head(packet);
    } else if (this.#headers === 1) {
      if (text(packet, 0, OPUS_TAGS.length) !== OPUS_TAGS) {
        throw new RangeError("ogg: the second packet is not OpusTags");
      }
    } else {
      if (this.#packets.length >= this.#mostPending) {
        throw new RangeError(`ogg: more than ${this.#mostPending} packets untaken`);
      }
      this.#packets.push(packet);
      return;
    }
    this.#headers += 1;
  }

  #head(packet: Uint8Array): void {
    if (packet.length < HEAD_BYTES || text(packet, 0, OPUS_HEAD.length) !== OPUS_HEAD) {
      throw new RangeError("ogg: the first packet is not OpusHead");
    }
    if ((packet[HEAD_VERSION_AT] ?? MOST_VERSION + 1) > MOST_VERSION || packet[HEAD_CHANNELS_AT] !== MONO) {
      throw new RangeError("ogg: OpusHead is not of version 0 and mono");
    }
    this.#preSkip = new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint16(HEAD_PRE_SKIP_AT, true);
  }
}

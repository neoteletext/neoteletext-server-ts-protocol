// A Standard MIDI File as a score's events (REQ-6414 item 4; Standard MIDI
// Files 1.0), for the DX7 or one of the analogue synthesizers (DEC-6429):
// formats 0 and 1, the tracks merged on one time line, every tempo change
// applied, running status followed. The messages the instrument's codec
// takes are kept and every other is dropped and counted. A file
// is untrusted: its size, its tracks and its events are bounded, and no
// length it states is believed past its bytes (midi-bytes.ts).

import type { Dx7Event } from "./dx7-score.ts";
import { Midi, type SlotInstrument, instrumentSlotFault, messageOf } from "./dx7-slot.ts";
import { MidiBytes } from "./midi-bytes.ts";

/** The largest file read: a megabyte, many times any tune's. */
export const MOST_MIDI_FILE_BYTES = 1024 * 1024;

/** The most events read from a file, its tempo changes and the messages dropped among them. */
export const MOST_MIDI_EVENTS = 100_000;

/** The messages left out, by kind: the instrument's codec does not take them. */
export interface MidiDropped {
  /** Key pressure, status 0xA0, which only the CS-80 takes. */
  polyPressure: number;
  /** Control changes of controllers other than 1, 7, 64, 120, 121 and 123 (and, for the Jupiter-8, 5, 8 and 65). */
  controlChange: number;
  /** Program changes to a patch past 31, which no bank has, and a Jupiter-8's on a channel past 2. */
  programChange: number;
  /** Channel pressure, status 0xD0, which only the CS-80 takes. */
  channelPressure: number;
  /** System Exclusive messages. */
  systemExclusive: number;
}

/** What a file holds for an instrument. */
export interface MidiFileScore {
  readonly format: 0 | 1;
  readonly tracks: number;
  /** The messages kept, in order of time: what `new Dx7Score(events)`, or `new SynthScore(synth, events)` for the instrument it was read for, takes. */
  readonly events: readonly Dx7Event[];
  readonly dropped: Readonly<MidiDropped>;
  /** The time of the file's last event, kept or not, in milliseconds. */
  readonly lengthMs: number;
}

/** A chunk's type is four characters, and its length four bytes (Standard MIDI Files 1.0, "Chunks"). */
const TYPE_CHARACTERS = 4;
const LENGTH_BYTES = 4;
/** The header's format, tracks and division are two bytes each. */
const WORD_BYTES = 2;
/** A division with its top bit set is SMPTE frames, not ticks to a quarter note. */
const SMPTE_DIVISION = 0x8000;
/** A meta event, its Set Tempo and End of Track types, and a tempo's three bytes of microseconds to a quarter note. */
const META = 0xff;
const SET_TEMPO = 0x51;
const END_OF_TRACK = 0x2f;
const TEMPO_BYTES = 3;
/** The tempo until a file sets one: 120 quarter notes a minute. */
const DEFAULT_TEMPO = 500_000;
const MICROSECONDS_A_MS = 1_000;
/** System Exclusive, begun and continued. */
const SYSEX = 0xf0;
const SYSEX_CONTINUED = 0xf7;
/** A status byte has its top bit set; a data byte does not. */
const STATUS = 0x80;
const POLY_PRESSURE = 0xa0;
const CHANNEL_PRESSURE = 0xd0;

/** One thing read from a track: a message, or a tempo when `status` is META. */
interface Read {
  readonly tick: number;
  readonly status: number;
  readonly data1: number;
  readonly data2: number;
  /** A tempo's microseconds to a quarter note. */
  readonly tempo: number;
}

/** What is read as it goes: the events so far, and the System Exclusive messages passed over. */
interface Reading {
  readonly read: Read[];
  sysex: number;
}

/** Keeps an event read, within the most a file may hold. */
function keep(reading: Reading, read: Read): void {
  if (reading.read.length >= MOST_MIDI_EVENTS) {
    throw new RangeError(`midi file: it has over ${MOST_MIDI_EVENTS} events`);
  }
  reading.read.push(read);
}

/** A channel message's data bytes: one for a program change and channel pressure, two for every other. */
function message(bytes: MidiBytes, status: number, tick: number): Read {
  const one = messageOf(status) === Midi.ProgramChange || messageOf(status) === CHANNEL_PRESSURE;
  const data1 = bytes.byte();
  const data2 = one ? 0 : bytes.byte();
  if (data1 >= STATUS || data2 >= STATUS) {
    throw new RangeError(`midi file: a data byte of the message at tick ${tick} has its top bit set`);
  }
  return { tick, status, data1, data2, tempo: 0 };
}

/** A meta event: a tempo is kept, End of Track ends the track (true), and every other is passed over. */
function meta(bytes: MidiBytes, tick: number, reading: Reading): boolean {
  const type = bytes.byte();
  const data = bytes.take(bytes.quantity());
  if (type === SET_TEMPO) {
    keep(reading, { tick, status: META, data1: 0, data2: 0, tempo: data.number(TEMPO_BYTES) });
  }
  return type === END_OF_TRACK;
}

/** One track's events, at their ticks from its start. Returns the tick it ends at. */
function track(bytes: MidiBytes, reading: Reading): number {
  let tick = 0;
  let running = 0;
  while (!bytes.done) {
    tick += bytes.quantity();
    const first = bytes.peek();
    if (first === META) {
      bytes.byte();
      // A meta event or System Exclusive ends running status (Standard MIDI Files 1.0, "MTrk events").
      running = 0;
      if (meta(bytes, tick, reading)) {
        return tick;
      }
    } else if (first === SYSEX || first === SYSEX_CONTINUED) {
      bytes.byte();
      bytes.take(bytes.quantity());
      running = 0;
      reading.sysex += 1;
    } else if (first > SYSEX) {
      throw new RangeError(`midi file: status ${first} at tick ${tick} is not one a file holds`);
    } else {
      // A data byte first means the status of the message before it: running status.
      running = first >= STATUS ? bytes.byte() : running;
      if (running === 0) {
        throw new RangeError(`midi file: a data byte at tick ${tick} follows no status`);
      }
      keep(reading, message(bytes, running, tick));
    }
  }
  return tick;
}

/** The header chunk: the format, the tracks it says it has, and the ticks to a quarter note. */
function header(bytes: MidiBytes): { format: 0 | 1; tracks: number; division: number } {
  if (bytes.text(TYPE_CHARACTERS) !== "MThd") {
    throw new RangeError("midi file: it does not begin MThd, a Standard MIDI File's header");
  }
  const data = bytes.take(bytes.number(LENGTH_BYTES));
  const [format, tracks, division] = [data.number(WORD_BYTES), data.number(WORD_BYTES), data.number(WORD_BYTES)];
  if (format !== 0 && format !== 1) {
    throw new RangeError(`midi file: format ${format} is not read, only 0 and 1`);
  }
  if (tracks === 0 || (format === 0 && tracks !== 1)) {
    throw new RangeError(`midi file: a format ${format} file with ${tracks} tracks`);
  }
  if (division === 0 || division >= SMPTE_DIVISION) {
    throw new RangeError("midi file: its division is not ticks to a quarter note; SMPTE time is not read");
  }
  return { format, tracks, division };
}

/** Whether a message is one the instrument's codec takes; one it does not is counted. */
function taken(read: Read, dropped: MidiDropped, instrument: SlotInstrument): boolean {
  if (instrumentSlotFault({ time: 0, status: read.status, data1: read.data1, data2: read.data2 }, instrument) === null) {
    return true;
  }
  const kind = messageOf(read.status);
  if (kind === POLY_PRESSURE) {
    dropped.polyPressure += 1;
  } else if (kind === CHANNEL_PRESSURE) {
    dropped.channelPressure += 1;
  } else if (kind === Midi.ProgramChange) {
    dropped.programChange += 1;
  } else {
    dropped.controlChange += 1;
  }
  return false;
}

/** The events in order of tick, at their times in milliseconds: a tempo holds from its tick until the next. */
function timed(
  read: readonly Read[],
  division: number,
  dropped: MidiDropped,
  endTick: number,
  instrument: SlotInstrument,
): { events: Dx7Event[]; lengthMs: number } {
  // A stable sort: events of one tick stay in the order of their tracks, and within a track as written.
  const ordered = read.toSorted((one, other) => one.tick - other.tick);
  const events: Dx7Event[] = [];
  let [tempo, ms, tick] = [DEFAULT_TEMPO, 0, 0];
  const advance = (to: number): void => {
    ms += ((to - tick) * tempo) / division / MICROSECONDS_A_MS;
    tick = to;
  };
  for (const one of ordered) {
    advance(one.tick);
    if (one.status === META) {
      ({ tempo } = one);
    } else if (taken(one, dropped, instrument)) {
      events.push({ ms, status: one.status, data1: one.data1, data2: one.data2 });
    }
  }
  advance(Math.max(tick, endTick));
  return { events, lengthMs: ms };
}

/** Reads a Standard MIDI File, format 0 or 1, as the events of a score for `instrument`, the DX7 unless said: note on and off, pitch bend, program changes to patches 0 to 31 and the controllers the codec takes, and for the CS-80 key and channel pressure, each at its time in milliseconds by the file's tempos. A MIDI channel is a part. Refused: a file over a megabyte or of over 100,000 events, format 2, SMPTE time, and a file that is cut short or malformed. */
export function readMidiFile(bytes: Uint8Array, instrument: SlotInstrument = "dx7"): MidiFileScore {
  if (bytes.length > MOST_MIDI_FILE_BYTES) {
    throw new RangeError(`midi file: ${bytes.length} bytes, at most ${MOST_MIDI_FILE_BYTES}`);
  }
  const file = new MidiBytes(bytes);
  const { format, tracks, division } = header(file);
  const reading: Reading = { read: [], sysex: 0 };
  let found = 0;
  let endTick = 0;
  // A chunk that is not a track is passed over, as the format asks; a file may hold fewer tracks than it says, never more.
  while (!file.done && found < tracks) {
    const type = file.text(TYPE_CHARACTERS);
    const chunk = file.take(file.number(LENGTH_BYTES));
    if (type === "MTrk") {
      found += 1;
      endTick = Math.max(endTick, track(chunk, reading));
    }
  }
  if (found === 0) {
    throw new RangeError("midi file: it has no track");
  }
  const dropped: MidiDropped = { polyPressure: 0, controlChange: 0, programChange: 0, channelPressure: 0, systemExclusive: reading.sysex };
  return { format, tracks: found, dropped, ...timed(reading.read, division, dropped, endTick, instrument) };
}

// A Standard MIDI File as a DX7 score's events (REQ-6414 item 4): a small
// file written out byte by byte, its tempo change applied, running status
// followed, the messages the codec does not take dropped and counted, and
// a file that is too big, cut short or of a kind not read refused.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Dx7Score, MOST_MIDI_EVENTS, MOST_MIDI_FILE_BYTES, readMidiFile } from "../src/index.ts";

/** A chunk: its type, its length in four bytes, its data. */
function chunk(type: string, data: readonly number[]): number[] {
  const { length } = data;
  return [...Buffer.from(type, "ascii"), (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...data];
}

/** A header chunk: the format, the tracks and the division, two bytes each. */
function header(format: number, tracks: number, division: number): number[] {
  return chunk("MThd", [0, format, 0, tracks, division >> 8, division & 0xff]);
}

const END_OF_TRACK = [0x00, 0xff, 0x2f, 0x00];

/** Tempos at 480 ticks a quarter note: 500,000 microseconds (120 a minute) from the start, 250,000 from tick 480. */
const TEMPO_TRACK = chunk("MTrk", [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x83, 0x60, 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90, ...END_OF_TRACK]);

/** Notes, with every kind of message the codec does not take among them: each event with what it is, its delta time first. */
const NOTE_EVENTS: readonly (readonly [string, readonly number[]])[] = [
  ["tick 0: program 5 on part 0", [0x00, 0xc0, 0x05]],
  ["tick 0: key 60 down", [0x00, 0x90, 0x3c, 0x64]],
  ["tick 240, running status: key 62 down", [0x81, 0x70, 0x3e, 0x50]],
  ["tick 480: key 60 up", [0x81, 0x70, 0x80, 0x3c, 0x00]],
  ["tick 960, running status: key 62 up", [0x83, 0x60, 0x3e, 0x00]],
  ["volume, kept", [0x00, 0xb0, 0x07, 0x64]],
  ["running status: pan, dropped", [0x00, 0x0a, 0x40]],
  ["key pressure, dropped", [0x00, 0xa0, 0x3c, 0x10]],
  ["channel pressure, dropped", [0x00, 0xd0, 0x20]],
  ["program 40, dropped", [0x00, 0xc0, 0x28]],
  ["System Exclusive, dropped", [0x00, 0xf0, 0x03, 0x01, 0x02, 0xf7]],
  ["a text meta event, passed over", [0x00, 0xff, 0x01, 0x02, 0x68, 0x69]],
  ["pitch bend, kept", [0x00, 0xe0, 0x00, 0x40]],
  ["tick 1,089: key 64 down", [0x81, 0x01, 0x90, 0x40, 0x7f]],
];
const NOTE_TRACK = chunk("MTrk", [...NOTE_EVENTS.flatMap(([, bytes]) => bytes), ...END_OF_TRACK]);

const FILE = Uint8Array.from([...header(1, 2, 480), ...TEMPO_TRACK, ...chunk("XFIH", [1, 2, 3]), ...NOTE_TRACK]);

test("a format 1 file's tracks are merged, its tempos applied, and what the codec does not take is dropped and counted", () => {
  const read = readMidiFile(FILE);
  assert.equal(read.format, 1);
  assert.equal(read.tracks, 2);
  // 480 ticks at 500,000 microseconds are 500 ms; from there a tick is 250,000 / 480 microseconds, so tick 960 is 750 ms and tick 1,089 is 817.1875 ms.
  assert.deepEqual(read.events, [
    { ms: 0, status: 0xc0, data1: 5, data2: 0 },
    { ms: 0, status: 0x90, data1: 60, data2: 100 },
    { ms: 250, status: 0x90, data1: 62, data2: 80 },
    { ms: 500, status: 0x80, data1: 60, data2: 0 },
    { ms: 750, status: 0x80, data1: 62, data2: 0 },
    { ms: 750, status: 0xb0, data1: 7, data2: 100 },
    { ms: 750, status: 0xe0, data1: 0, data2: 64 },
    { ms: 817.1875, status: 0x90, data1: 64, data2: 127 },
  ]);
  assert.deepEqual(read.dropped, { polyPressure: 1, controlChange: 1, programChange: 1, channelPressure: 1, systemExclusive: 1 });
  assert.equal(read.lengthMs, 817.1875);
});

test("a file's events are a score's: the blocks of the notes it holds", () => {
  const { slots, blocks, lengthMs } = new Dx7Score(readMidiFile(FILE).events).build();
  assert.equal(slots, 3, "three events at 750 ms");
  assert.equal(lengthMs, 820, "41 blocks");
  const block = (index: number): number[] => Array.from(blocks.subarray(index * 12, (index + 1) * 12));
  assert.deepEqual(block(0), [0, 0xc0, 5, 0, 0, 0x90, 60, 100, 0, 0, 0, 0]);
  assert.deepEqual(block(12), [100, 0x90, 62, 80, 0, 0, 0, 0, 0, 0, 0, 0], "250 ms is 10 ms into block 12");
  assert.deepEqual(block(37), [100, 0x80, 62, 0, 100, 0xb0, 7, 100, 100, 0xe0, 0, 64]);
  assert.deepEqual(block(40), [172, 0x90, 64, 127, 0, 0, 0, 0, 0, 0, 0, 0], "817.1875 ms is 17.2 ms into block 40");
});

test("a format 0 file is one track, at 120 quarter notes a minute until it says otherwise", () => {
  const file = Uint8Array.from([...header(0, 1, 96), ...chunk("MTrk", [0x60, 0x99, 0x24, 0x7f, 0x30, 0x89, 0x24, 0x40, ...END_OF_TRACK])]);
  const read = readMidiFile(file);
  assert.equal(read.format, 0);
  assert.deepEqual(read.events, [
    { ms: 500, status: 0x99, data1: 36, data2: 127 },
    { ms: 750, status: 0x89, data1: 36, data2: 64 },
  ]);
  assert.equal(read.lengthMs, 750);
});

test("a file that is not one read, or is cut short, is refused", () => {
  const track = chunk("MTrk", [0x00, 0x90, 0x3c, 0x64, ...END_OF_TRACK]);
  const cases: readonly (readonly [string, readonly number[], RegExp])[] = [
    ["not a MIDI file", [...Buffer.from("RIFF", "ascii"), 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, ...track], /MThd/u],
    ["format 2", [...header(2, 1, 96), ...track], /format 2 is not read/u],
    ["format 0 with two tracks", [...header(0, 2, 96), ...track, ...track], /format 0 file with 2 tracks/u],
    ["no tracks", [...header(1, 0, 96)], /with 0 tracks/u],
    ["SMPTE time", [...header(1, 1, 0xe728), ...track], /SMPTE/u],
    ["a division of 0", [...header(1, 1, 0), ...track], /division/u],
    ["a header and nothing else", [...header(1, 1, 96)], /no track/u],
    ["a track longer than the file", [...header(1, 1, 96), ...track.with(7, 200)], /run past its end/u],
    ["a message cut short", [...header(1, 1, 96), ...chunk("MTrk", [0x00, 0x90, 0x3c])], /part way through/u],
    ["a data byte with no status before it", [...header(1, 1, 96), ...chunk("MTrk", [0x00, 0x3c, 0x64])], /follows no status/u],
    [
      "running status after a meta event",
      [...header(1, 1, 96), ...chunk("MTrk", [0x00, 0x90, 0x3c, 0x64, 0x00, 0xff, 0x01, 0x00, 0x00, 0x3c, 0x00])],
      /no status/u,
    ],
    ["a data byte with its top bit set", [...header(1, 1, 96), ...chunk("MTrk", [0x00, 0x90, 0x3c, 0x90])], /top bit/u],
    ["a status no file holds", [...header(1, 1, 96), ...chunk("MTrk", [0x00, 0xf8])], /status 248/u],
    ["a delta time of five bytes", [...header(1, 1, 96), ...chunk("MTrk", [0x81, 0x81, 0x81, 0x81, 0x01, 0x90, 0x3c, 0x64])], /over 4 bytes/u],
    ["a header cut short", [...Buffer.from("MThd", "ascii"), 0, 0, 0, 4, 0, 1, 0, 1], /part way through/u],
  ];
  for (const [what, bytes, why] of cases) {
    assert.throws(() => readMidiFile(Uint8Array.from(bytes)), why, what);
  }
});

/** A file of `count` events: key 60 down again and again by running status, three bytes an event. */
function events(count: number): Uint8Array {
  const notes = Array.from({ length: count - 1 }, () => [0x00, 0x3c, 0x64]).flat();
  return Uint8Array.from([...header(0, 1, 96), ...chunk("MTrk", [0x00, 0x90, 0x3c, 0x64, ...notes, ...END_OF_TRACK])]);
}

test("a file is bounded: a megabyte, and 100,000 events", () => {
  assert.equal(MOST_MIDI_FILE_BYTES, 1024 * 1024);
  assert.throws(() => readMidiFile(new Uint8Array(MOST_MIDI_FILE_BYTES + 1)), /at most 1048576/u);
  assert.equal(readMidiFile(events(MOST_MIDI_EVENTS)).events.length, 100_000);
  assert.throws(() => readMidiFile(events(MOST_MIDI_EVENTS + 1)), /over 100000 events/u);
});

test("a file read for the CS-80 keeps its pressure, and for the Jupiter-8 drops a program change past its two parts", () => {
  const cs80 = readMidiFile(FILE, "cs80");
  assert.deepEqual(
    cs80.events.filter((event) => event.status === 0xa0 || event.status === 0xd0),
    [
      { ms: 750, status: 0xa0, data1: 60, data2: 16 },
      { ms: 750, status: 0xd0, data1: 32, data2: 0 },
    ],
  );
  assert.deepEqual(cs80.dropped, { polyPressure: 0, controlChange: 1, programChange: 1, channelPressure: 0, systemExclusive: 1 });
  const onPartThree = Uint8Array.from([...header(0, 1, 96), ...chunk("MTrk", [0x00, 0xc2, 0x01, 0x00, 0xc1, 0x02, ...END_OF_TRACK])]);
  const jupiter8 = readMidiFile(onPartThree, "jupiter8");
  assert.deepEqual(jupiter8.events, [{ ms: 0, status: 0xc1, data1: 2, data2: 0 }]);
  assert.equal(jupiter8.dropped.programChange, 1);
  assert.equal(readMidiFile(onPartThree).events.length, 2, "the DX7 takes both");
});

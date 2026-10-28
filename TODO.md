# neoteletext-server-ts-protocol: to do

- **Microcontroller receivers** (tellyboy) are not implemented yet: when
  they are, a channel sends them PCM, which the server encodes as IMA
  ADPCM, and desktop and phone receivers Opus. One sound cannot go in
  both at once: a receiver matches a sound's DATA records by its handle
  and generation alone (the engine's `store.rs`, `put`), so the other
  format's blocks would land in it. That needs the server to send each
  receiver class its own (teletext-server's decision 21).
- **The Opus packets are judged by the server's decoder only**: nothing
  here decodes them. `fakeOpus` writes packets that are not Opus, for
  tests that never reach a server.

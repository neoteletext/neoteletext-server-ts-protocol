// What a measure of picture text the server refuses rejects with (renderer
// parity PAR-22): `text_unshown`, a character the language cannot show,
// among the rest.

import type { ServerMessageRefused } from "../wire/generated/protocol.js";

/** The server refused picture text the program measured: a text part of it would be refused the same way when sent. */
export class PictureTextRefusedError extends Error {
  readonly refusal: ServerMessageRefused;

  constructor(refusal: ServerMessageRefused) {
    super(`the server refused the picture text measured: ${refusal.path === "" ? "the message" : refusal.path}: ${refusal.rule} (${refusal.detail})`);
    this.name = "PictureTextRefusedError";
    this.refusal = refusal;
  }
}

// A program's measures of picture text (renderer parity PAR-22): each
// `measure_picture_text` goes with a number of the program's, and the
// server's `measured_picture_text`, or its `refused` naming that number,
// settles the promise the program holds. Nothing reaches a viewer.

import type { App } from "../wire/app.ts";
import type { ServerMessageMeasuredPictureText } from "../wire/generated/protocol.js";
import type { LanguageTag } from "../wire/languages.ts";
import { PictureTextRefusedError } from "./picture-text-refused.ts";
import { Requests } from "./requests.ts";

/** The numbers are the unsigned 32-bit integers (the schema's measure_picture_text.request): they go round. */
const LAST_REQUEST = 2 ** 32 - 1;

/** What picture text costs (PAR-22, the engine's picture_text::measure), as the server measured it. */
export interface MeasuredPictureText {
  /** The character cells it advances, a mark taking none: its width is this many times the character cell the picture sets. */
  readonly cells: number;
  /** The bytes of its ReGIS (PAR-4). */
  readonly regisBytes: number;
  /** The bytes of its NAPLPS (PAR-5). */
  readonly naplpsBytes: number;
  /** The provided sets it uses, by the engine's names (`FONT_SETS`), in order of first use. */
  readonly sets: readonly string[];
  /** The characters that became the language's stand-in. */
  readonly standIns: number;
}

/** How picture text is to be written: as a text part's `language` and `outside` (PAR-21). */
export interface PictureTextOptions {
  readonly language?: LanguageTag;
  readonly outside?: boolean;
}

/** The server's answer as the kit gives it. */
function measuredOf(answer: ServerMessageMeasuredPictureText): MeasuredPictureText {
  return { cells: answer.cells, regisBytes: answer.regis_bytes, naplpsBytes: answer.naplps_bytes, sets: answer.sets, standIns: answer.stand_ins };
}

/** The measures of picture text sent and not yet answered, by their numbers. */
export class PictureTextMeasures extends Requests<ServerMessageMeasuredPictureText> {
  constructor() {
    super({
      message: "measure_picture_text",
      called: "picture text measure",
      first: 0,
      last: LAST_REQUEST,
      refusedAs: (refusal) => new PictureTextRefusedError(refusal),
    });
  }

  /** Sends `measure_picture_text` for `text`, resolving to what the server measured, or rejecting with its refusal. */
  async measure(app: App, text: string, options: PictureTextOptions): Promise<MeasuredPictureText> {
    const answer = await this.ask((request) => {
      app.send({
        type: "measure_picture_text",
        request,
        text,
        ...(options.language === undefined ? {} : { language: options.language }),
        ...(options.outside === true ? { outside: true } : {}),
      });
    });
    return measuredOf(answer);
  }
}

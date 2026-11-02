// `start` as the server writes it to the fixture channel: the standard's
// maxima and the server's budgets, at protocol 7.

/** The server's first line to a program it starts. */
export const START_LINE =
  '{"type":"start","protocol":7,"epoch_ms":0,"standard":{"magazines":8,"pages":2022,"pages_per_magazine":253,"pages_in_magazine_1":251,"keyable_pages":800,"subpages":8190,"decimal_subpages":3199},"budgets":{"line_bytes":16777216,"title_characters":120,"author_log_bytes":200,"log_characters":1000,"named_connections":4096,"reply_limit_ms":5000,"description_text_characters":16000,"description_limit_ms":2000}}';

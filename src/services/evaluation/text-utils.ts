// Strip unpaired UTF-16 surrogates so the resulting string is safe to send
// through a UTF-8 transport like Postgres. Characters outside the Basic
// Multilingual Plane (math italics 𝑃 𝑥, certain emoji, etc.) are stored
// in JS strings as a high+low surrogate pair; slicing on code-unit
// boundaries can split that pair and leave an orphan half that Postgres
// rejects with `invalid byte sequence for encoding "UTF8": 0xef`.
//
// We replace lone surrogates with the Unicode replacement character so
// the excerpt still reads sensibly instead of silently collapsing.
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export function stripLoneSurrogates(input: string): string {
  return input.replace(LONE_SURROGATE_RE, '�')
}

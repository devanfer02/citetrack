export type KbbiParseResult = {
  lema: string | null
  arti: string[] | null
}

export type KbbiParser = (html: string) => KbbiParseResult

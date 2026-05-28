# KNOWLEDGE_BASE — CiteTrack Evaluation Feature

> **Source of truth** for the Evaluation feature. Before writing or modifying any Evaluation-feature code (KBBI / EYD checks), read the relevant section here. When a rule feels ambiguous, re-read the rule rather than guessing.

This file consolidates two bodies of knowledge that drive the Evaluation feature:

1. **KBBI integration** — data shape of the PostgreSQL dump, 3-tier lookup strategy, and the 4 scrape sources ported from the legacy `kbbi.js/` reference.
2. **EYD (Ejaan Bahasa Indonesia yang Disempurnakan)** — full rule set scraped from https://eyd.netlify.app/ (authoritative per Permendiknas 46/2009).

---

## 1 · KBBI Integration

### 1.1 Data source — PostgreSQL dump

Local file (gitignored): `data/sql/dictionary_PostgreSQL.sql` (~25 MB, ~221 466 rows).

Origin of the committed dump: [`dyazincahya/KBBI-SQL-database`](https://github.com/dyazincahya/KBBI-SQL-database) (~71k distinct lower/trim words; KBBI ed. III vintage — missing many modern loanwords like `konten`, `fitur`, `validasi`, `literasi`).

Target table:

```sql
dictionary (
  word    TEXT NOT NULL,   -- may have trailing space ("abad ")
  arti    TEXT,            -- HTML-escaped KBBI entry (polysemy → multiple rows per word)
  type    INTEGER,         -- dump-defined, usage TBD
  source  TEXT NOT NULL DEFAULT 'kbbi-dyazincahya'  -- data lineage per row
)
CREATE INDEX dictionary_word_lower_trim_idx ON dictionary (lower(trim(word)));
```

**Lemma supplement (tier-1 membership augmentation).** `dictionary_lemma` is a membership-only table that fills the dump's gaps from the **LGPL** [`shuLhan/hunspell-id`](https://github.com/shuLhan/hunspell-id) lexicon (~45k lemmas; adds ~13.7k words the dump lacks, including the modern loanwords above):

```sql
dictionary_lemma (
  word    TEXT PRIMARY KEY,   -- lower-cased, trimmed; no definitions
  source  TEXT NOT NULL       -- e.g. 'hunspell-id-shulhan'
)
```

Regenerate the seed with `bun .claude/scripts/build-kbbi-supplement.ts` → writes `deploy/seed/kbbi-lemma-supplement.sql` (idempotent `INSERT … ON CONFLICT DO NOTHING`). `docker-entrypoint.sh` loads both `kbbi-dictionary.sql` and the lemma supplement (each guarded by a row-count check). `dict-store.warmDictStore()` unions `dictionary` ∪ `dictionary_lemma` into the in-memory membership set.

### 1.2 Cache table for scraper fallback

```sql
dictionary_cache (
  word        TEXT PRIMARY KEY,         -- lower-cased, trimmed
  found       BOOLEAN NOT NULL,         -- negative cache too
  source      TEXT,                     -- "kbbi.kemendikdasmen.go.id" | "kbbi.web.id" | "typoonline.com" | "kbbi.co.id" | null
  arti        TEXT,
  fetched_at  TIMESTAMP NOT NULL DEFAULT now()
)
```

### 1.3 Lookup strategy — 3 tiers

Defined by `isKnownWord(raw: string): Promise<LookupResult>` in `src/services/evaluation/kbbi/lookup.ts`:

1. **Tier 1 — local membership:** the in-memory set unions `dictionary` (dump) ∪ `dictionary_lemma` (hunspell supplement). A hit returns `source: 'local-database'`.
2. **Tier 2 — cache:** `SELECT found FROM dictionary_cache WHERE word = $1`. A negative/positive cache hit returns `source: 'kbbi-online'` (it was originally resolved online).
3. **Tier 3 — scrape:** `cari(word)` against the 4 sources in fallback order (§1.4). Persist the outcome to `dictionary_cache`. Conclusive results return `source: 'kbbi-online'`; if every source is rate-limited/unreachable the verdict is `source: 'unverified'` (`databaseOnly: true`).

**Verification source surfaced to the user.** `LookupResult.source` (`'user-vocabulary' | 'local-database' | 'english-list' | 'kbbi-online' | 'unverified'`) records where the verdict came from. For unknown-word findings the analyzer stores `verificationSource` on `evaluation_findings`: `'kbbi-daring'` when KBBI online was actually consulted (high confidence — "tidak ditemukan di basis data lokal maupun KBBI daring"), or `'basis-data'` when only the local set was checked (online unreachable — message says so explicitly). The findings table renders this as a "diperiksa: …" label so a warning is transparent about its basis.

**Affix stripping before tier 3:** If tier-1 misses, try stripping common prefixes (`me[mnlry]?-`, `meng-` / `meny-` allomorphs before vowel-initial bases, `di-`, `be(r)-`, `te(r)-`, `pe(r)-`, `se-`, `ke-`, and the `peng-` / `pen-` / `pem-` / `pel-` allomorphs) and suffixes (`-kan`, `-an`, `-i`, `-nya`, `-lah`, `-kah`, `-mu`, `-ku`), retrying tier 1 with each candidate stem. Canonical list lives in `AFFIX_PREFIX_RULES` / `AFFIX_SUFFIX_RULES` in `lookup.ts`. Only fall through to tiers 2/3 if all stems miss.

**Proper-noun skip:** Tokens that are purely numeric, ≥2-char all-uppercase (acronyms), or capitalized mid-sentence (not at sentence start) are never looked up — assumed proper nouns.

**Roman-numeral skip:** Small Roman numerals (`i`–`xxxix`, case-insensitive) match `ROMAN_NUMERAL_RE = /^x{0,3}(ix|iv|v?i{0,3})$/i` in `analyzer.ts` and are skipped by `isStructuralNonToken`. Front-matter page numbers (`ii`, `iii`, `iv`, …, `vi`, `vii`, `ix`, `x`, `xi`, …) would otherwise surface as `kbbi.unknown-word.database-only` warnings. The regex deliberately restricts itself to `i` / `v` / `x` letters to avoid colliding with common Indonesian short words and abbreviations (`di`, `mi`, `cd`, `cm`, `mm`, `dl`) that a full Roman regex would falsely match.

**Disable local dump:** When the admin toggle `kbbi.disable_local_dump = 1` is set, `existsInDictionary` always returns `false` and every candidate word goes through cache → `cari()` against the 4 scrape sources. Use for cases where the seeded dump is suspected stale; expect significantly longer evaluations because every word now hits HTTP. The toggle is read in `warmKbbiCaches()` and persists for the lifetime of the evaluation job.

**External-lookup budget (`kbbi.external_lookup_budget`, default 300).** A per-job cap on how many unique unknown words may be sent to the external scrape sources. Reset to the config value by `warmKbbiCaches()` at job start, decremented before each `cari()` call. When the counter reaches 0, subsequent unknown words short-circuit to `{ databaseOnly: true, source: 'unverified' }` without contacting any source — they surface as `kbbi.unknown-word.database-only` findings with the standard "tidak bisa diverifikasi ke KBBI online saat ini" message. Set the config value to `0` to disable the cap (treated as `Infinity`). Rate-limit protection per-host is still handled separately by `src/lib/http-throttle.ts` (400ms FIFO gap + jitter + 429/503 cooldown via `Retry-After`); the budget is an additional document-level guard against long theses that would otherwise produce hundreds of unique unknown words and saturate every source.

**External-lookup timeout (`kbbi.external_lookup_timeout_ms`, default 7000).** A self-imposed per-word deadline on the `cari()` scrape. Read by `warmKbbiCaches()` into a module-level `externalLookupTimeoutMs`; when it elapses, `doLookup()` aborts the in-flight fetch with a `LookupTimeoutError` (defined in `src/lib/lookup-timeout.ts`). `logged-fetch.ts` recognizes that abort reason and tags the api-log row `outcome: 'aborted'` (a dedicated outcome, distinct from `network_error`/`timeout`) with a message pointing at this config key — so the admin Log API view shows it is our own limit, not a real network failure. The aborted word resolves to `{ databaseOnly: true, source: 'unverified' }`. Set the value to `0` to disable the timeout (stored as `Infinity`; no timer is armed), mirroring the budget's `0 = unlimited` convention. Displayed/edited in seconds (`CONFIG_DISPLAY: 'ms-as-seconds'`), stored in ms. The `'aborted'` outcome is filterable on `/admin/api-logs` and counted in the stats panel separately from errors (it is not part of the error rate).

### 1.4 Scrape sources (ported from kbbi.js/, MIT by JastinXyz)

Fallback order:

1. `kbbi.kemendikdasmen.go.id` → `https://kbbi.kemendikdasmen.go.id/entri/{keyword}`
2. `kbbi.web.id` → `https://kbbi.web.id/{keyword}`
3. `typoonline.com` → `https://typoonline.com/kbbi/{keyword}` (needs browser-like `user-agent` + `accept-language: id-ID`)
4. `kbbi.co.id` → `https://kbbi.co.id/arti-kata/{keyword}`

Each parser returns `{ lema: string | null, arti: string[] | null }`; the first source returning a non-null lema wins. All sources share a normalizer that converts mid-dots (`·`, `&#183;`) back into periods and collapses whitespace.


---

## 2 · EYD — Ejaan Bahasa Indonesia yang Disempurnakan

Source: https://eyd.netlify.app/ (full mirror). Scraped and distilled below. Rules fall into four major categories:

- **§2.1 Penggunaan Huruf** — alphabet, capitalization, italic, bold
- **§2.2 Penulisan Kata** — base words, derivations, word division, prepositions (di/ke/dari), particles (-lah/-kah/pun), abbreviations, numerals, pronouns, articles
- **§2.3 Penggunaan Tanda Baca** — all punctuation marks
- **§2.4 Penulisan Unsur Serapan** — loanwords (general + specialized)

When running **rule-based** EYD checks, the deterministic patterns most worth automating (high value, low false-positive risk) are:

- Preposition `di`/`ke`/`dari` as free words before nouns vs prefix before verbs (§2.2 Kata Depan).
- Particle `pun` separated (except fixed forms `walaupun`, `meskipun`, `adapun`, `andaipun`, `biarpun`, `kalaupun`, `kendatipun`, `maupun`, `sekalipun`, `sungguhpun`) (§2.2 Partikel).
- Particles `-lah`, `-kah`, `-tah` attached directly (no space) (§2.2 Partikel).
- Double-space detection, space before punctuation, en-dash vs hyphen (§2.3 Tanda Hubung / Tanda Pisah).
- `daripada` one word; `di mana` / `ke mana` two words (§2.2 Kata Depan).
- Dates: `1 Januari 2020` style (§2.2 Angka dan Bilangan).

When running **Agent SDK** EYD checks, feed the relevant §3.x sub-section inline so the model has canonical reference text for its reasoning.

### 2.0 Implemented Deterministic Rules (current catalog)

This is the catalog of rule IDs currently shipped, with source location and false-positive guards. The reference site at https://eyd.netlify.app/ is the authority on the underlying EYD rule; this table only documents *what we actually check programmatically*. Section anchors (`§2.x`) point at the verbatim scrapes lower in this document.

**Regex rules — `src/services/evaluation/eyd/rules.ts`:**

| Rule ID | Severity | Detects | FP guards | KB anchor |
|---|---|---|---|---|
| `eyd.double-space` | warning | Two or more spaces between words | — | §2.3 (spacing) |
| `eyd.space-before-punct` | warning | Space before `,.;:!?` | Skips TOC leader dots (`...... 5`) via `isLeaderDot` callback | §2.3.1 / §2.3.2 |
| `eyd.missing-space-after-punct` | warning | `word,word` / `kata.Sub` without space | Requires `{2,}` letters on both sides, so abbreviations like `M.Hum.`, `S.Pd.`, `Ph.D.`, `e.g.` don't trigger. Digit-digit pairs (`1.000`, `12,5`, `12:30`) skip naturally. URL ranges via `collectUrlRanges` excluded by the analyzer | §2.3.1 / §2.3.2 |
| `eyd.repeated-punct` | warning | Repeated `,;:!?` (e.g., `,,` `;;`) | — | §2.3.x |
| `eyd.repeated-period` | warning | Repeated `.` (e.g., `..`, `....`) | Skips exactly 3 (valid ellipsis per §2.3.9) and 6+ (TOC leader dots) | §2.3.1 / §2.3.9 |
| `eyd.english-number-format` | info | English thousand-separator (`1,000` / `1,234.5`) | Requires `\d{1,3}(,\d{3})+` so Indonesian decimal `12,5` and section numbers `1.1`, `2.3.4` are naturally excluded | §2.2.7 / §2.3.1 |
| `eyd.di-locative-one-word` | error | `di` merged with a locative noun (`disekolah` → `di sekolah`) | Curated whitelist of ~60 locative nouns in `LOCATIVE_AFTER_DI`: spatial (`atas`, `bawah`, `dalam`, `luar`, `samping`, `depan`, `belakang`, …), demonstratives (`sini`, `sana`, `situ`, `mana`), places (`rumah`, `sekolah`, `kantor`, `kelas`, `kampus`, `kota`, `desa`, `pasar`, `taman`, `masjid`, `gereja`, …). Replaces the older 5 hardcoded rules (diatas, dibawah, didalam, diluar, dimana) | §2.2.4 |
| `eyd.kemana-one-word` | error | `kemana` → `ke mana` | — | §2.2.4 |
| `eyd.daripada-two-words` | error | `dari pada` → `daripada` | — | §2.2.2 (gabungan kata serangkai) |
| `eyd.kepada-two-words` | error | `ke pada` → `kepada` | — | §2.2.2 |
| `eyd.bagaimana-two-words` | error | `bagai mana` → `bagaimana` | — | §2.2.2 |
| `eyd.ketika-two-words` | error | `ke tika` → `ketika` | — | §2.2.2 |
| `eyd.particle-lah-separated` | error | `word lah/kah/tah` with space → joined | — | §2.2.5 |
| `eyd.particle-pun-attached` | error | `wordpun` joined → split as `word pun` | Whitelist of 14 fixed forms in `PUN_FIXED_FORMS`: `adapun`, `andaipun`, `ataupun`, `bagaimanapun`, `biarpun`, `jikapun`, `kalaupun`, `kendatipun`, `maupun`, `meskipun`, `sekalipun`, `sementangpun`, `sungguhpun`, `walaupun` | §2.2.5 |
| `eyd.di-passive-split` | warning | `di X` split where X is a passive verb (`di gunakan` → `digunakan`) | Skips entries in `LOCATIVE_SET` (so it doesn't conflict with `eyd.di-locative-one-word`). Fires only if X is in `COMMON_PASSIVE_VERBS` (~75 transitive verbs: `bawa`, `lihat`, `gunakan`, `lakukan`, `terapkan`, `pelajari`, `analisis`, `tunjukkan`, …) OR ends in `-kan` with length ≥5. Severity is `warning`, not `error`, due to residual ambiguity (`di pasang` could be verb `pasang` or noun `pair`) | §2.2.4 |

**Corpus-aware checks — `src/services/evaluation/eyd/analyzer.ts`:**

| Rule ID | Severity | Detects | FP guards |
|---|---|---|---|
| `eyd.foreign-not-italic` | warning | English / tech terms not in italic | Skips: tokens < 4 chars; all-caps acronyms ≤6 chars; mid-sentence Capitalized tokens (treated as proper nouns); URL ranges; code ranges; italic ranges. Uses KBBI lookup (`isKnownWord`) + cached vocabulary classification to confirm the token is genuinely foreign |
| `eyd.acronym-undeclared` | warning | All-caps 2–8 char acronym used without prior `Phrase (ACRONYM)` declaration anywhere earlier in the document | Two-pass: pass 1 builds `declared` map by matching `(?:\b[A-Za-zà-ÿ][\w-]*\s+){2,9}\(([A-Z]{2,8})\)`. Pass 2 skips if: in `UNIVERSAL_ACRONYMS` (~155 common acronyms — SD/SDN, SMK/SMKN, S1, AI, ML, URL, KTP, BUMN, UU, SARA, NIK, WHO, …), in `SECTION_HEADER_WORDS` (Indonesian section words written all-caps that aren't real acronyms — DAFTAR, TABEL, GAMBAR, BAB, LANDASAN, ANALISIS, ABSTRAK, KAJIAN, TUJUAN, PRAKATA, SISTEM, TERKAIT, KINERJA, SOLUSI, EVALUASI, PENGESAHAN, …), is a Roman numeral, preceded within 30 chars by a label context (`BAB`, `Tabel`, `Gambar`, `Lampiran`, `Pasal`, `Halaman`), or sits inside a **title-block range** (run of 3+ consecutive all-caps words, optionally separated by digits — handles cover pages and chapter titles with leading page numbers), or on a line containing `\.{4,}` **TOC leader dots** (suppresses runs of all-caps words inside table-of-contents entries), or on a **caption line** matching `^\s*(?:\d+\s+)?(?:DAFTAR\s+(?:ISI\|TABEL\|GAMBAR\|LAMPIRAN\|PUSTAKA\|REFERENSI)\|(?:Tabel\|Gambar\|Lampiran\|Bab)\s+\d+(?:\.\s*\d+)*)` (catches `ATP` in `Tabel 4.1 ATP …`, `ADDIE` in `Gambar 4.1 ADDIE …`, `QP` in `69 Tabel 4. 7 …`, `EVALUASI` in `102 BAB 6 …`, `TKJ` in `7 DAFTAR GAMBAR Gambar 3.1 …`), or inside URL / code / italic ranges. Document-wide dedup so each undeclared acronym fires exactly once |

**Pre-flight document-wide skips (in `analyzeEyd`):**

- Pages from `DAFTAR REFERENSI` / `DAFTAR PUSTAKA` onward are excluded from rules entirely (bibliography is allowed to violate EYD prose conventions like italicized foreign words).
- The references page detection has TOC false-positive protection: skips pages where `\.{6,}` leader dots co-occur with `BAB \d+ ... BAB \d+` listings.

**Configuration data — adjustable by users:**

- Locative noun whitelist (`LOCATIVE_AFTER_DI`) and verb whitelist (`COMMON_PASSIVE_VERBS`) are currently hardcoded in `rules.ts`. Future work: surface these via the `app_configurations` / `vocabulary` tables so they're editable per-job.
- Acronym whitelist (`UNIVERSAL_ACRONYMS`) is hardcoded in `analyzer.ts`. Same future-work note.
- KBBI cache classification (`'indonesian' | 'english' | 'tech' | 'brand' | 'ignore' | 'typo'`) IS stored in `vocabulary` + `vocabulary_cache` tables and editable per-job; see §1.

**Known coverage gaps** (from §2.x audit, intentionally deferred):

- En-dash vs hyphen (`–` for ranges vs `-` for joining) — §2.3.5 / §2.3.6.
- Date format `1 Januari 2020` style — §2.2.7.
- Currency style `Rp50.000,00` — §2.3.1 + §2.2.7.
- Reduplication forms (`anak anak` → `anak-anak`) — §2.2.2 bentuk ulang.
- Heading capitalization (judul: setiap kata kapital kecuali kata tugas) — §2.1.6.
- POS-aware generalization of the `di` rules (would require POS data from the KBBI dump's `arti` HTML; currently using curated lists instead).
- APA citation style — out of scope for EYD; would live in a new `'citation-style'` value of `evaluationCategoryEnum` with its own module under `src/services/evaluation/citation/`. References are already parsed by `src/services/parser/references.ts`.

Sub-sections below are verbatim from eyd.netlify.app (edit-in-GitHub footer links stripped).

---


### 2.1.1 Huruf Abjad

Huruf dalam abjad bahasa Indonesia ada 26 seperti dalam tabel berikut.

| Kapital | Nonkapital | Nama | Ucapan |
| --- | --- | --- | --- |
| A | a | a | a |
| B | b | be | be |
| C | c | ce | ce |
| D | d | de | de |
| E | e | e | e |
| F | f | ef | ef |
| G | g | ge | ge |
| H | h | ha | ha |
| I | i | i | i |
| J | j | je | je |
| K | k | ka | ka |
| L | l | el | el |
| M | m | em | em |
| N | n | en | en |
| O | o | o | o |
| P | p | pe | pe |
| Q | q | ki | ki |
| R | r | er | er |
| S | s | es | es |
| T | t | te | te |
| U | u | u | u |
| V | v | ve | ve |
| W | w | we | we |
| X | x | eks | eks |
| Y | y | ye | ye |
| Z | z | zet | zet |



### 2.1.2 Huruf Vokal

Vokal dalam bahasa Indonesia dilambangkan menjadi lima huruf, yaitu *a*, *e*, *i*, *o*, dan *u*.

| Huruf Vokal | Posisi Awal | Posisi Tengah | Posisi Akhir |
| --- | --- | --- | --- |
| a | *a* pi | p *a* di | lus *a* |
| e\* | *e* nak | p *e* tak | sor *e* |
|  | *e* mas | k *e* na | tip *e* |
| i | *i* tu | s *i* mpan | murn *i* |
| o | *o* leh | k *o* ta | radi *o* |
| u | *u* lang | b *u* mi | ib *u* |

\*) Untuk membedakan pengucapan, pada huruf e pepet dapat diberikan tanda diakritik (ê) yang dilafalkan \[ə\].

Misalnya:

- Anak-anak bermain di teras.
- Upacara itu dihadiri pejabat teras \[têras\] Bank Indonesia.
- Kami menonton film seri.
- Pertandingan itu berakhir seri \[sêri\].
- Seret saja barang itu jika berat!
- Makanan ini membuat kerongkonganku seret \[sêrêt\].


### 2.1.3 Huruf Konsonan

Konsonan dalam bahasa Indonesia dilambangkan menjadi 21 huruf, yaitu *b*, *c*, *d*, *f*, *g*, *h*, *j*, *k*, *l*, *m*, *n*, *p*, *q*, *r*, *s*, *t*, *v*, *w*, *x*, *y*, dan *z*.

| Huruf Konsonan | Posisi Awal | Posisi Tengah | Posisi Akhir |
| --- | --- | --- | --- |
| b | *b* ahasa | se *b* ut | ada *b* |
| c | *c* akap | ka *c* a | \- |
| d | *d* ua | a *d* a | aba *d* |
| f | *f* akir | ka *f* an | maa *f* |
| g | *g* una | ti *g* a | gude *g* |
| h | *h* ari | sa *h* am | tua *h* |
| j | *j* alan | man *j* a | mikra *j* |
| k | *k* ami | pa *k* sa | politi *k* |
| l | *l* ekas | a *l* as | aka *l* |
| m | *m* aka | ka *m* i | dia *m* |
| n | *n* ama | ta *n* ah | dau *n* |
| p | *p* asang | a *p* a | sia *p* |
| q\* | *q* ariah | i *q* ra | Benua *q* |
| r | *r* aih | ba *r* a | puta *r* |
| s | *s* ampai | a *s* li | tangka *s* |
| t | *t* ali | ma *t* a | rapa *t* |
| v | *v* ariasi | la *v* a | moloto *v* |
| w | *w* anita | ha *w* a | takra *w* |
| x\* | *x* enon | mar *x* isme | Ma *x* |
| y | *y* akin | pa *y* ung | ala ***y*** |
| z | *z* eni | la *z* im | ju *z* |

\*) Huruf q dan x khusus digunakan untuk nama diri dan keperluan bidang tertentu. Huruf x pada posisi awal kata diucapkan \[s\] dan pada posisi tengah atau akhir diucapkan \[ks\].



### 2.1.4 Gabungan Huruf Vokal (Diftong)

> 1. Monoftong

Monoftong dalam bahasa Indonesia dilambangkan dengan gabungan huruf vokal *eu* yang dilafalkan \[ɘ\].

| Monoftong | Posisi Awal | Posisi Tengah | Posisi Akhir |
| --- | --- | --- | --- |
| eu | *eu* rih | s *eu* dati | sad *eu* |

> 1. Diftong

Diftong dalam bahasa Indonesia dilambangkan dengan gabungan huruf vokal *ai*, *au*, *ei*, dan *oi*.

| Diftong | Posisi Awal | Posisi Tengah | Posisi Akhir |
| --- | --- | --- | --- |
| ai | *ai* kido | k *ai* lan | pand *ai* |
| au | *au* dit | t *au* fik | harim *au* |
| ei | *ei* gendom | g *ei* ser | surv *ei* |
| oi | *oi* kumene | b *oi* kot | kob *oi* |



### 2.1.5 Gabungan Huruf Konsonan

Gabungan huruf konsonan *kh*, *ng*, *ny*, dan *sy* melambangkan satu bunyi konsonan.

| Gabungan Huruf Konsonan | Posisi Awal | Posisi Tengah | Posisi Akhir |
| --- | --- | --- | --- |
| kh | *kh* usus | a *kh* ir | tari *kh* |
| ng | *ng* arai | ba *ng* un | sena *ng* |
| ny | *ny* ata | ba *ny* ak | \- |
| sy | *sy* arat | mu *sy* awarah | ara *sy* |



### 2.1.6 Huruf Kapital

> 1. Huruf kapital digunakan sebagai huruf pertama awal kalimat.

Misalnya:

- *A* pa maksudnya?
- *T* olong ambilkan buku itu!
- *K* ita harus bekerja keras.
- *P* ekerjaan itu akan selesai dalam 1 jam.

> 1. Huruf kapital digunakan sebagai huruf pertama unsur nama orang, termasuk julukan.

Misalnya:

- *A* mir *H* amzah
- *D* ewi *S* artika
- *A* ndré- *M* arie *A* mpère
- *J* ames *W* att
- *M* ujair
- *R* udolf *D* iesel
- *B* apak *K* operasi
- *J* enderal *K* ancil

> 1. Huruf kapital *tidak* digunakan sebagai huruf pertama nama orang yang digunakan sebagai nama jenis atau satuan ukuran.

Misalnya:

- 5 *a* mpere
- 15 *w* att
- ikan *m* ujair
- *m* esin *d* iesel

> 1. Huruf kapital digunakan pada nama orang seperti pada nama teori, hukum, dan rumus.

Misalnya:

- teori *D* arwin
- hukum *A* rchimedes
- rumus *P* hytagoras

> 1. Huruf kapital *tidak* digunakan untuk menuliskan huruf pertama kata yang bermakna 'anak dari', seperti *bin*, *binti*, *boru*, dan *van*, kecuali dituliskan sebagai awal nama atau huruf pertama kata tugas *dari*.

Misalnya:

- Abdul Rahman *bin* Zaini
- Fatimah *binti* Salim
- Indani *boru* Sitanggang
- Ayam Jantan *dari* Timur
- Charles Adriaan *van* Ophuijsen
- Salah satu pencetak gol terbanyak adalah Van Basten.

> 1. Huruf kapital digunakan pada awal kalimat dalam petikan langsung.

Misalnya:

- Ibu berpesan, " *B* erhati-hatilah, Nak!"
- " *M* ereka berhasil meraih medali emas," katanya.
- " *B* esok pagi," kata Rino, "mereka akan berangkat."

> 1. Huruf kapital digunakan sebagai huruf pertama dalam hal tertentu yang berkaitan dengan nama agama, kitab suci, dan Tuhan, termasuk sebutan dan kata ganti Tuhan serta singkatan nama Tuhan.

Misalnya:

- *B* uddha
- *H* indu
- *I* slam
- *K* risten
- *K* onghucu
- *A* l-Qur'an
- *A* lkitab
- *W* eda
- *A* llah
- *T* uhan
- *A* llah Yang Maha Kuasa akan menunjukkan jalan- *N* ya.
- Ya, *T* uhan, bimbinglah hamba ke jalan yang *E* ngkau beri rahmat.
- Tuhan *YME* (*Y* ang *M* aha *E* sa)
- *A* llah *S* wt. (*S* ubhanahuwataala)

> 1. Huruf kapital digunakan sebagai huruf pertama unsur nama gelar kehormatan, kebangsawanan, keturunan, keagamaan, atau akademik yang diikuti nama orang dan gelar akademik yang mengikuti nama orang.

Misalnya:

- *M* ahaputra Yamin
- *T* euku Umar
- *L* a Ode Khairudin
- *K* iai *H* aji Hasjim Asy'ari
- *D* oktor Mohammad Hatta
- Irwansyah, *M* agister *H* umaniora

> 1. Huruf kapital digunakan sebagai huruf pertama unsur nama gelar kehormatan, keturunan, keagamaan, profesi, serta nama jabatan dan kepangkatan yang digunakan sebagai sapaan.

Misalnya:

- Selamat datang, *Y* ang *M* ulia.
- Semoga berbahagia, *R* aden.
- Terima kasih, *K* iai.
- Selamat pagi, *D* okter.
- Silakan duduk, *P* rof.
- Siap, *J* enderal.

> 1. Huruf kapital digunakan sebagai huruf pertama unsur nama jabatan dan pangkat yang diikuti nama orang atau yang digunakan sebagai pengganti nama orang, nama instansi, atau nama tempat.

Misalnya:

- *W* akil *P* residen Adam Malik
- *P* erdana *M* enteri Nehru
- *P* rofesor Anton M. Moeliono
- *L* aksamana *M* uda *U* dara Husein Sastranegara
- *P* roklamator Republik Indonesia
- *S* ekretaris *J* enderal Kementerian Luar Negeri
- *G* ubernur Papua Barat

> 1. Huruf kapital digunakan sebagai huruf pertama seperti pada nama bangsa, suku, bahasa, dan aksara.

Misalnya:

- bangsa *I* ndonesia
- suku *D* ani
- bahasa *T* olaki
- aksara *K* anganga

> 1. Huruf kapital *tidak* digunakan pada nama bangsa, suku, bahasa, dan aksara yang berupa bentuk dasar kata turunan.

Misalnya:

- peng *i* ndonesiaan kata asing
- ke *i* nggris- *i* nggrisan
- ke *s* unda- *s* undaan

> 1. Huruf kapital digunakan pada huruf pertama, seperti pada nama tahun, bulan, hari, dan hari besar atau hari raya.

Misalnya:

- tahun *H* ijriah
- bulan *A* gustus
- hari *J* umat
- hari *L* ebaran
- tarikh *M* asehi
- bulan *M* aulid
- hari *G* ulungan
- hari *N* atal

> 1. Huruf kapital digunakan pada huruf pertama unsur nama peristiwa sejarah.

Misalnya:

- *K* onferensi *A* sia *A* frika
- *P* erang *D* unia II
- *P* roklamasi *K* emerdekaan Indonesia
- *H* ari *P* endidikan *N* asional

> 1. Huruf pertama peristiwa sejarah yang tidak digunakan sebagai nama ditulis dengan huruf nonkapital.

Misalnya:

- Kami memperingati *proklamasi kemerdekaan* setiap tahun.
- Perlombaan senjata membawa risiko pecahnya *perang dunia*.

> 1. Huruf kapital digunakan sebagai huruf pertama nama geografi.

Misalnya:

- *B* enua *A* frika
- *A* sia *T* enggara
- *P* ulau *M* iangas
- *J* azirah *A* rab
- *D* ataran *T* inggi *D* ieng
- *G* unung *S* emeru
- *P* egunungan *H* imalaya
- *B* ukit *B* arisan
- *D* anau *T* oba
- *N* garai *S* ianok
- *L* embah *B* aliem
- *S* ungai *M* amberamo
- *T* anjung *H* arapan
- *S* elat *L* ombok
- *T* eluk *P* ersia
- *T* erusan *S* uez
- *J* awa *B* arat
- *J* akarta
- *K* abupaten *K* onawe
- *K* ota *K* upang
- *K* ecamatan *R* engasdengklok
- *D* istrik *S* amofa
- *D* esa *S* entul
- *K* elurahan *R* awamangun
- *J* alan *P* olonia
- *G* ang *K* elinci
- *L* antai II *G* edung *T* abrani
- *R* uang *P* oerwadarminta *G* edung *Y* udistira

> 1. Huruf pertama unsur geografi yang tidak diikuti nama diri ditulis dengan huruf nonkapital.

Misalnya:

- berlayar ke *t* eluk
- mandi di *s* ungai
- menyeberangi *s* elat
- berenang di *d* anau

> 1. Huruf pertama nama diri geografi yang digunakan sebagai nama jenis ditulis dengan huruf nonkapital.

Misalnya:

- jeruk *b* ali (*Citrus maxima*)
- kacang *b* ogor (*Voandzeia subterranea*)
- nangka *b* elanda (*Anona muricata*)
- petai *c* ina (*Leucaena glauca*)

Catatan:

> Nama yang disertai nama geografi dan merupakan nama jenis dapat dikontraskan atau disejajarkan dengan nama jenis lain dalam kelompoknya.

Misalnya:

- Kita mengenal berbagai macam gula, seperti gula *j* awa, gula *p* asir, gula *t* ebu, gula *a* ren, dan gula *a* nggur.
- Kunci *i* nggris, kunci *t* olak, dan kunci *r* ing mempunyai fungsi yang berbeda.

> 1. Huruf kapital digunakan untuk nama geografi yang menyatakan asal daerah.

- batik *C* irebon
- bubur *M* anado
- film *I* ndonesia
- kopi *G* ayo
- satai *M* adura
- soto *B* anjar
- tari *B* ali

> 1. Huruf kapital digunakan sebagai huruf pertama semua kata (termasuk unsur bentuk ulang utuh) seperti pada nama negara, lembaga, badan, organisasi, atau dokumen, kecuali kata tugas.

Misalnya:

- *B* osnia dan *H* erzegovina
- *I* katan *A* hli *K* esehatan *M* asyarakat *I* ndonesia
- *K* itab *U* ndang- *U* ndang *H* ukum *P* idana
- *M* ajelis *P* ermusyawaratan *R* akyat *R* epublik *I* ndonesia
- *P* eraturan *P* residen *R* epublik *I* ndonesia *N* omor 63 *T* ahun 2019 tentang *P* enggunaan *B* ahasa *I* ndonesia
- *P* erserikatan *B* angsa- *B* angsa

> 1. Huruf kapital digunakan sebagai huruf pertama setiap kata (termasuk unsur bentuk ulang utuh) di dalam judul buku, karangan, artikel, dan makalah, serta nama media massa, kecuali kata tugas yang tidak terletak pada posisi awal.

Misalnya:

- Saya telah membaca buku ***D*** ari ***A*** ve ***M*** aria ke ***J*** alan ***L*** ain ke ***R*** oma.
- Tulisan itu dimuat dalam majalah ***B*** ahasa dan ***S*** astra.
- Dia agen surat kabar ***S*** inar ***P*** embangunan.
- Berita berjudul " *L* istrik *S* ahabat *P* etani" dimuat di *paktani.com*.
- Ia menyajikan makalah " *P* enerapan *A* sas- *A* sas *H* ukum *P* erdata".

> 1. Huruf kapital digunakan sebagai huruf pertama unsur singkatan nama gelar dan nama pangkat.

Misalnya:

- *S.E* = sarjana ekonomi
- *M.S* i. = magister sains
- *H* j. = hajah
- *P* dt. = pendeta
- *D* g. = daeng
- *D* t. = datuk
- *K.R.T.* = kanjeng raden tumenggung
- *K* ol. = kolonel

> 1. Huruf kapital digunakan sebagai huruf pertama kata penunjuk hubungan kekerabatan, seperti *bapak*, *ibu*, *kakak*, dan *adik* serta kata atau ungkapan lain (termasuk unsur bentuk ulang utuh) yang digunakan sebagai sapaan.

Misalnya:

- "Kapan *B* apak berangkat?" tanya Hasan.
- Dendi bertanya, "Itu apa, *B* u?"
- "Silakan duduk, *D* ik!" kata Rani.
- Surat *S* audara telah kami terima dengan baik.
- "Hai, *K* utu *B* uku, sedang membaca apa?"
- "Selamat belajar, *A* nak- *A* nak."
- "Sampai berjumpa kembali, *T* eman- *T* eman."

Catatan:

> a. Kata *Anda* ditulis dengan huruf awal kapital.
> 
>   
> 
> Misalnya:
> 
> - Sudahkah *A* nda tahu?
> - Hanya teman *A* nda yang mengerti masalah itu.
> 
> b. Kata atau ungkapan yang digunakan dalam pengacuan ditulis dengan huruf awal kapital.
> 
>   
> 
> Misalnya:
> 
> - "Bu, saya sudah melaporkan hal ini kepada *B* apak."
> - Besok *P* aman akan datang bersama kakakmu.
> 
> c. Istilah kekerabatan yang diikuti oleh kata yang menunjukkan kepemilikan ditulis dengan huruf nonkapital.
> 
>   
> 
> Misalnya:
> 
> - Kita harus menghormati *b* apak dan *i* bu kita.
> - Semua *k* akak dan *a* dik saya sudah berkeluarga.



### 2.1.7 Huruf Miring

> 1. Huruf miring digunakan untuk menuliskan judul buku, judul film, judul album lagu, judul acara televisi, judul siniar, judul lakon, dan nama media massa yang dikutip dalam tulisan, termasuk dalam daftar pustaka.

Misalnya:

- Saya sudah membaca buku *Salah Asuhan* karangan Abdoel Moeis.
- Majalah *Poedjangga Baroe* menggelorakan semangat kebangsaan.
- Berita itu muncul dalam surat kabar *Cakrawala*.
- Badan Pengembangan dan Pembinaan Bahasa. 2018. *Kamus Besar Bahasa Indonesia*. Edisi Kelima. Cetakan Kedua. Jakarta: Balai Pustaka.
- Acara Bulan Bahasa dimuat di *kabarbahasa.com*.
- Sinetron *Keluarga Cemara* sudah ditayangkan sebanyak belasan episode.
- Film *Habibie dan Ainun* diangkat dari kisah nyata.
- Menteri Pendidikan meluncurkan album *Simfoni Merdeka Belajar*.
- Siniar *Celetuk Bahasa* mengangkat tema kebahasaan.
- Lakon *Petruk Jadi Raja* dipentaskan semalam suntuk.

> 1. Huruf miring digunakan untuk menegaskan atau mengkhususkan huruf, bagian kata, kata, atau kelompok kata dalam kalimat.

Misalnya:

- Huruf terakhir kata *abad* adalah *d*.
- Imbuhan *ber-* pada kata berjasa bermakna 'memiliki'.
- Dalam bab ini *tidak* dibahas pemakaian tanda baca.
- Buatlah kalimat dengan menggunakan ungkapan *lepas tangan*!

> 1. Huruf miring digunakan untuk menuliskan kata atau ungkapan dalam bahasa daerah atau bahasa asing.

Misalnya:

- Kita perlu memperhitungkan rencana kegiatan dengan baik agar tidak *malapeh awo*.
- Nama ilmiah buah manggis ialah *Garcinia mangostana*.
- *Weltanschauung* bermakna 'pandangan dunia'.
- Ungkapan *tut wuri handayani* merupakan semboyan pendidikan.
- Istilah *men sana in corpore sano* sering digunakan dalam bidang olahraga.

Catatan:

> a. Nama diri, seperti nama orang, lembaga, organisasi, atau merek dagang dalam bahasa asing atau bahasa daerah tidak ditulis dengan huruf miring.  
> b. Dalam naskah tulisan tangan atau mesin tik (bukan komputer), bagian yang akan dicetak miring ditandai dengan garis bawah satu.



### 2.1.8 Huruf Tebal

> 1. Huruf tebal digunakan untuk menegaskan bagian tulisan yang sudah ditulis miring.

Misalnya:

- Huruf *dh*, seperti pada kata *Rama **dh** an*, tidak terdapat dalam Ejaan Bahasa Indonesia.
- Kata *et* dalam ungkapan *ora **et** labora* berarti 'dan'.

Catatan:

> Dalam naskah tulisan tangan atau mesin tik (bukan komputer), bagian yang akan dicetak tebal ditandai dengan garis bawah dua.

> 1. Huruf tebal digunakan untuk menegaskan bagian karangan, seperti bab atau subbab.

Misalnya:

- **1.1 Latar Belakang dan Masalah**  
	Kondisi kebahasaan di Indonesia saat ini diwarnai oleh bahasa standar ….
- **1.1.1 Latar Belakang**  
	Masyarakat Indonesia yang heterogen menyebabkan munculnya sikap beragam ….
- **1.1.2 Masalah**  
	Penelitian ini hanya membatasi perencanaan bahasa ….
- **1.2 Tujuan**  
	Penelitian ini bertujuan untuk mengetahui dan mengukur sikap bahasa ….


### 2.2.1 Kata Dasar

[Skip to content](https://eyd.netlify.app/penulisan-kata/kata-dasar#skip)

[EYD](https://eyd.netlify.app/)[Beranda](https://eyd.netlify.app/)

- [Huruf Abjad](https://eyd.netlify.app/penggunaan-huruf/huruf-abjad)
- [Huruf Vokal](https://eyd.netlify.app/penggunaan-huruf/huruf-vokal)
- [Huruf Konsonan](https://eyd.netlify.app/penggunaan-huruf/huruf-konsonan)
- [Gabungan Huruf Vokal](https://eyd.netlify.app/penggunaan-huruf/gabungan-huruf-vokal)
- [Gabungan Huruf Konsonan](https://eyd.netlify.app/penggunaan-huruf/gabungan-huruf-konsonan)
- [Huruf Kapital](https://eyd.netlify.app/penggunaan-huruf/huruf-kapital)
- [Huruf Miring](https://eyd.netlify.app/penggunaan-huruf/huruf-miring)
- [Huruf Tebal](https://eyd.netlify.app/penggunaan-huruf/huruf-tebal)

- [Kata Dasar](https://eyd.netlify.app/penulisan-kata/kata-dasar)
- [Kata Turunan](https://eyd.netlify.app/penulisan-kata/kata-turunan)
- [Pemenggalan Kata](https://eyd.netlify.app/penulisan-kata/pemenggalan-kata)
- [Kata Depan](https://eyd.netlify.app/penulisan-kata/kata-depan)
- [Partikel](https://eyd.netlify.app/penulisan-kata/partikel)
- [Singkatan](https://eyd.netlify.app/penulisan-kata/singkatan)
- [Angka dan Bilangan](https://eyd.netlify.app/penulisan-kata/angka-dan-bilangan)
- [Kata Ganti](https://eyd.netlify.app/penulisan-kata/kata-ganti)
- [Kata Sandang](https://eyd.netlify.app/penulisan-kata/kata-sandang)

- [Tanda Titik (.)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-titik)
- [Tanda Koma (,)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-koma)
- [Tanda Titik Koma (;)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-titik-koma)
- [Tanda Titik Dua (:)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-titik-dua)
- [Tanda Hubung (-)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-hubung)
- [Tanda Pisah (—)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-pisah)
- [Tanda Tanya (?)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-tanya)
- [Tanda Seru (!)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-seru)
- [Tanda Elipsis (...)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-elipsis)
- [Tanda Petik ("...")](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-petik)
- [Tanda Petik Tunggal ('...')](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-petik-tunggal)
- [Tanda Kurung ((...))](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-kurung)
- [Tanda Kurung Siku (\[...\])](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-kurung-siku)
- [Tanda Garis Miring (/)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-garis-miring)
- [Tanda Apostrof (')](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-apostrof)

- [Serapan Umum](https://eyd.netlify.app/penulisan-unsur-serapan/serapan-umum)
- [Serapan Khusus](https://eyd.netlify.app/penulisan-unsur-serapan/serapan-khusus)

# Kata Dasar

Kata dasar ditulis secara mandiri.

Misalnya:

- kantor
- pergi
- ramai
- sangat

- [← Huruf Tebal](https://eyd.netlify.app/penggunaan-huruf/huruf-tebal)
- [Kata Turunan →](https://eyd.netlify.app/penulisan-kata/kata-turunan)

### Komunitas

- [Lisensi](https://eyd.netlify.app/lisensi)
- [Kode sumber](https://github.com/gipsterya/eyd)
- [Sponsor](https://github.com/sponsors/gipsterya)

© 2023 [Gigip Andreas](https://gipsterya.com/)


### 2.2.2 Kata Turunan (Kata Berimbuhan)

> 1. Kata Berimbuhan

a. Kata yang mendapat imbuhan (awalan, sisipan, akhiran, serta gabungan awalan dan akhiran) ditulis serangkai dengan imbuhannya.

Misalnya:

- *ber* jalan
- *mem* permudah
- *me* nulis
- *di* jual
- *pem* baca
- *se* mula
- *ter* batas
- g *el* embung
- k *em* ilau
- k *in* erja
- gereja *wi*
- kamera *wan*
- lukis *an*
- seni *man*
- suku *isme*
- *ke* mau *an*
- *pe* mungut *an*
- *per* baik *an*

b. Kata yang mendapat bentuk terikat ditulis serangkai jika mengacu pada konsep keilmuan tertentu.

Misalnya:

- *adi* busana
- *aero* dinamika
- *antar* golongan
- *anti* kekerasan
- *awa* hama
- *bi* karbonat
- *bio* kimia
- *deka* meter
- *de* moralisasi
- *dwi* warna
- *eka* bahasa
- *ekstra* kurikuler
- *in* konvensional
- *infra* struktur
- *ko* sponsor
- *kontra* indikasi
- *loka* karya
- *manca* negara
- *makro* ekonomi
- *mikro* biologi
- *multi* lateral
- *nara* pidana
- *nir* gagasan
- *non* kolaborasi
- *pari* purna
- *pasca* kebenaran
- *pasca* sarjana
- *pra* anggapan
- *pra* jabatan
- *pramu* saji
- *pramu* wisata
- *pro* aktif
- *purna* wirawan
- *sapta* krida
- *semi* profesional
- *sub* bagian
- *super* cepat
- *swa* daya
- *tan* suara
- *tele* wicara
- *trans* migrasi
- *tri* tunggal
- *tuna* karya
- *ultra* modern
- *wira* swasta
- *ayah* anda
- ego *sentris*
- okta *hendron*

c. Kata yang diawali dengan huruf kapital dan mendapat bentuk terikat dirangkaikan dengan tanda hubung (-).

Misalnya:

- *non* -Indonesia
- *pan* -Afrika
- *pro* -Barat
- *anti* -PKI
- *non* -ASEAN
- *non* -Korpri
- *pasca* -Orba

d. Kata yang ditulis dengan huruf miring dan mendapat bentuk terikat dirangkaikan dengan tanda hubung (-).

Misalnya:

- anti- *mainstream*
- pasca- *reshuffle*
- pra- *Aufklaerung*
- super- *jegeg*

e. Bentuk terikat maha- dan kata dasar atau kata berimbuhan yang mengacu pada nama atau sifat Tuhan ditulis terpisah dengan huruf awal kapital sebagai pengkhususan.

Misalnya:

- Yang *Maha Esa*
- Tuhan Yang *Maha Kuasa*
- Yang *Maha Pengasih*
- Tuhan Yang *Maha Pengampun*
- Tuhan Yang *Maha Pemberi Rezeki*

> 1. Bentuk Ulang

a. Bentuk ulang ditulis dengan menggunakan tanda hubung (-) di antara unsur-unsurnya.

Misalnya:

- anak-anak
- berjalan-jalan
- biri-biri
- buku-buku
- cumi-cumi
- hati-hati
- kuda-kuda
- kupu-kupu
- kura-kura
- lauk-pauk
- mencari-cari
- mondar-mandir
- porak-poranda
- ramah-tamah
- sayur-mayur
- serba-serbi
- terus-menerus
- tunggang-langgang
- cas-cis-cus
- dag-dig-dug

b. Bentuk ulang gabungan kata ditulis dengan mengulang unsur pertama.

Misalnya:

- kapal barang => kapal-kapal barang
- kereta api cepat => kereta-kereta api cepat
- rak buku => rak-rak buku
- surat kabar => surat-surat kabar

> 1. Gabungan Kata

a. Unsur gabungan kata, termasuk istilah khusus, ditulis terpisah.

Misalnya:

- cendera mata
- duta besar
- ibu kota
- kambing hitam
- mata acara
- meja tulis
- model linear
- orang tua
- rumah sakit
- segi empat
- simpang lima
- wali kota

b. Gabungan kata yang dapat menimbulkan salah pengertian ditulis dengan membubuhkan tanda hubung (-) di antara unsur-unsurnya.

Misalnya:

- *buku-sejarah* baru = 'buku sejarah yang baru, bukan buku bekas'
- buku *sejarah-baru* = 'buku tentang sejarah baru'
- *ibu-bapak* kami = 'ibu dan bapak kami'
- ibu *bapak-kami* = 'ibu dari bapak kami (nenek)'

c. Gabungan kata yang mendapat awalan dan akhiran sekaligus ditulis serangkai.

Misalnya:

- *di* lipatganda *kan*
- *meng* garisbawah *i*
- *me* nyebarluas *ka* n
- *peng* hancurlebur *an*
- *per* tanggungjawab *an*

d. Gabungan kata yang hanya mendapat awalan atau akhiran ditulis terpisah.

Misalnya:

- *ber* tepuk tangan
- *meng* anak sungai
- garis bawah *i*
- sebar luas *kan*

e. Gabungan kata berikut ditulis serangkai.

- acapkali
- adakala
- apalagi
- bagaimana
- barangkali
- beasiswa
- belasungkawa
- bilamana
- bumiputra
- daripada
- darmabakti
- dukacita
- hulubalang
- kacamata
- karyawisata
- kasatmata
- kosakata
- manasuka
- matahari
- olahraga
- padahal
- peribahasa
- perilaku
- puspawarna
- saputangan
- sediakala
- segitiga
- sukacita
- sukarela
- syahbandar


### 2.2.3 Pemenggalan Kata

> 1. Pemenggalan kata pada kata dasar dilakukan sebagai berikut.

a. Jika di tengah kata terdapat huruf vokal yang berurutan, pemenggalannya dilakukan di antara kedua huruf vokal itu.

Misalnya:

- b *u* - *a* h
- m *a* - *i* n
- n *i* - *a* t
- s *a* - *a* t

b. Monoftong *eu* tidak dipenggal.

Misalnya:

- ci-l *eu* n-cang
- s *eu* -da-ti
- s *eu* -lu-mat

c. Diftong *ai*, *au*, *ei*, dan *oi* tidak dipenggal.

d. Jika di tengah kata dasar terdapat huruf konsonan (termasuk gabungan huruf konsonan) di antara dua huruf vokal, pemenggalannya dilakukan sebelum huruf konsonan itu.

Misalnya:

- b *a* - *p* ak
- d *e* - *n* gan
- k *e* - *n* yang
- l *a* - *w* an
- m *u* - *ta* - *kh* ir
- m *u* - *sya* - *wa* - *r* ah

e. Jika di tengah kata dasar terdapat dua huruf konsonan yang berurutan, pemenggalannya dilakukan di antara kedua huruf konsonan itu.

Misalnya:

- A *p* - *r* il
- ba *n* - *t* u
- ma *n* - *d* i
- so *m* - *b* ong
- swa *s* - *t* a

f. Jika di tengah kata dasar terdapat tiga huruf konsonan atau lebih yang masing-masing melambangkan satu bunyi, pemenggalannya dilakukan di antara huruf konsonan yang pertama dan huruf konsonan yang kedua.

Misalnya:

- a *m* - *br* uk
- be *n* - *tr* ok
- i *n* - *fr* a
- u *l* - *tr* a
- i *n* - *str* u-men

g. Gabungan huruf konsonan yang melambangkan satu bunyi tidak dipenggal.

Misalnya:

- ba- *ny* ak
- ko *ng* -res
- ma *kh* -luk
- ma *sy* -hur

> 1. Pemenggalan kata pada kata berimbuhan dilakukan sebagai berikut.

a. Pemenggalan kata berimbuhan dilakukan di antara bentuk dasar dan unsur pembentuknya.

Misalnya:

- *ber* -jalan
- *di* -ambil
- *ke* -kasih
- *mem* -bantu
- *peng* -intai
- *per* -buat
- *se* -buah
- *ter* -bawa
- letak- *kan*
- makan- *an*
- *ke* -kuat- *an*
- *me* -rasa- *kan*
- *per* -buat- *an*
- *di* - *per* -jual-beli- *kan*
- *per* -tanggung-jawab- *kan*
- *mem* - *per* -tanggung-jawab- *kan*
- *non* -aktif
- *swa* -foto
- apa- *kah*
- apa- *tah*
- pergi- *lah*

b. Pemenggalan kata berimbuhan yang bentuk dasarnya mengalami perubahan dilakukan seperti pemenggalan pada kata dasar.

Misalnya:

- me- *ma* -kai
- me- *ngun* -ci
- me- *nu* -tup
- me- *nya* -pu
- pe- *mi* -kir
- pe- *nga* -rang
- pe- *no* -long
- pe- *nye* -but

c. Pemenggalan kata yang mendapat sisipan dilakukan seperti pada kata dasar.

Misalnya:

- ge-lem-bung
- ge-mu-ruh
- ge-ri-gi
- si-nam-bung
- te-lun-juk

d. Pemenggalan kata yang menyebabkan munculnya satu huruf di awal atau akhir baris tidak dilakukan.

Misalnya:

- Beberapa pendapat mengenai masalah *i* -  
	*tu* telah disampaikan oleh pembicara.
- Walaupun makanan itu gratis, mereka tidak *ma* -  
	*u* mengambilnya.
- Penerapan protokol kesehatan adalah cara termudah *mengakhir* -  
	*i* pandemi ini.

Penulisan yang seharusnya dilakukan adalah sebagai berikut.

- Beberapa pendapat mengenai masalah  
	*itu* telah disampaikan oleh pembicara.
- Walaupun makanan itu gratis, mereka tidak  
	*mau* mengambilnya.
- Penerapan protokol kesehatan adalah cara termudah *meng* -  
	*akhiri* pandemi ini.

> 1. Jika kata terdiri atas dua unsur atau lebih dan salah satu unsurnya itu dapat bergabung dengan unsur lain, pemenggalannya dilakukan di antara unsur-unsur itu.

Misalnya:

- biografi = bio-grafi
- biodata = bio-data
- fotografi = foto-grafi
- fotokopi = foto-kopi
- introspeksi = intro-speksi
- introjeksi = intro-jeksi
- kilogram = kilo-gram
- kilometer = kilo-meter
- pascapanen = pasca-panen
- pascasarjana = pasca-sarjana

> 1. Nama orang yang terdiri atas dua kata atau lebih pada akhir baris dipenggal di antara kata tersebut.

Misalnya:

- Pencetus nama bahasa Indonesia dalam Kongres Pemuda adalah Mohammad  
	Tabrani.
- Lagu "Indonesia Raya" dikumandangkan pada Kongres Pemuda II oleh Wage  
	Rudolf Supratman.
- Layar Terkembang yang terbit pada 1937 dikarang oleh Sutan Takdir  
	Alisjahbana.

> 1. Singkatan tidak dipenggal.

Misalnya:

- Ia telah mengabdi selama sepuluh tahun di *BKK* -  
	*BN*.
- Semua pengguna kendaraan bermotor wajib membawa *ST* -  
	*NK*.
- Pujangga terakhir Keraton Surakarta bergelar *R*.  
	*Ng*. Rangga Warsita.

Penulisan yang seharusnya dilakukan adalah sebagai berikut.

- Ia telah mengabdi selama sepuluh tahun di  
	*BKKBN*.
- Semua pengguna kendaraan bermotor wajib membawa  
	*STNK*.
- Pujangga terakhir Keraton Surakarta bergelar  
	*R.Ng*. Rangga Warsita.


### 2.2.4 Kata Depan (di, ke, dari)

Kata depan, seperti *di*, *ke*, dan *dari*, ditulis terpisah dari kata yang mengikutinya.

Misalnya:

- *Di* mana dia sekarang?
- Mereka ada *di* mana-mana.
- Kain itu disimpan *di* dalam lemari.
- Dia ikut terjun *ke* tengah kancah perjuangan.
- Mari, kita berangkat *ke* kantor.
- Saya pergi *ke* luar kota.
- Ia keluar *dari* rumah.
- Ia berasal *dari* Pulau Penyengat.
- Cincin itu terbuat *dari* emas.


### 2.2.5 Partikel (-lah, -kah, -tah, pun, per)

> 1. Partikel *\-lah*, *\-kah*, dan *\-tah* ditulis serangkai dengan kata yang mendahuluinya.

Misalnya:

- Baca *lah* buku itu baik-baik!
- Bertepuk tangan *lah* mengikuti irama!
- Apa *kah* yang tersirat dalam surat itu?
- Siapa *kah* gerangan dia?
- Apa *tah* gunanya bersedih hati?

> 1. Partikel *pun* ditulis terpisah dari kata yang mendahuluinya.

Misalnya:

- Apa *pun* permasalahan yang muncul, dia dapat mengatasinya dengan bijaksana.
- Jika kita hendak pulang tengah malam *pun*, kendaraan masih tersedia.
- Jangankan dua kali, satu kali *pun* engkau belum pernah berkunjung ke rumahku.

> 1. Bentuk *pun* yang merupakan bagian kata penghubung seperti berikut ditulis serangkai.

- ada *pun*
- andai *pun*
- atau *pun*
- bagaimana *pun*
- biar *pun*
- jika *pun*
- kalau *pun*
- kendati *pun*
- mau *pun*
- meski *pun*
- sekali *pun*
- sementang *pun*
- sungguh *pun*
- walau *pun*

Misalnya:

- Meski *pun* sibuk, dia dapat menyelesaikan tugas tepat pada waktunya.
- Dia tetap bersemangat walau *pun* lelah.
- Ada *pun* penyebab kemacetan itu belum diketahui.
- Bagaimana *pun* pekerjaan itu harus selesai minggu depan.
- Sekali *pun* teman dekat, dia belum pernah sekali pun datang ke rumahku.
- Sementang *pun* aku ini bukan sanak-saudaramu, tidak sampai hati juga aku melihat penderitaanmu itu.

> 1. Partikel *per* yang berarti 'demi', 'tiap', 'mulai', atau 'melalui' ditulis terpisah dari kata yang mengikutinya.

Misalnya:

- Mereka masuk ke dalam ruang rapat satu *per* satu.
- Harga kain itu Rp50.000,00 *per* meter.
- Karyawan itu mendapat kenaikan gaji *per* 1 Januari.
- Dia menghubungiku *per* telepon.


### 2.2.6 Singkatan dan Akronim

> 1. Singkatan nama orang, gelar, sapaan, atau pangkat diikuti dengan tanda titik di setiap unsur singkatan itu.

Misalnya:

- *A.H.* Nasution = *A* bdul *H* aris Nasution
- *H.* Hamid = *Haji* Hamid
- Suman *Hs.* = Suman *H* a *s* ibuan
- *dr.* = *d* okte *r*
- *Dr.* = *d* okto *r*
- Dr. (*H.C.*) = doktor *honoris causa*
- *M.B.A.* = *master of business administration*
- *M.Hum.* = *m* agister *hum* aniora
- *M.Si.* = *m* agister *s* a *i* ns
- *Ph.D.* = *philosophiae doctor (doctor of philosophy)*
- *Prof.* = *prof* esor
- *S.E.* = *s* arjana *e* konomi
- *S.I.P.* = *s* arjana *i* lmu *p* olitik
- *S.K.M.* = *s* arjana *k* esehatan *m* asyarakat
- *S.Kom.* = *s* arjana *kom* puter
- *S.Sos.* = s\*arjana \*sos\*ial
- *Sp.A.* = *sp* esialis *a* nak
- *R.M.* Syahid = *R* aden *M* as Syahid
- *Sdr.* Lukman = *S* au *d* a *r* a Lukman
- *Kol. Inf.* Hendri = *Kol* onel *Inf* anteri Hendri
- *A.K.B.P.* Purnomo = *A* jun *K* omisaris *B* esar *P* olisi Purnomo

> 1. Singkatan nama orang dalam bentuk inisial ditulis tanpa tanda titik.

Misalnya:

- *LS* = *L* ilis *S* uryaningsih
- *SDD* = *S* apardi *D* joko *D* amono
- *STA* = *S* utan *T* akdir *A* lisjahbana

> 1. Singkatan, termasuk akronim, yang terdiri atas huruf awal setiap kata ditulis dengan huruf kapital tanpa tanda titik.

Misalnya:

- KTP = *k* artu *t* anda *p* enduduk
- KUHP = *K* itab *U* ndang-Undang *H* ukum *P* idana
- NKRI = *N* egara *K* esatuan *R* epublik *I* ndonesia
- PBB = *P* erserikatan *B* angsa- *B* angsa
- PGRI = *P* ersatuan *G* uru *R* epublik *I* ndonesia
- PT = *p* erseroan *t* erbatas
- SD = *s* ekolah *d* asar
- UI = *U* niversitas *I* ndonesia
- WHO = *W* orld *H* ealth *O* rganization
- BIG = *B* adan *I* nformasi *G* eospasial
- BIN = *B* adan *I* ntelijen *N* egara
- LAN = *L* embaga *A* dministrasi *N* egara
- MAN = *m* adrasah *a* liah *n* egeri
- NIP = *n* omor *i* nduk *p* egawai
- PASI = *P* ersatuan *A* tletik *S* eluruh *I* ndonesia
- PAUD = *p* endidikan *a* nak *u* sia *d* ini
- SIM = *s* urat *i* zin *m* engemudi

> 4.a Singkatan yang terdiri atas lebih dari dua huruf yang lazim digunakan dalam dokumen atau surat-menyurat diikuti dengan tanda titik.

Misalnya:

- dkk. = *d* an *k* awan- *k* awan
- dll. = *d* an *l* ain- *l* ain
- dsb. = *d* an *s* e *b* againya
- dst. = *d* an *s* e *t* erusnya
- hlm. = *h* a *l* a *m* an
- sda. = *s* ama *d* engan di *a* tas
- ttd. = *t* er *t* an *d* a
- ybs. = *y* ang *b* er *s* angkutan
- yth. = *y* ang *t* er *h* ormat

> 4.b Singkatan yang terdiri atas dua huruf yang lazim digunakan dalam dokumen atau surat-menyurat diikuti tanda titik pada setiap huruf.

Misalnya:

- a.n. = *a* tas *n* ama
- d.a. = *d* engan *a* lamat
- s.d. = *s* ampai *d* engan
- u.b. = *u* ntuk *b* eliau
- u.p. = *u* ntuk *p* erhatian

> 4.c Singkatan yang lazim digunakan dalam penulisan alamat dapat ditulis dengan dua huruf atau lebih dan diakhiri tanda titik.

Misalnya:

- Gd. Tabrani = Gedung Tabrani
- Jl. Rawamangun = Jalan Rawamangun
- Gg. Kelinci = Gang Kelinci
- Kav. 5 = Kaveling 5
- Km. 57 = Kilometer 57
- Lt. 2 = Lantai 2
- No. 9 = Nomor 9

> 1. Singkatan satuan ukuran, takaran, dan timbangan; lambang kimia; dan mata uang tidak diikuti tanda titik.

Misalnya:

- kVA = *k* ilo *v* olt- *a* mpere
- km = *k* ilo *m* eter
- kg = *k* ilo *g* ram
- l = *l* iter
- Cu = *ku* prum
- Rp = *r* u *p* iah

> 1. Akronim nama diri yang berupa gabungan huruf dan suku kata atau gabungan suku kata dari deret kata ditulis dengan huruf awal kapital.

Misalnya:

- Bappenas = *B* adan *P* erencanaan *P* embangunan *N* asional
- Bulog = *B* adan *U* rusan *L* ogistik
- Kalteng = *Kal* imantan *Teng* ah
- Kowani = *K* ongres *W* anita *I* ndonesia
- Mabbim = *M* ajelis *B* ahasa *B* runei *D* arussalam- *I* ndonesia- *M* alaysia
- Suramadu = *Sura* baya- *Madu* ra
- Wita = *W* aktu *I* ndonesia *T* eng *a* h

> 1. Akronim bukan nama diri yang berupa gabungan huruf dan suku kata atau gabungan suku kata dari deret kata ditulis dengan huruf nonkapital.

Misalnya:

- iptek = *i* lmu *p* engetahuan dan *tek* nologi
- pemilu = *pemil* ihan *u* mum
- puskesmas = *pus* at *kes* ehatan *mas* yarakat
- rapim = *ra* pat *pim* pinan
- rudal = pelu *ru* ken *dal* i
- tilang = buk *ti* pe *lang* garan


### 2.2.7 Angka dan Bilangan

> 1. Angka Arab atau angka Romawi lazim digunakan sebagai lambang bilangan atau nomor.

- Angka Arab: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
- Angka Romawi: I, II, III, IV, V, VI, VII, VIII, IX, X, L (50), C (100), D (500), M (1.000), V̄ (5.000), M̄ (1.000.000)

> 1. Bilangan dalam teks yang dapat dinyatakan dengan satu kata ditulis dengan huruf, kecuali jika digunakan secara berurutan seperti dalam perincian.

Misalnya:

- Mereka menonton drama itu sampai *tiga* kali.
- Koleksi pribadi saya lebih dari *seribu* buku.
- Di antara *72* anggota yang hadir, *52* orang setuju, *15* orang tidak setuju, dan *5* orang abstain.
- Kendaraan yang dipesan untuk angkutan umum terdiri atas *50* bus, *100* minibus, dan *250* sedan.

> 1. Angka digunakan untuk menyatakan (a) ukuran, seperti ukuran panjang, berat, luas, isi, dan waktu, serta (b) nilai, seperti nilai uang dan persentase.

Misalnya:

- 0,5 sentimeter
- 5 kilogram
- 4 hektare
- 10 liter
- 2 tahun 6 bulan 5 hari
- 1 jam 20 menit
- Rp5.000,00
- US$3,50
- £5,10
- ¥100
- 5%
- 7 persen

> 1. Bilangan berupa angka pada awal kalimat yang terdiri atas lebih dari satu kata didahului kata seperti *sebanyak*, *sejumlah*, dan *sebesar* diubah susunan kalimatnya.

Misalnya:

- *Sebanyak 2.500* orang peserta diundang panitia.
- *Sejumlah 25* naskah kuno tersimpan di lemari itu.
- Panitia mengundang *2.500* orang peserta.
- Di lemari itu tersimpan *25* naskah kuno.

> 1. Angka yang menunjukkan bilangan besar dapat ditulis sebagian dengan huruf supaya lebih mudah dibaca.

Misalnya:

- Sebanyak *500 ribu* dosis vaksin telah didistribusikan ke beberapa wilayah.
- Dia mendapatkan bantuan *90 juta* rupiah untuk mengembangkan usahanya.
- Perusahaan itu baru saja mendapatkan pinjaman *55 miliar* rupiah.
- Proyek nasional pemberdayaan ekonomi rakyat itu memerlukan biaya *7 triliun* rupiah.

> 1. Angka digunakan sebagai bagian dari alamat, seperti jalan, rumah, apartemen, atau kamar.

Misalnya:

- Jalan Kartika I No. 15
- Jalan Kartika I/15
- Jalan Raya Dumai Kav. 14
- Jalan Raya Subrantas Km. 4
- Hotel Mahameru, Kamar 169
- Gedung Samudra, Lantai II, Ruang 201

> 1. Angka digunakan untuk menomori bagian karangan atau bagian kitab suci.

Misalnya:

- Bab II, Pasal 3, halaman 13
- "Bacalah dengan (menyebut) nama Tuhanmu yang menciptakan!" (Surah Al-'Alaq \[96\]: 1)
- "Dan apa saja yang kamu minta dalam doa dengan penuh kepercayaan, kamu akan menerimanya." (Matius 21: 22)

> 1. Penulisan bilangan dengan huruf seperti dalam peraturan perundang-undangan, akta, dan kuitansi dilakukan sebagai berikut.

a. Bilangan utuh ditulis secara mandiri.

Misalnya:

- dua belas (12)
- tiga puluh lima (35)
- lima puluh lima ribu (55.000)

b. Bilangan pecahan ditulis dengan per- yang dilekatkan pada bilangan penyebut yang mengikutinya.

Misalnya:

- setengah atau se *per* dua (½)
- se *per* enam belas (⅟16)
- tiga *per* empat (¾)
- dua *per* sepuluh (²∕₁₀)
- tiga dua- *per* tiga (3⅔)
- satu *per* sen (1%)
- satu *per* mil (1‰)

> 1. Penulisan bilangan tingkat dapat menggunakan angka Romawi, gabungan awalan ke- dan angka Arab, atau huruf.

Misalnya:

- abad VII
- abad ke-7
- abad ketujuh
- Perang Dunia II
- Perang Dunia Ke-2
- Perang Dunia Kedua

> 1. Penulisan angka dan akhiran -an dirangkaikan dengan tanda hubung (-).

Misalnya:

- lima lembar uang *5.000-an* (lima lembar uang *lima ribuan*)
- seharga *5.000-an* (seharga *lima ribuan*)
- tahun *2000-an* (tahun *dua ribuan*)

> 1. Bilangan seperti yang terdapat dalam peraturan perundang-undangan, akta, atau kuitansi dapat ditulis dengan angka dan diikuti oleh huruf.

Misalnya:

- Setiap orang yang menyebarkan atau mengedarkan rupiah tiruan sebagaimana dimaksud dalam Pasal 23 ayat (2) dipidana dengan pidana kurungan paling lama *1* (*satu*) tahun dan pidana denda paling banyak *Rp200.000.000,00* (*dua ratus juta rupiah*).
- Pada hari ini, Rabu, tanggal 13-10-2021 (*tiga belas Oktober dua ribu dua puluh satu*) telah hadir di hadapan saya, Noviansyah, notaris yang berkedudukan di Kota Batam.
- Saya lampirkan tanda terima uang sebesar *Rp900.500,50* (*sembilan ratus ribu lima ratus rupiah lima puluh sen*).

> 1. Bilangan yang digunakan sebagai unsur nama geografi ditulis dengan huruf secara serangkai.

Misalnya:

- Kelapa *dua*
- *Limapuluh* koto
- Raja *ampat*
- Simpang *lima*
- *Tiga* raksa


### 2.2.8 Kata Ganti (ku-, kau-, -ku, -mu, -nya)

> 1. Kata ganti *ku-* dan *kau-* ditulis serangkai dengan kata yang mengikutinya, sedangkan *\-ku*, *\-mu*, dan *\-nya* ditulis serangkai dengan kata yang mendahuluinya.

Misalnya:

- Rumah itu telah *ku* jual.
- Majalah ini boleh *kau* baca.
- Buku *ku*, buku *mu*, dan buku *nya* tersimpan di perpustakaan.
- Rumah *nya* sedang diperbaiki.

> 1. Kata ganti *kau* yang bukan bentuk terikat ditulis terpisah dengan kata yang lain.

Misalnya:

- Aku ingin *kau* bersungguh-sungguh dengan apa yang kaukatakan.
- *Kau* masih muda, Bung.
- Sebaiknya, *kau* mengurus adikmu saja.


### 2.2.9 Kata Sandang (si, sang)

> 1. Kata *si* dan *sang* ditulis terpisah dari kata yang mengikutinya.

Misalnya:

- Surat itu dikembalikan kepada *si* pengirim.
- Dalam cerita itu *si* Pitung berhasil menolong penduduk.
- Toko itu memberikan hadiah kepada *si* pembeli.
- Ibu itu menghadiahi *sang* suami kemeja batik.
- Sang adik mematuhi nasihat *sang* kakak.
- Harimau itu marah sekali kepada *sang* Kancil.

> 1. Kata *sang* ditulis dengan huruf awal kapital jika merupakan unsur nama Tuhan.

Misalnya:

- Kita harus berserah diri kepada *Sang* Pencipta.
- Pura dibangun oleh umat Hindu untuk memuja *Sang* Hyang Widhi Wasa.


### 2.3.1 Tanda Titik (.)

> 1. Tanda titik digunakan pada akhir kalimat pernyataan.

Misalnya:

- Mereka duduk di sana.
- Dia akan datang pada pertemuan itu.

> 1. Tanda titik digunakan untuk mengakhiri pernyataan lengkap yang diikuti perincian berupa kalimat baru, paragraf baru, atau subjudul baru.

Misalnya:

Kondisi kebahasaan di Indonesia yang diwarnai oleh bahasa standar dan nonstandar, ratusan bahasa daerah, dan ditambah beberapa bahasa asing membutuhkan penanganan yang tepat dalam perencanaan bahasa. Agar lebih jelas, latar belakang dan masalah akan diuraikan secara terpisah seperti tampak pada paparan berikut.

**1\. Latar Belakang**  
Masyarakat Indonesia yang heterogen menyebabkan munculnya sikap yang beragam terhadap penggunaan bahasa yang ada di Indonesia, yaitu (1) sangat bangga terhadap bahasa asing, (2) sangat bangga terhadap bahasa daerah, dan (3) sangat bangga terhadap bahasa Indonesia.

**2\. Masalah**  
Penelitian ini hanya membatasi masalah pada sikap bahasa masyarakat Kalimantan terhadap bahasa-bahasa yang ada di Indonesia. Sikap masyarakat tersebut akan digunakan sebagai formulasi kebijakan perencanaan bahasa yang diambil.

**3\. Tujuan**  
Penelitian ini bertujuan untuk mengetahui dan mengukur sikap bahasa masyarakat Kalimantan, khususnya yang tinggal di kota besar, terhadap bahasa-bahasa yang ada di Indonesia.

> 1. Tanda titik digunakan di belakang angka atau huruf dalam suatu daftar, perincian, tabel, atau bagan.

a. Contoh Penggunaan Tanda Titik dalam Daftar

```
I. Kondisi Kebahasaan di Indonesia
  A. Bahasa Indonesia
    1. Kedudukan
    2. Fungsi
  B. Bahasa Daerah
    1. Kedudukan
    2. Fungsi
  C. Bahasa Asing
    1. Kedudukan
    2. Fungsi
```

b. Contoh Penggunaan Tanda Titik dalam Perincian

```
I. Patokan Umum
II. Patokan Khusus
```

c. Contoh Penggunaan Tanda Titik dalam Tabel

Tabel 1 Kelas Kata

| Nomor | Kata Kerja | Kata Benda |
| --- | --- | --- |
| 1. | makan | rumah |
| 2. | mandi | meja |
| dst. |  |  |

d. Contoh Penggunaan Tanda Titik dalam Bagan

![Contoh Bagan](https://eyd.netlify.app/contoh-bagan.png)

> 1. Tanda titik *tidak* digunakan di belakang angka terakhir pada deret nomor dalam perincian.

Misalnya:

**BAB II**  
**KERANGKA TEORI**

**2.1 Bahasa**  
**2.1.1 Fonologi**  
**2.1.2 Morfologi**  
**2.1.3 Sintaksis**  
**2.2 Sastra**  
**2.2.1 Puisi**  
**2.2.2 Prosa**  
**2.2.3 Drama**

**BAB II**  
**KERANGKA TEORI**

**II.A Bahasa**  
**II.A.1 Fonologi**  
**II.A.2 Morfologi**  
**II.A.3 Sintaksis**  
**II.B Sastra**  
**II.B.1 Puisi**  
**II.B.2 Prosa**  
**II.B.3 Drama**

> 1. Tanda titik *tidak* digunakan pada angka atau huruf yang sudah bertanda kurung dalam perincian.

Misalnya:

Bahasa Indonesia berkedudukan sebagai

1. bahasa nasional yang berfungsi sebagai, antara lain,  
	a) lambang kebanggaan nasional,  
	b) identitas nasional,  
	c) alat pemersatu bangsa, dan  
	d) sarana perhubungan antarwarga, antardaerah, dan antarbudaya;
2. bahasa negara....

> 1. Tanda titik *tidak* digunakan di belakang angka terakhir, baik satu digit maupun lebih, dalam judul tabel, bagan, grafik, atau gambar.

Misalnya:

- Tabel 1 Kondisi Kebahasaan di Indonesia
- Tabel 1.1 Kondisi Bahasa Daerah di Indonesia
- Bagan 2 Struktur Organisasi
- Bagan 2.1 Bagian Umum
- Grafik 4 Sikap Masyarakat Perkotaan terhadap Bahasa Indonesia
- Grafik 4.1 Sikap Masyarakat Berdasarkan Usia
- Gambar 1 Gedung Cakrawala
- Gambar 1.1 Ruang Rapat

> 1. Tanda titik digunakan untuk memisahkan angka jam, menit, dan detik yang menunjukkan waktu atau jangka waktu.

Misalnya:

- pukul 01.35.20 (pukul 1 lewat 35 menit 20 detik atau pukul 1, 35 menit, 20 detik)
- 01.35.20 jam (1 jam, 35 menit, 20 detik)
- 00.20.30 jam (20 menit, 30 detik)
- 00.00.30 jam (30 detik)

> 1. Tanda titik digunakan untuk memisahkan bilangan ribuan atau kelipatannya yang menunjukkan jumlah.

Misalnya:

- Indonesia memiliki lebih dari *13.000* pulau.
- Penduduk kota itu lebih dari *7.000.000* orang.
- Anggaran lembaga itu mencapai *Rp225.000.000.000,00*.

> 1. Tanda titik *tidak* digunakan untuk memisahkan bilangan ribuan atau kelipatannya yang tidak menunjukkan jumlah.

Misalnya:

- Dia lahir pada tahun 1998 di Bandung.
- Kata *sila* terdapat dalam *Kamus Besar Bahasa Indonesia* (Edisi V), halaman 1553.
- Nomor rekening panitia seminar adalah 0015645678.
- Dia diangkat sebagai PNS dengan NIP 199701112015041002.

> 1. Tanda titik tidak digunakan pada akhir judul dan subjudul.

Misalnya:

- Bentuk dan Kedaulatan (Bab I, UUD 1945)
- Gambar 3 Alat Ucap Manusia
- Tabel 5 Sikap Bahasa Generasi Muda Berdasarkan Pendidikan

> 1. Tanda titik *tidak* digunakan di belakang alamat penerima surat serta tanggal surat.

Misalnya:

- Yth. Rahmat Hidayat, S.T. Jalan Sumbawa I/18 Sumurbandung Bandung
- Yth. Kepala Badan Pengembangan dan Pembinaan Bahasa Jalan Daksinapati Barat IV Rawamangun Jakarta Timur
- 12 Oktober 2021
- Jakarta, 12 Oktober 2021 (tanpa alamat lengkap pada kop surat)


### 2.3.2 Tanda Koma (,)

> 1. Tanda koma digunakan di antara unsur-unsur dalam perincian berupa kata, frasa, atau bilangan.

Misalnya:

- Telepon seluler, komputer, atau internet bukan barang mewah lagi.
- Buku, majalah, dan jurnal termasuk sumber kepustakaan.
- Dia harus melengkapi berkas lamarannya dengan melampirkan (1) akta kelahiran, (2) ijazah terakhir, dan (3) surat keterangan kesehatan.
- Satu, dua,... tiga!

> 1. Tanda koma digunakan sebelum kata penghubung, seperti *tetapi*, *melainkan*, dan *sedangkan*, dalam kalimat majemuk pertentangan.

Misalnya:

- Saya ingin membeli kamera, *tetapi* uang saya belum cukup.
- Ini bukan milik saya, *melainkan* milik ayah saya.
- Dia membaca cerita pendek, *sedangkan* adiknya melukis panorama.

> 1. Tanda koma digunakan untuk memisahkan anak kalimat yang mendahului induk kalimat.

Misalnya:

- Kalau diundang, saya akan datang.
- Karena baik hati, dia mempunyai banyak teman.
- Agar memiliki wawasan yang luas, kita harus banyak membaca buku.

> 1. Tanda koma *tidak* digunakan jika induk kalimat mendahului anak kalimat.

Misalnya:

- Saya akan datang kalau diundang.
- Dia mempunyai banyak teman karena baik hati.
- Kita harus banyak membaca buku agar memiliki wawasan yang luas.

> 1. Tanda koma digunakan di belakang kata atau ungkapan penghubung antarkalimat, *seperti oleh karena itu*, *jadi*, *dengan demikian*, *sehubungan dengan itu*, dan *meskipun demikian*.

Misalnya:

- Mahasiswa itu rajin dan pandai. *Oleh karena itu*, dia memperoleh beasiswa belajar di luar negeri.
- Anak itu memang rajin membaca sejak kecil. *Jadi*, dia berhasil menjadi penulis terkenal.
- Orang tuanya kurang mampu. *Meskipun demikian*, anak-anaknya berhasil menjadi sarjana.

> 1. Tanda koma digunakan sebelum dan/atau sesudah kata seru, seperti *o*, *ya*, *wah*, *aduh*, atau *hai*, dan kata yang digunakan sebagai sapaan, seperti *Bu*, *Dik*, atau *Nak*.

Misalnya:

- *O*, begitu?
- *Wah*, bukan main!
- Hati-hati, *ya*, jalannya licin!
- *Nak*, kapan kuliahmu selesai?
- Siapa namamu, *Dik*?
- Dia baik sekali, *Bu*.

> 1. Tanda koma digunakan untuk memisahkan petikan langsung dari bagian lain dalam kalimat.

Misalnya:

- Kata nenek saya, "Kita harus berbagi dalam hidup ini."
- "Kita harus berbagi dalam hidup ini," kata nenek saya, "karena manusia adalah makhluk sosial."

> 1. Tanda koma tidak digunakan untuk memisahkan petikan langsung yang diakhiri tanda tanya atau tanda seru dari bagian kalimat yang mengikutinya.

Misalnya:

- "Di mana Saudara tinggal?" tanya Pak Lurah.
- "Masuk ke dalam kelas sekarang!" perintahnya.
- "Wow, indahnya pantai ini!" seru wisatawan itu.

> 1. Tanda koma digunakan di antara (a) nama dan alamat, (b) bagian-bagian alamat, (c) tempat dan tanggal, serta (d) nama tempat dan wilayah yang ditulis berurutan.

Misalnya:

- Sdr. Rahmat Hidayat, Jalan Sumbawa I/18, Kelurahan Merdeka, Kecamatan Sumurbandung, Bandung 40113
- Direktur Rumah Sakit Cipto Mangunkusumo, Jl. Pangeran Diponegoro No. 71, Jakarta 10430
- Surabaya, 10 Mei 1960
- Sofifi, Maluku Utara

> 1. Tanda koma digunakan sesudah salam pembuka (seperti *dengan hormat* atau *salam sejahtera*), salam penutup (seperti salam *takzim* atau *hormat kami*), dan nama jabatan penanda tangan surat.

Misalnya:

- Dengan hormat,
- Salam sejahtera,
- Salam takzim,
- Hormat kami,
- Kepala Badan,
- Rektor,
- a.n. Kepala Badan Sekretaris Badan,
	(tanda tangan)
	Hurip Danu Ismadi
	NIP 196110051988031002

> 1. Tanda koma digunakan di antara nama orang dan singkatan gelar akademis yang mengikutinya untuk membedakannya dari singkatan nama diri, nama keluarga, atau nama marga.

Misalnya:

- B. Ratulangi, S.E.
- Ny. Khadijah, M.A.
- Bambang Irawan, M.Hum.
- Siti Aminah, S.H., M.H.
- Dr. dr. Rahayu Ningtyas, Sp.A., Subsp.End.(K).
- Prof. Dr. Muh. Muhlis, S.E., M.A., Ph.D.

Catatan:

> a. Bandingkan *Siti Khadijah, M.A.* (*Siti Khadijah, Master of Arts*) dengan *Siti Khadijah M.A.* (*Siti Khadijah Mas Agung*).  
> b. Spasi digunakan untuk memisahkan unsur nama dan singkatannya serta antargelar dan singkatannya.

> 1. Tanda koma digunakan sebelum angka desimal atau di antara rupiah dan sen yang dinyatakan dengan angka.

Misalnya:

- 12,5 m
- 27,3 kg
- Rp500,50
- Rp750,00

> 1. Tanda koma digunakan untuk mengapit keterangan tambahan atau keterangan aposisi.

Misalnya:

- Di daerah kami, *misalnya*, masih banyak bahan tambang yang belum diolah.
- Semua siswa, *baik laki-laki maupun perempuan*, harus mengikuti latihan paduan suara.
- Soekarno, *Presiden I RI*, merupakan salah seorang pendiri Gerakan Nonblok.
- Pejabat yang bertanggung jawab, *sebagaimana dimaksud pada ayat (3)*, wajib menindaklanjuti laporan dalam waktu paling lama 7 (tujuh) hari.

Bandingkan dengan keterangan pewatas yang pemakaiannya tidak diapit tanda koma!

- Siswa *yang lulus dengan nilai tinggi* akan diterima di perguruan tinggi itu tanpa melalui tes.

> 1. Tanda koma dapat digunakan di belakang keterangan yang terdapat pada awal kalimat untuk menghindari salah pengertian.

Misalnya:

- Dalam pengembangan bahasa Indonesia, kita dapat memanfaatkan bahasa daerah.
- Atas perhatian Saudara, kami ucapkan terima kasih.

Bandingkan dengan kalimat berikut.

- Dalam pengembangan bahasa kita dapat memanfaatkan bahasa daerah.
- Atas perhatian Saudara kami ucapkan terima kasih.


### 2.3.3 Tanda Titik Koma (;)

> 1. Tanda titik koma dapat digunakan sebagai pengganti kata penghubung untuk memisahkan kalimat setara di dalam kalimat majemuk.

Misalnya:

- Hari sudah malam; anak-anak masih membaca buku.
- Kerbau melenguh; kambing mengembik; kuda meringkik.
- Ayah menyelesaikan pekerjaan; ibu menulis makalah; adik membaca cerita pendek.

> 1. Tanda titik koma digunakan pada bagian perincian yang berupa frasa verbal.

Misalnya:

Syarat penerimaan pegawai di lembaga ini adalah  
(1) berkewarganegaraan Indonesia;  
(2) berijazah sarjana S-1;  
(3) berbadan sehat; dan  
(4) bersedia ditempatkan di seluruh wilayah Negara Kesatuan Republik Indonesia.

> 1. Tanda titik koma digunakan untuk memisahkan bagian-bagian perincian dalam kalimat yang sudah menggunakan tanda koma.

Misalnya:

- Ibu membeli buku, pensil, dan tinta; baju, celana, dan kaus; pisang, apel, dan jeruk.
- Agenda rapat ini meliputi  
	a. pemilihan ketua, sekretaris, dan bendahara;  
	b. penyusunan anggaran dasar, anggaran rumah tangga, dan program kerja; serta  
	c. pendataan anggota, dokumentasi, dan aset organisasi.

> 1. Tanda titik koma digunakan untuk memisahkan sumber-sumber kutipan.

Misalnya:

- Kasus perencanaan bahasa di Indonesia dianggap sebagai salah satu yang paling berhasil (Fishman, 1974; Moeliono, 1985; Samuel, 2008; Wardhaugh dan Fuller, 2015).
- Tentang plagiarisme, para penulis (Keraf, 1997; Putra, 2011; Wibowo, 2013) sama-sama mengingatkan pentingnya pengutipan dan perujukan secara cermat untuk menghindari cap plagiat.


### 2.3.4 Tanda Titik Dua (:)

> 1. Tanda titik dua digunakan pada akhir suatu pernyataan lengkap yang langsung diikuti perincian atau penjelasan.

Misalnya:

- Mereka memerlukan perabot rumah tangga: kursi, meja, dan lemari.
- Saya akan membeli alat tulis kantor: kertas, tinta, spidol, dan pensil.

> 1. Tanda titik dua *tidak* digunakan jika perincian atau penjelasan itu merupakan bagian dari kalimat lengkap.

Misalnya:

- Kita memerlukan kursi, meja, dan lemari.
- Tahap penelitian yang harus dilakukan meliputi  
	a. persiapan,  
	b. pengumpulan data,  
	c. pengolahan data, dan  
	d. pelaporan.

> 1. Tanda titik dua digunakan sesudah kata atau frasa yang memerlukan pemerian.

Misalnya:

- Ketua: Ahmad Wijaya  
	Wakil Ketua: Deni Simanjuntak  
	Sekretaris: Siti Aryani  
	Bendahara: Aulia Arimbi
- Narasumber: Prof. Dr. Saputra Effendi  
	Pemandu: Abdul Gani, M.Hum.  
	Pencatat: Sri Astuti Amelia, S.Pd.

> 1. Tanda titik dua digunakan dalam naskah drama sesudah kata yang menunjukkan pelaku dalam percakapan.

Misalnya:

- Ibu: "Bawa koper ini, Nak!"  
	Amir: "Baik, Bu."  
	Ibu: "Jangan lupa, letakkan baik-baik!"

> 1. Tanda titik dua digunakan di antara (a) jilid atau nomor dan halaman, (b) surah dan ayat dalam kitab suci, serta (c) judul dan anak judul suatu karangan.

Misalnya:

- Ultimart 5 (2): 98–105
- Surah Ibrahim: 2–5
- Matius 2: 1–3
- Dari Pemburu ke Terapeutik: Antologi Cerpen Mastera

> 1. Tanda titik dua dapat digunakan untuk memisahkan angka jam, menit, dan detik yang menunjukkan waktu atau jangka waktu.

Misalnya:

- pukul 01:35:20 (pukul 1 lewat 35 menit 20 detik atau pukul 1, 35 menit, 20 detik)
- 001:35:20 jam (1 jam, 35 menit, 20 detik)
- 00:20:30 jam (20 menit, 30 detik)
- 00:00:30 jam (30 detik)

Catatan:

> Lihat penggunaan tanda titik (kaidah A butir 7)!

> 1. Tanda titik dua digunakan untuk menuliskan rasio dan hal lain yang menyatakan perbandingan dalam bentuk angka.

Misalnya:

- Skala peta ini 1:10.000.
- Jumlah peserta didik laki-laki dan perempuan di kelas itu adalah 2:3.


### 2.3.5 Tanda Hubung (-)

> 1. Tanda hubung digunakan untuk menandai bagian kata yang terpenggal oleh pergantian baris.

Misalnya:

- Di samping cara lama, diterapkan juga ca-  
	ra baru ….
- Nelayan pesisir itu berhasil membudidayakan rum-  
	put laut.
- Kini ada cara yang baru untuk meng-  
	ukur panas.
- Parut jenis ini memudahkan kita me-  
	ngukur kelapa.

> 1. Tanda hubung digunakan untuk menyambung unsur bentuk ulang.

Misalnya:

- anai-anai
- anak-anak
- berulang-ulang
- kemerah-merahan
- mengorek-ngorek

> 1. Tanda hubung digunakan untuk (a) menyambung tanggal, bulan, dan tahun yang dinyatakan dengan angka, (b) menyambung huruf dalam kata yang dieja satu demi satu, dan (c) menyatakan skor pertandingan.

Misalnya:

- 11-11-2022
- p-a-n-i-t-i-a
- 2-1

> 1. Tanda hubung digunakan untuk memperjelas hubungan bagian kata atau ungkapan.

Misalnya:

- ber-evolusi
- meng-urus (merawat; memelihara; mengatur)
- dua-puluh-lima ribuan (25 x 1.000)
- ²³∕₂₅ (dua-puluh-tiga perdua-puluh-lima)
- mesin hitung-tangan (mesin untuk menghitung tangan)

Bandingkan dengan contoh di bawah ini!

- be-revolusi
- me-ngurus (menjadi kurus)
- dua-puluh lima-ribuan (20 x 5.000)
- 20 ³∕₂₅ (dua-puluh tiga perdua-puluh-lima)
- mesin-hitung tangan (mesin hitung manual yang dioperasikan dengan tangan)

> 1. Tanda hubung digunakan untuk merangkaikan unsur yang berbeda, yaitu di antara huruf kapital dan nonkapital serta di antara huruf dan angka.

Misalnya:

- *se* -Indonesia
- peringkat *ke* -2
- tahun 2000- *an*
- hari- *H*
- ber- *KTP*
- di- *SK* -kan
- ciptaan- *Nya*
- D-3
- S-1
- KTP- *mu*

> 1. Tanda hubung tidak digunakan di antara huruf dan angka jika angka tersebut melambangkan jumlah huruf.

Misalnya:

- BP2MI (*B* adan *P* elindungan *P* ekerja *M* igran *I* ndonesia)
- P4TK (*P* usat *P* engembangan dan *P* emberdayaan *P* endidik dan *T* enaga *K* ependidikan)
- P3K (*p* ertolongan *p* ertama *p* ada *k* ecelakaan)

> 1. Tanda hubung digunakan untuk merangkai unsur bahasa Indonesia dengan unsur bahasa daerah, bahasa asing, atau slang.

Misalnya:

- di- *slepet* 'dijepret' (bahasa Betawi)
- ber- *pariban* 'bersaudara sepupu' (bahasa Batak)
- mem- *back up* 'menyokong; membantu' (bahasa Inggris)
- di- *tafṣīl* 'dijelaskan' (bahasa Arab)
- di- *bokisin* 'dibohongi' (slang)

> 1. Tanda hubung digunakan untuk menandai imbuhan atau bentuk terikat yang menjadi objek bahasan.

Misalnya:

- Imbuhan *pe-* pada *pekerja* bermakna 'orang yang' atau 'pelaku'.
- Bentuk terikat *pasca-* berasal dari bahasa Sanskerta.
- Bentuk terikat *\-anda* (*\-nda* atau *\-da*) terdapat pada kata seperti *ayahanda*, *ibunda*, *pamanda*.

> 1. Tanda hubung digunakan untuk menandai dua unsur yang merupakan satu kesatuan.

Misalnya:

- suami-istri
- Soekarno-Hatta
- Konferensi Asia-Afrika


### 2.3.6 Tanda Pisah (—)

> 1. Tanda pisah dapat digunakan untuk mengapit keterangan atau penjelasan yang bukan bagian utama kalimat.

Misalnya:

- Kemerdekaan bangsa itu—saya yakin akan tercapai—diperjuangkan oleh bangsa itu sendiri.
- Keberhasilan itu—kita sependapat—dapat dicapai jika kita mau berusaha keras.

> 1. Tanda pisah dapat digunakan untuk mengapit keterangan atau penjelasan yang merupakan bagian utama kalimat dan dapat saling menggantikan dengan bagian yang dijelaskan.

Misalnya:

- Soekarno-Hatta—Proklamator Kemerdekaan RI—diabadikan menjadi nama jalan di beberapa kota di Indonesia.
- Rangkaian temuan ini—evolusi, teori kenisbian, dan pembelahan atom—telah mengubah konsepsi kita tentang alam semesta.
- Gerakan Pengutamaan Bahasa Indonesia—amanat Sumpah Pemuda—harus terus digelorakan.

> 1. Tanda pisah digunakan di antara dua bilangan, tanggal (hari, bulan, tahun), atau tempat yang berarti 'sampai dengan' atau 'sampai ke'.

Misalnya:

- Tahun 2019—2022
- Tanggal 5—10 April 2022
- Senin—Jumat
- Jakarta—Bandung


### 2.3.7 Tanda Tanya (?)

> 1. Tanda tanya digunakan pada akhir kalimat tanya.

Misalnya:

- Kapan Hari Pendidikan Nasional diperingati?
- Siapa pencipta lagu "Indonesia Raya"?

> 1. Tanda tanya digunakan di dalam tanda kurung untuk menyatakan bagian kalimat yang diragukan atau yang kurang dapat dibuktikan kebenarannya.

Misalnya:

- Monumen Nasional mulai dibangun pada tahun 1961 (?).
- Di Indonesia terdapat 740 (?) bahasa daerah.


### 2.3.8 Tanda Seru (!)

[Skip to content](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-seru#skip)

[EYD](https://eyd.netlify.app/)[Beranda](https://eyd.netlify.app/)

- [Huruf Abjad](https://eyd.netlify.app/penggunaan-huruf/huruf-abjad)
- [Huruf Vokal](https://eyd.netlify.app/penggunaan-huruf/huruf-vokal)
- [Huruf Konsonan](https://eyd.netlify.app/penggunaan-huruf/huruf-konsonan)
- [Gabungan Huruf Vokal](https://eyd.netlify.app/penggunaan-huruf/gabungan-huruf-vokal)
- [Gabungan Huruf Konsonan](https://eyd.netlify.app/penggunaan-huruf/gabungan-huruf-konsonan)
- [Huruf Kapital](https://eyd.netlify.app/penggunaan-huruf/huruf-kapital)
- [Huruf Miring](https://eyd.netlify.app/penggunaan-huruf/huruf-miring)
- [Huruf Tebal](https://eyd.netlify.app/penggunaan-huruf/huruf-tebal)

- [Kata Dasar](https://eyd.netlify.app/penulisan-kata/kata-dasar)
- [Kata Turunan](https://eyd.netlify.app/penulisan-kata/kata-turunan)
- [Pemenggalan Kata](https://eyd.netlify.app/penulisan-kata/pemenggalan-kata)
- [Kata Depan](https://eyd.netlify.app/penulisan-kata/kata-depan)
- [Partikel](https://eyd.netlify.app/penulisan-kata/partikel)
- [Singkatan](https://eyd.netlify.app/penulisan-kata/singkatan)
- [Angka dan Bilangan](https://eyd.netlify.app/penulisan-kata/angka-dan-bilangan)
- [Kata Ganti](https://eyd.netlify.app/penulisan-kata/kata-ganti)
- [Kata Sandang](https://eyd.netlify.app/penulisan-kata/kata-sandang)

- [Tanda Titik (.)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-titik)
- [Tanda Koma (,)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-koma)
- [Tanda Titik Koma (;)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-titik-koma)
- [Tanda Titik Dua (:)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-titik-dua)
- [Tanda Hubung (-)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-hubung)
- [Tanda Pisah (—)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-pisah)
- [Tanda Tanya (?)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-tanya)
- [Tanda Seru (!)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-seru)
- [Tanda Elipsis (...)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-elipsis)
- [Tanda Petik ("...")](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-petik)
- [Tanda Petik Tunggal ('...')](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-petik-tunggal)
- [Tanda Kurung ((...))](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-kurung)
- [Tanda Kurung Siku (\[...\])](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-kurung-siku)
- [Tanda Garis Miring (/)](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-garis-miring)
- [Tanda Apostrof (')](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-apostrof)

- [Serapan Umum](https://eyd.netlify.app/penulisan-unsur-serapan/serapan-umum)
- [Serapan Khusus](https://eyd.netlify.app/penulisan-unsur-serapan/serapan-khusus)

# Tanda Seru

Tanda seru digunakan untuk mengakhiri ungkapan yang menggambarkan kekaguman, kesungguhan, emosi yang kuat, seruan, atau perintah.

Misalnya:

- Alangkah indahnya Taman Laut Bunaken!
- Saya tidak melakukannya!
- Merdeka!
- Hai!
- Bayarlah pajak tepat waktu!

- [← Tanda Tanya](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-tanya)
- [Tanda Elipsis →](https://eyd.netlify.app/penggunaan-tanda-baca/tanda-elipsis)

### Komunitas

- [Lisensi](https://eyd.netlify.app/lisensi)
- [Kode sumber](https://github.com/gipsterya/eyd)
- [Sponsor](https://github.com/sponsors/gipsterya)

© 2023 [Gigip Andreas](https://gipsterya.com/)


### 2.3.9 Tanda Elipsis (...)

> 1. Tanda elipsis digunakan untuk menunjukkan bahwa dalam suatu kalimat atau kutipan ada bagian yang dihilangkan atau tidak disebutkan.

Misalnya:

- Penyebab kemerosotan... akan diteliti lebih lanjut.
- Dalam Undang-Undang Dasar Negara Republik Indonesia Tahun 1945 disebutkan bahwa bahasa negara ialah...
- ..., lain lubuk lain ikannya.

> 1. Tanda elipsis digunakan untuk menulis ujaran yang tidak selesai dalam dialog.

Misalnya:

- "Menurut saya,..., seperti... Bagaimana, Bu?"
- "Jadi, simpulannya... Oh, sudah saatnya beristirahat!"

> 1. Tanda elipsis digunakan untuk menandai jeda panjang dalam tuturan yang dituliskan.

Misalnya:

- Maju... jalan!
- Kamera... siap!
- Satu, dua,... tiga!

> 1. Tanda elipsis di akhir kalimat diikuti dengan tanda baca akhir kalimat berupa tanda titik, tanda tanya, atau tanda seru.

Misalnya:

- Dalam Undang-Undang Dasar Negara Republik Indonesia Tahun 1945 disebutkan bahwa bahasa negara ialah....
- "Jadi, mengapa selama ini dia bekerja sebagai...?"
- "Pergi dari sini jika kamu...!"


### 2.3.10 Tanda Petik ("...")

> 1. Tanda petik digunakan untuk mengapit petikan langsung yang berasal dari pembicaraan, naskah, atau bahan tertulis lain.

Misalnya:

- "Merdeka atau mati!" seru Bung Tomo dalam pidatonya.
- "Kerjakan tugas ini sekarang," perintah atasannya, "karena besok akan dibahas dalam rapat!"
- Menurut Pasal 31 ayat (1) Undang-Undang Dasar Negara Republik Indonesia Tahun 1945, "Setiap warga negara berhak mendapat pendidikan."

> 1. Tanda petik digunakan untuk mengapit judul puisi, judul lagu, judul artikel, judul naskah, judul bab buku, judul pidato/khotbah, atau tema/subtema yang terdapat di dalam kalimat.

Misalnya:

- Puisi "Pahlawanku" terdapat pada halaman 125 buku itu.
- Marilah, kita menyanyikan lagu "Maju Tak Gentar"!
- Saya sedang membaca "Peningkatan Mutu Daya Ungkap Bahasa Indonesia" dalam buku *Bahasa Indonesia Menuju Masyarakat Madani*.
- Makalah "Pembentukan Insan Cerdas Kompetitif" menarik perhatian peserta seminar.
- Perhatikan "Hubungan Antarklausa" dalam buku *Tata Bahasa Baku Bahasa Indonesia*.
- Ceramah subuh minggu lalu di Masjid Istiqlal berjudul "Hikmah dan Tujuan Berpuasa Ramadan".
- Kongres Bahasa Indonesia XI bertema "Menjayakan Bahasa dan Sastra Indonesia".

> 1. Tanda petik digunakan untuk mengapit istilah ilmiah yang kurang dikenal atau kata yang mempunyai arti khusus.

Misalnya:

- "Peladen" komputer ini sudah tidak berfungsi.
- Dilarang memberikan "amplop" kepada petugas!


### 2.3.11 Tanda Petik Tunggal (~...~)

> 1. Tanda petik tunggal digunakan untuk mengapit petikan yang terdapat dalam petikan lain.

Misalnya:

- Tanya dia, "Kaudengar bunyi 'kring-kring' tadi?"
- "Kudengar teriak anakku, 'Ibu, Bapak pulang!', dan rasa letihku lenyap seketika," ujar Pak Hamdan.
- "Kita bangga karena lagu 'Indonesia Raya' berkumandang di arena Asian Games," kata Ketua KONI.

> 1. Tanda petik tunggal digunakan untuk mengapit makna, padanan, atau penjelasan kata atau ungkapan.

Misalnya:

- tergugat 'yang digugat'
- retina 'dinding mata sebelah dalam'
- noken 'tas khas Papua'
- *tadulako* 'panglima'
- *marsiadap ari* 'saling bantu'
- *tuah sakato* 'sepakat demi manfaat bersama'
- *self quarantine* 'karantina mandiri'
- *lockdown* 'karantina wilayah'
- *marhūn bih* 'utang' atau 'pinjaman'


### 2.3.12 Tanda Kurung ( () )

> 1. Tanda kurung digunakan untuk mengapit keterangan tambahan, seperti singkatan atau padanan kata asing.

Misalnya:

- Bahasa Indonesia mempunyai tes standar yang disebut Uji Kemahiran Berbahasa Indonesia (UKBI).
- Banyak pemengaruh (influencer) yang mendapat apresiasi karena konten yang membangun.

> 1. Tanda kurung digunakan untuk mengapit keterangan atau penjelasan yang bukan bagian utama kalimat.

Misalnya:

- Puisi Tranggono yang berjudul "Ubud" (nama tempat yang terkenal di Bali) ditulis pada tahun 1962.
- Keterangan itu (lihat Tabel 10) menunjukkan arus perkembangan baru pasar dalam negeri.

> 1. Tanda kurung digunakan untuk mengapit kata yang keberadaannya di dalam teks dapat dimunculkan atau dihilangkan.

Misalnya:

- Dia berangkat ke kantor selalu menaiki (bus) Transjakarta.
- Pesepak bola kenamaan itu berasal dari (Kota) Padang.

> 1. Tanda kurung digunakan untuk mengapit huruf atau angka sebagai penanda perincian yang ditulis ke samping atau ke bawah di dalam kalimat.

Misalnya:

- Faktor produksi menyangkut (a) bahan baku, (b) biaya produksi, dan (c) tenaga kerja.
- Dia harus melengkapi berkas lamarannya dengan melampirkan  
	(1) daftar riwayat hidup,  
	(2) ijazah terakhir, dan  
	(3) surat keterangan kesehatan.


### 2.3.13 Tanda Kurung Siku ( [ ] )

> 1. Tanda kurung siku digunakan untuk mengapit huruf, kata, atau kelompok kata sebagai koreksi atau tambahan atas kesalahan atau kekurangan di dalam naskah asli yang ditulis orang lain.

Misalnya:

- Sang Sapurba men\[d\]engar bunyi gemerisik.
- Penggunaan bahasa dalam karya ilmiah harus sesuai \[dengan\] kaidah bahasa Indonesia.
- Ulang tahun \[Proklamasi Kemerdekaan\] Republik Indonesia dirayakan secara khidmat.

> 1. Tanda kurung siku digunakan untuk mengapit keterangan dalam kalimat penjelas yang terdapat dalam tanda kurung.

Misalnya:

- Persamaan kedua proses itu (perbedaannya dibicarakan di dalam Bab II \[lihat halaman 35-38\]) perlu dibentangkan di sini.


### 2.3.14 Tanda Garis Miring (/)

> 1. Tanda garis miring digunakan dalam nomor surat, nomor pada alamat, dan penandaan masa 1 tahun yang terbagi dalam 2 tahun takwim.

Misalnya:

- Nomor: 7/PK/II/2022
- Jalan Kramat III/10

> 1. Tanda garis miring digunakan sebagai pengganti kata *dan*, *atau*, serta *setiap*.

Misalnya:

- Semua organisasi harus memiliki AD/ART. = 'Semua organisasi harus memiliki anggaran dasar dan anggaran rumah tangga.'
- Dalam susunan kepanitiaan dia tercatat sebagai ketua/anggota. = 'Dalam susunan kepanitiaan dia tercatat sebagai ketua dan anggota.'
- Pilih salah satu moda transportasi darat/laut! = 'Pilih salah satu moda transportasi darat atau laut!'
- Yang harus mengambil rapor adalah orang tua/wali peserta didik masing-masing. = 'Yang harus mengambil rapor adalah orang tua atau wali peserta didik masing-masing.'
- Buku dan/atau majalah dapat dijadikan sumber rujukan. = 'Buku dan majalah atau buku atau majalah dapat dijadikan sumber rujukan.'
- Staf yang berhalangan hadir diwajibkan mengganti hari dan/atau bertukar jadwal dengan staf lain. = 'Staf yang berhalangan hadir diwajibkan mengganti hari dan bertukar jadwal dengan staf lain atau staf yang berhalangan hadir diwajibkan mengganti hari atau bertukar jadwal dengan staf lain.'
- Harga kain itu Rp75.000,00/meter. = 'Harga kain itu Rp75.000,00 setiap meter.'
- Kecepatan mobil ini dapat mencapai 150 km/jam. = 'Kecepatan mobil ini dapat mencapai 150 km setiap jam.'

> 1. Tanda garis miring digunakan untuk mengapit huruf, kata, atau kelompok kata sebagai koreksi atau pengurangan atas kesalahan atau kelebihan di dalam naskah asli yang ditulis orang lain.

Misalnya:

- *Asmara/n/dana* merupakan salah satu tembang macapat budaya Jawa.
- Dia sedang menyelesaikan /h/utangnya di bank.
- Maka adalah seorang/-orang/raja di dalam Bidakara.
- Syahdan, /maka/ beberapa dipersembahkan oleh segala wazir /perdana menteri/ yang besar-besar kepada baginda.
- Jika demikian, /itu dan/ marilah, kita mufakat dan musyawarah.


### 2.3.15 Tanda Apostrof (~)

Tanda apostrof dapat digunakan untuk menunjukkan penghilangan bagian kata atau bagian angka tahun dalam konteks tertentu.

Misalnya:

- Dia 'kan kusurati. ('kan = akan)
- Malam 'lah tiba. ('lah = telah)
- Diriku s'lalu dimanja. (s'lalu = selalu)
- 5-2-'21 ('21 = 2021)

Catatan:

> Penggunaan tanda apostrof ini lazim dalam ragam nonstandar.



### 2.4.1 Serapan Umum

> 1. Harakat fatah atau bunyi */a/* (Arab) yang dilafalkan pendek atau panjang menjadi *a*.

Misalnya:

- *'umr **a** h* (ع ْمَرةٌ) = umr *a* h
- *y **a** tīm* (يَتِيْمٌ) = y *a* tim
- *ḥal **ā** l* (حَلاَل) = hal *a* l
- *riḍ **ā** '* (رِضًا) = rid *a*

> 1. Huruf *'ain* (ﻉ Arab) pada awal suku kata menjadi *a*, *i*, atau *u*.

Misalnya:

- *' **a** jā'ib* (عَجَائِبُ) = *a* jaib
- *sa' **ā** dah* (سَعَادَةٌ) = sa *a* dah
- ***'i** lm* (عِلْمٌ) = *i* lmu
- *qā' **i** dah* (قَاعِدَةٌ) = ka *i* dah
- *' **u** zr* (عُذْرٌ) = *u* zur
- *ṭā' **ū** n* (طَاعُوْنٌ) = ta *u* n

> 1. Huruf *'ain* (ﻉ Arab) pada akhir suku kata menjadi *k*.

Misalnya:

- *i'tiqād* (اِعْتِقَادٌ) = i *k* tikad
- *ta'rīf* (تَعْرِيْفٌ) = ta *k* rif
- *rukū'* (رُكُوْعٌ) = ruku *k*
- *simā'* (سِمَاعٌ) = sima *k*

> 1. Huruf *hamzah* (ء Arab) yang dibaca vokal menjadi *a*, *i*, atau *u*.

Misalnya:

- ***a** mr* (أَمْرٌ) = *a* mar
- *mas' **a** lah* (مَسْئَلَةٌ) = mas *a* lah
- ***i** syārah* (إِشَارَةٌ) = *i* syarat
- *nā' **i** b* (نَائِبٌ ) = na *i* b
- ***u** fuq* (أُفُقٌ) = *u* fuk
- *uṣ **ū** l* (أُصُوْلٌ) = *u* sul

> 1. Gabungan huruf *aa* (Belanda) menjadi *a*.

Misalnya:

- *b **aa** l* = b *a* l
- *oct **aa** f* = okt *a* f
- *p **aa** l* = p *a* l

> 1. Gabungan huruf *ae* yang bervariasi dengan *e* menjadi *e*.

Misalnya:

- ***ae** sthetics, **e** sthetic* = *e* stetika
- *h **ae** moglobin, h **e** moglobin* = h *e* moglobin
- *pal **ae** ography, pal **e** ography* = pal *e* ografi

> 1. Gabungan huruf *ae* yang tidak bervariasi dengan *e* tetap *ae*.

Misalnya:

- ***ae** robe* = *ae* rob
- ***ae** rosol* = *ae* rosol
- *t **ae** kwondo* (Korea) = t *ae* kwondo

> 1. Gabungan huruf *ai* tetap *ai*.

Misalnya:

- *det **ai** l* = det *ai* l
- *ret **ai** l* = ret *ai* l
- *tr **ai** ler* = tr *ai* ler

> 1. Gabungan huruf *au* tetap *au*.

Misalnya:

- ***au** ra* = *au* ra
- *c **au** stic* = k *au* stik
- *hydr **au** lic* = hidr *au* lik

> 1. Gabungan huruf *bl* tetap *bl*.

Misalnya:

- ***bl** eganjur* (Bali) = *bl* eganjur
- ***bl** eketepe* (Jawa) = *bl* eketepe
- ***bl** ok* (Belanda) = *bl* ok

> 1. Huruf *c* (Inggris) yang diikuti *a*, *o*, *u*, atau konsonan menjadi *k*.

Misalnya:

- ***c** alomel* = *k* alomel
- ***c** atalyst* = *k* atalis
- ***c** onstruction* = *k* onstruksi
- ***c** onsul* = *k* onsul
- ***c** ubic* = *k* ubik
- ***c** ursor* = *k* ursor
- ***c** luster* = *k* luster
- ***c** rystal* = *k* ristal

> 1. Huruf *c* yang diikuti *e*, *i*, *oe*, atau *y* menjadi *s*.

Misalnya:

- ***c** ent* = *s* en
- ***c** entral* = *s* entral
- ***c** irculation* = *s* irkulasi
- ***c** ircus* = *s* irkus
- *abio **c** oen* = abio *s* en
- ***c** oelom* = *s* elom
- ***c** yber* = *s* iber
- ***c** ylinder* = *s* ilinder

> 1. Gabungan huruf *cc* yang diikuti *o*, *u*, atau konsonan menjadi *k*.

Misalnya:

- *a **cc** omodation* = a *k* omodasi
- *a **cc** ordeon* (Belanda) = a *k* ordeon
- *a **cc** ulturation* = a *k* ulturasi
- *a **cc** umulation* = a *k* umulasi
- *a **cc** limatization* = a *k* limatisasi
- *a **cc** reditation* = a *k* reditasi

> 1. Gabungan huruf *cc* yang diikuti *e* dan *i* menjadi *ks*.

Misalnya:

- *a **cc** ent* = a *ks* en
- *a **cc** essory* = a *ks* esori
- *a **cc** idental* = a *ks* idental
- *va **cc** ine* = va *ks* in

> 1. Gabungan huruf *cch* menjadi *k*.

Misalnya:

- *e **cch** ymosis* = e *k* imosis
- *sa **cch** arin* = sa *k* arin
- *zu **cch** ini* = zu *k* ini

> 1. Gabungan huruf *ch* yang diikuti *a*, *o*, atau konsonan menjadi *k*.

Misalnya:

- ***ch** arisma* = *k* arisma
- *me **ch** anic* = me *k* anik
- ***ch** olera* = *k* olera
- ***ch** orus* = *k* orus
- ***ch** romosome* = *k* romosom
- *te **ch** nique* = te *k* nik

> 1. Gabungan huruf *ch* yang dilafalkan */s/* atau */sy/* menjadi *s*.

Misalnya:

- *atta **ch** é* \[ətaʃeɪ\] = ata *s* e
- *bro **ch** ure* \[brəʃʊə\] = bro *s* ur
- *e **ch** elon* \[ɛʃəlɒn\] = e *s* elon

> 1. Gabungan huruf *ch* yang dilafalkan */c/* menjadi *c*.

Misalnya:

- ***ch** arter* \[tʃɑːtə\] = *c* arter
- *kim **ch** i* (Korea) \[kimtʃi\] = kim *c* i
- *mo **ch** i* (Jepang) \[mɔtʃi\] = mo *c* i

> 1. Gabungan huruf *ck* menjadi *k*.

Misalnya:

- *che **ck*** = ce *k*
- *ra **ck** et* = ra *k* et
- *ti **ck** et* = ti *k* et

> 1. Gabungan huruf *cr* (Belanda, Inggris, Prancis) menjadi *kr*.

Misalnya:

- ***cr** eatief* (Belanda) = *kr* eatif
- ***cr** ematie* (Belanda) = *kr* emasi
- ***cr** esol* (Inggris) = *kr* esol
- ***cr** itic* (Inggris) = *kr* itik
- ***cr** êpe* (Prancis) = *kr* ep
- ***cr** oissant* (Prancis) = *kr* oisan

> 1. Gabungan huruf *ct* pada akhir kata menjadi *k*.

Misalnya:

- *abstra **ct*** = abstra *k*
- *conta **ct*** = konta *k*
- *contra **ct*** = kontra *k*

> 1. Huruf *ç* (Sanskerta) menjadi *s*.

Misalnya:

- ***ç** abda* = *s* abda
- ***ç** astra* = *s* astra
- *rā **ç** i* = ra *s* i

> 1. Huruf *dal* dan *ḍad* ( د dan ض Arab) menjadi *d*.

Misalnya:

- ***d** a'wah* (دَعْوَةٌ) = *d* akwah
- *qā'i **d** ah* (قَاعِدَةٌ) = kai *d* ah
- ***ḍ** a'īf* (ضَعِيْفٌ) = *d* aif
- *ḥā **ḍ** ir* (حَاضِرٌ) = ha *d* ir

> 1. Gabungan huruf *dh* menjadi *d*.

Misalnya:

- ***dh** an **dh** ang* (Jawa) = *d* an *d* ang
- ***dh** arma* (Sanskerta) = *d* arma
- ***dh** ingklik* (Jawa) = *d* ingklik

> 1. Huruf *e* tetap *e*.

Misalnya:

- ***e** ffect* = *e* fek
- *r **e** gulation* = r *e* gulasi
- *synth **e** sis* = sint *e* sis

> 1. Gabungan huruf *ea* yang dilafalkan */i/* menjadi *i*.

Misalnya:

- *cr **ea** m* \[kriːm\] = kr *i* m
- *g **ea** r* \[ɡɪə\] = g *i* r
- *t **ea** m* \[tiːm\] = t *i* m

> 1. Gabungan huruf *ea* yang dilafalkan bukan */i/* tetap *ea*.

Misalnya:

- *alin **ea*** \[alɪnea\] = alin *ea*
- *pancr **ea** s* \[pankreas\] = pankr *ea* s
- *th **ea** ter* \[teatər\] = t *ea* ter

> 1. Gabungan huruf *ee* menjadi *e*.

Misalnya:

- *apoth **ee** k* (Belanda) = apot *e* k
- *id **ee*** (Belanda) = id *e*
- *nomin **ee*** (Inggris) = nomin *e*

> 1. Gabungan huruf *ei* tetap *ei*.

Misalnya:

- ***ei** detic* = *ei* detik
- *m **ei** osis* = m *ei* osis
- *prot **ei** n* = prot *ei* n

> 1. Gabungan huruf *eo* tetap *eo*.

Misalnya:

- *g **eo** metry* = g *eo* metri
- *ster **eo*** = ster *eo*
- *z **eo** lite* = z *eo* lit

> 1. Gabungan huruf *eu* tetap *eu*.

Misalnya:

- *n **eu** tron* = n *eu* tron
- ***eu** genol* = *eu* genol
- ***eu** ropium* = *eu* ropium

> 1. Gabungan huruf *eu* (Aceh, Sunda, Rejang) yang dilafalkan */ɘ/* tetap *eu*.

Misalnya:

- *m **eu** nasah* (Aceh) = m *eu* nasah
- *k **eu** k **eu** h* (Sunda) = k *eu* k *eu* h
- *sad **eu*** (Rejang) = sad *eu*

> 1. Huruf *fa* (ﻑ Arab) menjadi *f*.

Misalnya:

- *a **f** ḍal* (أَفْضَلُ) = a *f* dal
- *ʼāri **f*** (عَارِفٌ) = ari *f*
- ***f** aṣīḥ* (فَصِيْحٌ) = *f* asih

> 1. Huruf *f* tetap *f*.

Misalnya:

- ***f** actor* = *f* aktor
- ***f** anatic* = *f* anatik
- ***f** ossil* = *f* osil

> 1. Gabungan huruf *gh* menjadi *g*.

Misalnya:

- *la **gh** u* (Sanskerta) = la *g* u
- *sor **gh** um* = sor *g* um
- *spa **gh** etti* = spa *g* eti

> 1. Huruf *gain* (غ Arab) menjadi *g*.

Misalnya:

- ***g** ībah* (غِيْبَةٌ) = *g* ibah
- *ma **g** firah* (مَغْفِرَةٌ) = ma *g* firah
- *ma **g** rib* (مَغْرِبٌ) = ma *g* rib

> 1. Huruf *ḥa* dan *ha* (ح dan ه Arab) menjadi *h*.

Misalnya:

- ***ḥ** ākim* (حَاكِمٌ) = *h* akim
- *iṣlā **ḥ*** (إِصْلَاحٌ) = isla *h*
- ***h** awā'* (هَوَاءٌ) = *h* awa
- *sa **h** m* (سَهْمٌ) = sa *h* am

> 1. Huruf *hamzah* (ء Arab) pada tengah kata menjadi *k*.

Misalnya:

- *ma'mūm* (مَأْمُوْمٌ) = ma *k* mum
- *mu'mīn* (مُؤْمِنٌ) = mu *k* min
- *ta'wīl* (تَأْوِيْلٌ) = ta *k* wil

> 1. Huruf *hamzah* (ﺀ Arab) pada akhir kata dihilangkan.

Misalnya:

- *imlā'* (إِمْلَاءٌ) = iml *a*
- *munsyi'* (مُنْشِئٌ) = munsy *i*
- *wuḍū'* (وُضُوْءٌ) = wud *u*
1. Harakat *kasrah* atau bunyi \*/\*i/ (Arab) yang dilafalkan pendek atau panjang menjadi *i*.

Misalnya:

- *i't **i** kāf* (اِعْتِكَافٌ) = ikt *i* kaf
- *q **i** yāmah* (قِيَامَةٌ) = k *i* amat
- *naṣ **ī** ḥah* (نَصِيْحَةٌ) = nas *i* hat
- *ṣaḥ **ī** ḥ* (صَحِيْحٌ) = sah *i* h

> 1. Huruf *i* pada awal suku kata dan diikuti *a* atau *o* tetap *i*.

Misalnya:

- ***i** ambus* = *i* ambus
- ***i** on* = *i* on
- ***i** ota* = *i* ota

> 1. Gabungan huruf *ie* (Belanda) yang dilafalkan */i/* menjadi *i*.

Misalnya:

- *favor **ie** t* \[favorit\] = favor *i* t
- *polit **ie** k* \[politik\] = polit *i* k
- *r **ie** m* \[rim\] = r *i* m

> 1. Gabungan huruf *ie* (Latin) tetap *ie*.

Misalnya:

- *car **ie** s* = kar *ie* s
- *spec **ie** s* = spes *ie* s
- *var **ie** tas* = var *ie* tas

> 1. Huruf *jim* (ﺝ Arab) menjadi *j*.

Misalnya:

- ***kh** uṣūṣ* (خُصُوْصٌ) = *kh* usus
- *ma **kh** lūq* (مَخْلُوْقٌ) = ma *kh* luk
- *tārī **kh*** (تَارِيْخٌ) = tari *kh*

> 1. Gabungan huruf *kl* tetap *kl*.

Misalnya:

- ***kl** em* (Belanda) = *kl* em
- ***kl** enik* (Jawa) = *kl* enik
- ***kl** iniek* (Belanda) = *kl* inik

> 1. Gabungan huruf *kr* tetap *kr*.

Misalnya:

- ***kr** ans* (Belanda) = *kr* ans
- ***kr** i* (Aceh) = *kr* i
- ***kr** ida* (Sanskerta) = *kr* ida

> 1. Huruf *n* (Jepang, Cina) di depan *p* menjadi *m*.

Misalnya:

- *ke **n** po* (Jepang) = ke *m* po
- *lu **n** pia* (Cina) = lu *m* pia
- *te **n** pura* (Jepang) = te *m* pura

> 1. Gabungan huruf *ng* tetap *ng*.

Misalnya:

- *conti **ng** ent* = konti *ng* en
- *co **ng** ress* = ko *ng* res
- *li **ng** uistiek* (Belanda) = li *ng* uistik

> 1. Gabungan huruf *oe* (*oi* Yunani) menjadi *e*.

Misalnya:

- *am **oe** ba*, *am **oi** be* = am *e* ba
- *f **oe** tus* = f *e* tus
- ***oe** strogen* = *e* strogen

> 1. Gabungan huruf *oi* (Belanda, Inggris, Prancis) tetap *oi*.

Misalnya:

- *cr **oi** ssant* (Prancis) = kr *oi* san
- *p **oi** nt* (Inggris) = p *oi* n
- *reserv **oi** r* (Belanda) = reserv *oi* r

> 1. Gabungan huruf *oo* (Belanda) menjadi *o*.

Misalnya:

- *astrol **oo** g* = astrol *o* g
- *biosc **oo** p* = biosk *o* p
- *prov **oo** st* = prov *o* s

> 1. Gabungan huruf *oo* yang dilafalkan */u/* menjadi *u*.

Misalnya:

- *cart **oo** n* \[kɑːtuːn\] = kart *u* n
- *p **oo** l* \[puːl\] = p *u* l
- *pr **oo** f* \[pruːf\] = pr *u* f

> 1. Gabungan huruf *oo* (vokal ganda) tetap *oo*.

Misalnya:

- *kamom **oo** se* (Wolio) = kamom *oo* se
- *n **oo** sphère* = n *oo* sfer
- *z **oo** logy* = z *oo* logi

> 1. Gabungan huruf *ou* yang dilafalkan */u/* menjadi *u*.

Misalnya:

- *cont **ou** r* \[kɒntʊə\] = kont *u* r
- *c **ou** pon* \[kuːpɒn\] = k *u* pon
- *s **ou** venir* \[suːvənɪə\] = s *u* venir

> 1. Gabungan huruf *ou* yang dilafalkan bukan */u/* tetap *ou*.

Misalnya:

- *c **ou** lrophobia* \[koʊlrəfoʊbiə\] = k *ou* lrofobia
- *mond **ou*** (Fakfak) \[mɔndɔw\] = mond *ou*
- *v **ou** cher* \[vaʊtʃə\] = v *ou* cer

> 1. Gabungan huruf *ph* menjadi *f*.

Misalnya:

- *micro **ph** one* = mikro *f* on
- ***ph** ase* = *f* ase
- *spectogra **ph*** = spektogra *f*

> 1. Gabungan huruf *pl* tetap *pl*.

Misalnya:

- *am **pl** ang* = am *pl* ang
- *im **pl** ant* = im *pl* an
- ***pl** eno* = *pl* eno

> 1. Gabungan huruf *pr* tetap *pr*.

Misalnya:

- *a **pr** on* = a *pr* on
- ***pr** aja* = *pr* aja
- ***pr** oduct* = *pr* oduk

> 1. Gabungan huruf *ps* tetap *ps*.

Misalnya:

- ***ps** eudonym* = *ps* eudonim
- ***ps** ychiatry* = *ps* ikiatri
- ***ps** ychosomatic* = *ps* ikosomatik

> 1. Rangkaian huruf *pt* tetap *pt*.

Misalnya:

- ***pt** erodactyl* = *pt* erodaktil
- ***pt** eropoda* = *pt* eropoda
- ***pt** yalin* = *pt* ialin

> 1. Huruf *q* menjadi *k*.

Misalnya:

- *a **q** uarium* = a *k* uarium
- *e **q** uator* = e *k* uator
- *fre **q** uency* = fre *k* uensi

> 1. Huruf *qaf* (ﻕ Arab) menjadi *k*.

Misalnya:

- *ma **q** ām* (مَقَامٌ) = ma *k* am
- *muṭla **q*** (مُطْلَقٌ) = mutla *k*
- ***q** urūn* (قُرُوْنٌ) = *k* urun

> 1. Gabungan huruf *rh* menjadi *r*.

Misalnya:

- ***rh** esus* = *r* esus
- ***rh** inoscope* = *r* inoskop
- ***rh** ombus* = *r* ombus

> 1. Huruf *śa*, *sin*, dan *ṣad* (ث,س,dan ص Arab) menjadi *s*.

Misalnya:

- *a **ś** iri* (ﴽﺜﻳﺮي) = a *s* iri
- *wāri **ś*** (وَارِثٌ) = wari *s*
- *a **s** ā **s*** (أَسَاسٌ) = a *s* a *s*
- ***s** il **s** ilah* (سِلْسِلَةٌ) = *s* il *s* ilah
- *khu **ṣ** ū **ṣ*** (خُصُوْصٌ) = khu *s* u *s*
- ***ṣ** aḥḥ* (صَحَّ) = *s* ah

> 1. Huruf *syin* (ﺵ Arab) menjadi *sy*.

Misalnya:

- *'ar **sy*** (عَرْشٌ) = ara *sy*
- *'ā **sy** iq* (عَاشِقٌ) = a *sy* ik
- ***sy** ukr* (شُكْرٌ) = *sy* ukur

> 1. Gabungan huruf *sc* yang diikuti *a*, *o*, *u*, atau konsonan menjadi *sk*.

Misalnya:

- ***sc** allop* = *sk* alop
- ***sc** andium* = *sk* andium
- ***sc** ore* = *sk* or
- ***sc** otopia* = *sk* otopia
- ***sc** uba* = *sk* uba
- ***sc** utella* = *sk* utela
- ***sc** lerosis* = *sk* lerosis
- *manu **sc** ript* = manu *sk* rip

> 1. Gabungan huruf *sc* yang diikuti *e*, *i*, atau *y* menjadi *s*.

Misalnya:

- *adole **sc** ence* = adole *s* ens
- *lumine **sc** ence* = lumine *s* ens
- *o **sc** ilator* = o *s* ilator
- ***sc** intillation* = *s* intilasi
- *hyo **sc** yamine* = hio *s* iamina
- ***sc** yphistoma* = *s* ifistoma

> 1. Gabungan huruf *sch* yang diikuti vokal menjadi *sk*.

Misalnya:

- ***sch** ema* = *sk* ema
- ***sch** izophrenia* = *sk* izofrenia
- ***sch** olastiek* = *sk* olastik

> 1. Gabungan huruf *sr* tetap *sr*.

Misalnya:

- *a **sr** ār* (Arab) = a *sr* ar
- *a **sr** i* (Sanskerta) = a *sr* i
- ***sr** isip* (Jawa) = *sr* isip

> 1. Huruf *t* yang diikuti *i* dan dilafalkan */s/* menjadi *s*.

Misalnya:

- *garan **t** ie* \[xarɑn(t)si\] = garan *s* i
- *pa **t** ient* \[patiënt\] = pa *s* ien
- *poli **t** ie* \[poli(t)si\] = poli *s* i

> 1. Huruf *ṭa* (ﻁ Arab) menjadi *t*.

Misalnya:

- *mu **ṭ** laq* (مُطْلَقٌ) = mu *t* lak
- *syar **ṭ*** ( شَرْطٌ ) = syara *t*
- ***ṭ** abīb* (طَبِيْبٌ) = *t* abib

> 1. Gabungan huruf *th* menjadi *t*.

Misalnya:

- *ba **th** ok* (Jawa) = ba *t* ok
- *me **th** ode* (Belanda) = me *t* ode
- ***th** esis* = *t* esis

> 1. Gabungan huruf *tr* tetap *tr*.

Mislanya:

- *pu **tr** en* = pu *tr* en
- ***tr** ansfer* = *tr* ansfer
- *ma **tr** a* = ma *tr* a

> 1. Gabungan huruf *ts* (Jepang) tetap *ts*.

Misalnya:

- *juji **ts** u* = juji *ts* u
- *mochi **ts** uki* = moci *ts* uki
- ***ts** unami* = *ts* unami

> 1. Huruf *u* tetap *u*.

Misalnya:

- *b **u** s* = b *u* s
- *mod **u** s* = mod *u* s
- ***u** nit* = *u* nit

> 1. Harakat *damah* atau bunyi */u/* (Arab) yang dilafalkan pendek atau panjang menjadi *u*.

Misalnya:

- *m **u** bāḥ* (مُبَاحٌ) = m *u* bah
- ***u** f **u** q* (أُفُقٌ) = *u* f *u* k
- *mafh **ū** m* (مَفْهُوْمٌ) = mafh *u* m
- *qām **ū** s* (قَامُوْسٌ) = kam *u* s

> 1. Gabungan huruf *ua* tetap *ua*.

Misalnya:

- *aq **ua** rium* = ak *ua* rium
- *d **ua** lism* = d *ua* lisme
- *eq **ua** tor* = ek *ua* tor

> 1. Gabungan huruf *ue* tetap *ue*.

Misalnya:

- *conseq **ue** nt* = konsek *ue* n
- *d **ue** t* = d *ue* t
- *freq **ue** ncy* = frek *ue* nsi

> 1. Gabungan huruf *ui* tetap *ui*.

Misalnya:

- *cond **ui** te* = kond *ui* te
- *eq **ui** nox* = ek *ui* noks
- *eq **ui** valent* = ek *ui* valen

> 1. Gabungan huruf *uo* tetap *uo*.

Misalnya:

- *d **uo** denum* = d *uo* denum
- *fl **uo** rescence* = fl *uo* resens
- *q **uo** ta* = k *uo* ta

> 1. Gabungan huruf *uu* menjadi *u*.

Misalnya:

- *lect **uu** r* = lekt *u* r
- *premat **uu** r* = premat *u* r
- *vac **uu** m* = vak *u* m

> 1. Huruf *v* tetap *v*.

Misalnya:

- *e **v** acuation* = e *v* akuasi
- ***v** ision* = *v* isi
- ***v** itamin* = *v* itamin

> 1. Huruf *wau* (و Arab) yang tidak terletak pada akhir kata tetap *w*.

Misalnya:

- *jad **w** al* (جَدْوَلٌ) = jad *w* al
- *taq **w** ā* (تَقْوًى) = tak *w* a
- ***w** ujūd* (وُجُوْدٌ) = *w* ujud

> 1. Huruf *wau* (ﻭ Arab) yang terdiri atas dua konsonan dan didahului *u* dihilangkan.

Misalnya:

- *nubu **ww** ah* (نُبُوَّةٌ) = nub *u* at
- *qu **ww** ah* (قُوَّةٌ) = k *u* at
- *ukhu **ww** ah* (أُخُوَّةٌ) = ukh *u* ah

> 1. Huruf *x* pada awal suku kata tetap *x*.

Misalnya:

- *macro **x** enoglossophobia* = makro *x* enoglosofobia
- ***x** enon* = *x* enon
- ***x** ylophone* = *x* ilofon

> 1. Huruf *x* pada tengah kata atau akhir suku kata menjadi *ks*.

Misalnya:

- *e **x** ecutive* = e *ks* ekutif
- *ta **x** i* = ta *ks* i
- *comple **x*** = komple *ks*
- *late **x*** = late *ks*

> 1. Gabungan huruf *xc* yang diikuti *e* atau *i* menjadi *ks*.

Misalnya:

- *e **xc** eption* = e *ks* epsi
- *e **xc** ess* = e *ks* es
- *e **xc** ision* = e *ks* isi
- *e **xc** itation* = e *ks* itasi

> 1. Gabungan huruf *xc* yang diikuti *a*, *o*, *u*, atau konsonan menjadi *ksk*.

Misalnya:

- *e **xc** alatie* = e *ksk* alasi
- *e **xc** avatie* = e *ksk* avasi
- *e **xc** omunnicatie* = e *ksk* omunikasi
- *e **xc** oriation* = e *ksk* oriasi
- *e **xc** ubation* = e *ksk* ubasi
- *e **xc** ursie* = e *ksk* ursi
- *e **xc** lusief* = e *ksk* lusif
- *e **xc** retie* = e *ksk* resi

> 1. Huruf *y* yang dilafalkan */y/* tetap *y*.

Misalnya:

- ***y** akitori* (Jepang) \[yakitɔri\] = *y* akitori
- ***y** oga* (Sanskerta) \[yoga\] = *y* oga
- ***y** uan* (Cina) \[yuán\] = *y* uan

> 1. Huruf *y* yang dilafalkan */ai/* atau */i/* menjadi *i*.

Misalnya:

- *c **y** ber* \[sʌɪbə\] = s *i* ber
- *ps **y** chodrama* \[sʌɪkə(ʊ)drɑːmə\] = ps *i* kodrama
- *d **y** namo* (Belanda) \[dinamo\] = d *i* namo
- ***y** ttrium* \[ɪtrɪəm\] = *i* trium

> 1. Huruf *ya* (ﻱ Arab) pada awal suku kata menjadi *y*.

Misalnya:

- *hidā **y** ah* (هِدَايَةٌ) = hida *y* ah
- ***y** a'nī* (يَعْنِي) = *y* akni
- ***y** aqīn* (يَقِيْنٌ) = *y* akin

> 1. Huruf *ya* (ﻱ Arab) yang didahului *i* dihilangkan.

Misalnya:

- *khi **y** ānah* (خِيَانَةٌ) = kh *i* anat
- *qi **y** ās* (قِيَاسٌ) = k *i* as
- *zi **y** ārah* (زِيَارَةٌ) = z *i* arah

> 1. Huruf *z* tetap *z*.

Misalnya:

- ***z** enith* = *z* enit
- ***z** odiac* = *z* odiak
- ***z** ygote* = *z* igot

> 1. Huruf *zai*, *żal*, dan *ẓa* (ز,ذ,dan ظ Arab) menjadi *z*.

Misalnya:

- ***z** amān* (زَمَانٌ) = *z* aman
- ***z** uhd* (زُهْدٌ) = *z* uhud
- *ustā **ż*** (أُسْتَاذُ) = usta *z*
- ***ż** āt* (ذَاتٌ) = *z* at
- *ḥāfi **ẓ*** (حَافِظٌ) = hafi *z*
- ***ẓ** ālim* (ظَالِمٌ) = *z* alim


### 2.4.2 Serapan Khusus

> 1. Deret konsonan pada akhir kata bahasa Arab disisipi vokal yang sama dengan vokal sebelumnya (*/a/*, */i/*, atau */u/*) di antara deret konsonan tersebut.

Misalnya:

- *'aqd* (عَقْدٌ) *a* k *a* d
- *fajr* (فَجْرٌ) f *a* j *a* r
- *jild* (جِلْدٌ) j *i* l *i* d
- *milk* (مِلْكٌ) m *i* l *i* k
- *syukr* (شُكْرٌ) sy *u* k *u* r
- *'umr* (عُمْرٌ) *u* m *u* r

> 1. Deret konsonan pada akhir kata bahasa Arab dapat ditambah vokal */u/*.

Misalnya:

- *farḍ* (فَرْضٌ) fard *u*
- *ṡalj* (ثَلْجٌ) salj *u*
- *waqt* (وَقْتٌ) wakt *u*

> 1. Konsonan ganda diserap menjadi konsonan tunggal.

Misalnya:

- *a **cc** u* = a *k* i
- *'a **ll** āmah* = a *l* amah
- *ba **ll** et* = ba *l* et
- *co **mm** i **ss** ion* = ko *m* i *s* i
- *e **ff** ect* = e *f* ek
- *espre **ss** o* = espre *s* o
- *fe **rr** um* = fe *r* um
- *ga **bb** ro* = ga *b* ro
- **ka** ff **ah** = ka *f* ah
- *o **nn** agata* = o *n* agata
- *pi **zz** a* = pi *z* a
- *salfe **gg** io* = salfe *g* io
- *tafa **kk** ur* = tafa *k* ur
- *ta **mm** at* = ta *m* at
- *te **rr** aco **tt** a* = te *r* ako *t* a
- *u **mm** at* = u *m* at

Konsonan rangkap dipertahankan jika menimbulkan ketaksaan atau konotasi negatif.

Misalnya:

- *ma **nn*** = ma *nn* a (bandingkan dengan *mana*)
- *ma **ss*** = ma *ss* a (bandingkan dengan *masa*)
- *te **ll** er* = te *ll* er (bandingkan dengan *teler*)

> 1. Unsur serapan yang sudah lazim digunakan dan tidak sesuai dengan kaidah umum penulisan unsur serapan tidak diubah.

- alamat
- bengkel
- dongkrak
- faedah
- heran
- kabar
- Kamis
- khotbah
- koperasi
- lafal
- lahir
- majedub
- majelis
- majemuk
- majenun
- makalah
- medan
- nalar
- napas
- paham
- perlu
- pikir
- populer
- proyek
- Rabu
- sahabat
- sehat
- Selasa
- Senin
- setan
- sirsak
- soal
- syahadat
- telefon
- terjemah
- trayek

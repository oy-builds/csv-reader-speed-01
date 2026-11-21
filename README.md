[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/oy-builds/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/oy-builds/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed — a fast drop-in for csv-reader 1.0.0

An entry for make.fun’s **csv-reader-speed-01** bounty: read broken CSV
files faster than csv-reader 1.0.0 while returning its answers exactly.

## Layout

- `main.ts` — the harness driver. Reads every case from
  `/input/cases.json` (locally `MAKEFUN_INPUT_DIR`), answers each with
  `run()`, and writes `/output/answers.json` (locally
  `MAKEFUN_OUTPUT_DIR`). It turns V8’s incremental marking off
  (`--no-incremental-marking` via `node:v8`) before importing `solve.js`,
  as the house baseline’s driver does.
- `solve.js` — a dependency-free ES module exporting `run(input)`. For an
  input `{text, header}` it returns `{columns, rows, errors}` with
  csv-reader 1.0.0’s exact semantics, implemented from the rules text as a
  single left-to-right pass over the text: unquoted fields are taken as
  single slices, quoted fields are located with an `indexOf` lookahead for
  the closing quote, and extra pieces are allocated only where a stray CR
  was dropped or a quoted field holds doubled quotes or line breaks.
- `smoke.test.mjs` — re-runnable checks (see below).
- `package.json` — `{"type": "module"}`, so `solve.js` loads as an ES
  module like the baseline’s.
- `.makefun/owner.json` — the make.fun claim file naming the entrant’s
  wallet.
- `LICENSE` — MIT, © 2026 oy-builds.

## Semantics (exactly csv-reader 1.0.0’s)

- One U+FEFF at the very start of the text is dropped.
- A record ends at LF or CRLF; a line left with no characters is no record.
- A CR outside quotes that is not part of CRLF is dropped (`stray_cr`).
- A field that opens with `"` runs to the next `"` that is not doubled
  (`""` inside is one quote; each CRLF or lone CR inside reads as LF).
  What follows the closing quote, up to the next comma or line break, is
  appended as it stands (`quote_junk`, reported when the field ends).
- A quote that never closes is a literal character, and the text after it
  is read again as unquoted (`unterminated_quote`). A quote inside an
  unquoted field is a literal character.
- Fields stay strings, never trimmed or converted.
- `columns` is the first record when `header` is true (`[]` when there is
  none), else `null`. Every later record is padded with empty strings
  (`short_row`, with `fields`: its field count) or cut (`long_row`, with
  `extra`: the cut fields) to the first record’s width.
- Each error is `{code, line, row}` in the order met, a record’s
  `short_row`/`long_row` when it ends: `line` is the 1-based line its
  record starts on (counting every LF, CRLF and lone CR inside quotes),
  `row` its record’s index in `rows`, null for the header.

## Run it

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Check it

```sh
node smoke.test.mjs
```

This compares `run()` against the kit’s practice reference
(`practice/reference/expected.json`) for all six practice cases and
against the house baseline’s own `run()` on a battery of adversarial
inputs (quotes at EOF, CRLF inside quotes, lone CRs, blank lines, ragged
rows, BOM, header true/false, junk after closing quotes, unterminated
quotes). It expects the kit at `../kits/csv-reader-speed-01-run-20261121/`
relative to this repository; set `MAKEFUN_KIT_DIR` to the kit directory
to override.

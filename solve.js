// A fast single-pass reader for broken CSV, written from the competition's
// rules text. run(input) answers {columns, rows, errors} for {text, header}
// with csv-reader 1.0.0's exact semantics:
//
//   - one U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line with no characters is no record;
//   - a CR outside quotes that is not part of CRLF is dropped (stray_cr);
//   - a field opening with " runs to the next " that is not doubled (""
//     inside is one quote; CRLF or a lone CR inside reads as one LF); text
//     after the closing quote up to the next comma or line break is appended
//     as it stands (quote_junk, reported when the field ends);
//   - a quote that never closes is a literal character and the rest of the
//     field is re-read as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true ([] when there is
//     none), else null; every later record is padded with "" (short_row,
//     with fields: its field count) or cut (long_row, with extra: the cut
//     fields) to the first record's width;
//   - each error is {code, line, row} in the order met (a record's
//     short_row/long_row when it ends): line is the 1-based line the record
//     starts on, counting every LF, CRLF and lone CR inside quotes; row is
//     the record's index in rows, null for the header.
//
// Speed: everything is inlined into run() (no per-field helper calls, no
// captured-variable context), and the common shapes never scan per
// character:
//   - a record whose line holds no " and no stray CR is split on commas
//     with indexOf jumps;
//   - an unquoted field ends at the nearest of the next comma / LF / CR,
//     each found with indexOf;
//   - a quoted field whose body holds no doubled quote and no line break
//     is one slice.
// The next-quote, next-CR and next-LF positions are kept in monotonic
// caches (qV is the first " at or after qF, crV the first CR at or after
// crF, nlV the first LF at or after nlF), so repeated indexOf lookups stay
// amortised O(1) instead of rescanning the tail of the text on quote-free,
// CR-free or LF-free stretches — an unquoted field no longer rescans to
// the end of its line for an LF position its record already passed. The per-character
// scans remain only where the semantics need them: stray CRs inside a
// field, junk after a closing quote, and quoted bodies that hold doubled
// quotes or line breaks.

const COMMA = 44;
const QUOTE = 34;
const LF = 10;
const CR = 13;

export function run(input) {
  const text = input.text;
  const header = !!input.header;
  const n = text.length;

  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  let line = 1;
  const errors = [];
  const rows = [];
  let columns = header ? [] : null;
  let width = -1;
  let haveFirst = false;
  // The record being read: the line it starts on and its index in rows
  // (null for the header). Errors report against these.
  let recLine = 1;
  let recRow = null;

  // Monotonic occurrence caches, seeded at the first scan position.
  let qV = text.indexOf('"', i);
  let qF = i;
  let crV = text.indexOf('\r', i);
  let crF = i;
  let nlV = text.indexOf('\n', i);
  let nlF = i;

  while (i < n) {
    recLine = line;
    recRow = header && !haveFirst ? null : rows.length;
    let fields = null;
    let content = false;

    // ---- Fast path: a whole record on one simple line. ----
    let le = nlV;
    if (i < nlF || (le !== -1 && le < i)) { le = text.indexOf('\n', i); nlV = le; nlF = i; }
    const lineEnd = le === -1 ? n : le;
    let q = qV;
    if (i < qF || (q !== -1 && q < i)) { q = text.indexOf('"', i); qV = q; qF = i; }
    if (q === -1 || q >= lineEnd) {
      let cr = crV;
      if (i < crF || (cr !== -1 && cr < i)) { cr = text.indexOf('\r', i); crV = cr; crF = i; }
      let contentEnd = -1;
      if (cr === -1 || cr >= lineEnd) contentEnd = lineEnd;
      else if (cr === lineEnd - 1 && le !== -1) contentEnd = lineEnd - 1; // CRLF
      if (contentEnd !== -1) {
        fields = [];
        if (contentEnd > i) {
          content = true;
          let pos = i;
          for (;;) {
            const c = text.indexOf(',', pos);
            if (c === -1 || c >= contentEnd) {
              fields.push(text.slice(pos, contentEnd));
              break;
            }
            fields.push(text.slice(pos, c));
            pos = c + 1;
          }
        }
        i = le === -1 ? n : le + 1;
        if (le !== -1) line++;
      }
    }

    // ---- General path: field-by-field. ----
    if (fields === null) {
      fields = [];
      let recordDone = false;

      while (!recordDone) {
        let value;

        if (i < n && text.charCodeAt(i) === QUOTE) {
          // A field that opens with a quote: find its closing quote,
          // skipping doubled pairs (the quote cache walks them in order).
          let close = -1;
          let esc = false;
          let j = i + 1;
          for (;;) {
            let qq = qV;
            if (j < qF || (qq !== -1 && qq < j)) { qq = text.indexOf('"', j); qV = qq; qF = j; }
            if (qq === -1) break;
            j = qq;
            if (text.charCodeAt(j + 1) === QUOTE) {
              esc = true;
              j += 2;
              continue;
            }
            close = j;
            break;
          }

          if (close === -1) {
            // It never closes: the quote is a literal character and the
            // field is read again as unquoted from its opening quote.
            errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
            // Slow unquoted scan (identical rules to the stray-CR case).
            const start = i;
            let pieces = null;
            let seg = i;
            let k = i;
            for (;;) {
              if (k >= n) break;
              const c = text.charCodeAt(k);
              if (c === COMMA || c === LF) break;
              if (c === CR) {
                if (text.charCodeAt(k + 1) === LF) break;
                errors.push({ code: 'stray_cr', line: recLine, row: recRow });
                if (pieces === null) pieces = [];
                if (k > seg) pieces.push(text.slice(seg, k));
                k++;
                seg = k;
                continue;
              }
              k++;
            }
            i = k;
            if (pieces === null) {
              value = text.slice(start, k);
            } else {
              if (k > seg) pieces.push(text.slice(seg, k));
              value = pieces.join('');
            }
          } else {
            content = true;
            const from = i + 1;
            // Where the body's line breaks are (the LF scan and the CR
            // cache stay inside this record's span, so both are short).
            let lfB = nlV;
            if (from < nlF || (lfB !== -1 && lfB < from)) { lfB = text.indexOf('\n', from); nlV = lfB; nlF = from; }
            const lfIn = lfB !== -1 && lfB < close;
            let crB = crV;
            if (from < crF || (crB !== -1 && crB < from)) { crB = text.indexOf('\r', from); crV = crB; crF = from; }
            const crIn = crB !== -1 && crB < close;
            if (!esc && !lfIn && !crIn) {
              // No doubled quote and no line break inside: one slice.
              value = text.slice(from, close);
            } else if (esc && !lfIn && !crIn) {
              // Only doubled quotes inside: jump quote to quote, cutting
              // each pair down to one.
              const pieces = [];
              let seg = from;
              let k = from;
              for (;;) {
                const nq = text.indexOf('"', k);
                if (nq === -1 || nq >= close) break;
                if (nq > seg) pieces.push(text.slice(seg, nq));
                pieces.push('"');
                k = nq + 2;
                seg = k;
              }
              if (close > seg) pieces.push(text.slice(seg, close));
              value = pieces.join('');
            } else {
              // Line breaks inside (with or without doubled quotes): jump
              // special to special. An LF stays inside its slice (it is
              // already the one LF it reads as) and only advances the line
              // count; a CR or CRLF is cut out and replaced by one LF; a
              // doubled quote is cut down to one.
              let pieces = null;
              let seg = from;
              let k = from;
              for (;;) {
                let s = -1;
                let sk = 0; // 1 quote, 2 LF, 3 CR
                if (esc) {
                  const nq = text.indexOf('"', k);
                  if (nq !== -1 && nq < close) { s = nq; sk = 1; }
                }
                let nl = nlV;
                if (k < nlF || (nl !== -1 && nl < k)) { nl = text.indexOf('\n', k); nlV = nl; nlF = k; }
                if (nl !== -1 && nl < close && (s === -1 || nl < s)) { s = nl; sk = 2; }
                let cr = crV;
                if (k < crF || (cr !== -1 && cr < k)) { cr = text.indexOf('\r', k); crV = cr; crF = k; }
                if (cr !== -1 && cr < close && (s === -1 || cr < s)) { s = cr; sk = 3; }
                if (s === -1) break;
                if (sk === 2) {
                  line++;
                  k = s + 1;
                  continue;
                }
                if (pieces === null) pieces = [];
                if (s > seg) pieces.push(text.slice(seg, s));
                if (sk === 1) {
                  pieces.push('"');
                  k = s + 2;
                } else {
                  pieces.push('\n');
                  line++;
                  k = s + 1;
                  if (text.charCodeAt(k) === LF) k++;
                }
                seg = k;
              }
              if (pieces === null) {
                value = text.slice(from, close);
              } else {
                if (close > seg) pieces.push(text.slice(seg, close));
                value = pieces.join('');
              }
            }
            i = close + 1;
            // What follows the closing quote, up to the next comma or line
            // break, is appended as it stands. At a delimiter (or EOF)
            // there is no junk; otherwise scan it, dropping stray CRs
            // (reported as met), and report quote_junk when the field ends.
            if (i < n) {
              const jc = text.charCodeAt(i);
              if (jc !== COMMA && jc !== LF && !(jc === CR && text.charCodeAt(i + 1) === LF)) {
                const start = i;
                let pieces = null;
                let seg = i;
                let k = i;
                for (;;) {
                  if (k >= n) break;
                  const c = text.charCodeAt(k);
                  if (c === COMMA || c === LF) break;
                  if (c === CR) {
                    if (text.charCodeAt(k + 1) === LF) break;
                    errors.push({ code: 'stray_cr', line: recLine, row: recRow });
                    if (pieces === null) pieces = [];
                    if (k > seg) pieces.push(text.slice(seg, k));
                    k++;
                    seg = k;
                    continue;
                  }
                  k++;
                }
                i = k;
                let junk;
                if (pieces === null) {
                  junk = text.slice(start, k);
                } else {
                  if (k > seg) pieces.push(text.slice(seg, k));
                  junk = pieces.join('');
                }
                if (junk.length > 0) {
                  value += junk;
                  errors.push({ code: 'quote_junk', line: recLine, row: recRow });
                }
              }
            }
          }
        } else {
          // Unquoted field: it ends at the nearest comma, LF or CR.
          const nc = text.indexOf(',', i);
          let nl = nlV;
          if (i < nlF || (nl !== -1 && nl < i)) { nl = text.indexOf('\n', i); nlV = nl; nlF = i; }
          let cr = crV;
          if (i < crF || (cr !== -1 && cr < i)) { cr = text.indexOf('\r', i); crV = cr; crF = i; }
          let end = n;
          let kind = 0; // 0 EOF, 1 comma, 2 LF, 3 CR
          if (nc !== -1) { end = nc; kind = 1; }
          if (nl !== -1 && nl < end) { end = nl; kind = 2; }
          if (cr !== -1 && cr < end) { end = cr; kind = 3; }
          if (kind === 3 && text.charCodeAt(cr + 1) !== LF) {
            // A stray CR lies inside the field: slow scan, dropping each
            // stray CR (and reporting it) as it is met.
            const start = i;
            let pieces = null;
            let seg = i;
            let k = i;
            for (;;) {
              if (k >= n) break;
              const c = text.charCodeAt(k);
              if (c === COMMA || c === LF) break;
              if (c === CR) {
                if (text.charCodeAt(k + 1) === LF) break;
                errors.push({ code: 'stray_cr', line: recLine, row: recRow });
                if (pieces === null) pieces = [];
                if (k > seg) pieces.push(text.slice(seg, k));
                k++;
                seg = k;
                continue;
              }
              k++;
            }
            i = k;
            if (pieces === null) {
              value = text.slice(start, k);
            } else {
              if (k > seg) pieces.push(text.slice(seg, k));
              value = pieces.join('');
            }
          } else {
            value = text.slice(i, end);
            i = end;
          }
        }

        if (value.length > 0) content = true;
        fields.push(value);

        // The delimiter the field scan stopped at.
        if (i >= n) {
          recordDone = true;
        } else {
          const c = text.charCodeAt(i);
          if (c === COMMA) {
            i++;
            content = true;
          } else if (c === LF) {
            i++;
            line++;
            recordDone = true;
          } else {
            // CR: the scans only stop at a CR that begins a CRLF.
            i += 2;
            line++;
            recordDone = true;
          }
        }
      }
    }

    if (!content) continue; // a line left with no characters is no record

    if (!haveFirst) {
      haveFirst = true;
      width = fields.length;
      if (header) columns = fields;
      else rows.push(fields);
    } else {
      const rowIdx = rows.length;
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recLine, row: rowIdx, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        const extra = fields.splice(width);
        errors.push({ code: 'long_row', line: recLine, row: rowIdx, extra });
      }
      rows.push(fields);
    }
  }

  return { columns, rows, errors };
}

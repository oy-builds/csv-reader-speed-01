// Smoke test: this entry's run() against csv-reader 1.0.0 (the kit's house
// baseline) and against the kit's practice reference.
//
//   node smoke.test.mjs
//
// It checks, as JSON values (object key order ignored):
//   1. every practice case in the kit against practice/reference/expected.json;
//   2. a battery of adversarial inputs (quotes at EOF, CRLF inside quotes,
//      lone CRs, blank lines, ragged rows, BOM, header true/false, junk after
//      closing quotes, unterminated quotes) against the baseline's run().
// The kit is found at ../kits/csv-reader-speed-01-run-20261121/ relative to
// this repository; set MAKEFUN_KIT_DIR to its kit directory to override.

import { readFileSync } from 'node:fs';
import { run as mine } from './solve.js';

const KIT = process.env.MAKEFUN_KIT_DIR ??
  new URL('../kits/csv-reader-speed-01-run-20261121/csv-reader-speed-01-run-20261121-kit/', import.meta.url).pathname;

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

let passed = 0;
let failed = 0;
function check(label, input, expected) {
  let got;
  try {
    got = mine(input);
  } catch (e) {
    failed++;
    console.log(`FAIL ${label}: threw ${e.message}`);
    return;
  }
  if (canonical(got) === canonical(expected)) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL ${label} input=${JSON.stringify(input)}`);
    console.log(`  expected: ${canonical(expected).slice(0, 300)}`);
    console.log(`  got     : ${canonical(got).slice(0, 300)}`);
  }
}

// 1. Practice cases against the sealed reference answers.
const practiceCases = JSON.parse(readFileSync(KIT + 'practice/input/cases.json', 'utf8'));
const expected = JSON.parse(readFileSync(KIT + 'practice/reference/expected.json', 'utf8'));
const expectedById = new Map(expected.cases.map((c) => [c.id, c.output]));
for (const c of practiceCases) check(`practice:${c.id}`, c.input, expectedById.get(c.id));

// 2. Adversarial battery against the baseline itself.
const { run: oracle } = await import(KIT + 'baselines/csv-reader/solve.js');
const ADVERSARIAL = [

  // [label, input]
  ['empty-h', {text:'', header:true}],
  ['empty-nh', {text:'', header:false}],
  ['bom-only', {text:'\uFEFF', header:true}],
  ['just-nl', {text:'\n', header:false}],
  ['simple', {text:'a,b\nc,d', header:false}],
  ['simple-h', {text:'a,b\nc,d', header:true}],
  ['trailing-comma-eof', {text:'a,', header:false}],
  ['trailing-comma-nl', {text:'a,\n', header:false}],
  ['only-comma', {text:',', header:false}],
  ['blank-lines', {text:'a\n\n\nb\n', header:false}],
  ['blank-crlf', {text:'a\r\n\r\nb', header:false}],
  ['stray-cr-field', {text:'a\rb\nc', header:false}],
  ['stray-cr-start', {text:'\ra,b\n', header:false}],
  ['stray-cr-eof', {text:'a,b\r', header:false}],
  ['stray-cr-double', {text:'a\r\rb\n', header:false}],
  ['stray-cr-blank-line', {text:'a\n\rb\n', header:false}],
  ['stray-cr-in-header', {text:'a\rb,c\nd,e', header:true}],
  ['cr-only-file', {text:'\r', header:false}],
  ['crlf-only', {text:'\r\n', header:false}],
  ['stray-cr-line-num', {text:'a\rb\nc\nd', header:false}],
  ['quoted-basic', {text:'"a","b"', header:false}],
  ['quoted-comma', {text:'"a,b",c', header:false}],
  ['quoted-doubled', {text:'"a""b",c', header:false}],
  ['quoted-empty', {text:'"",x', header:false}],
  ['quoted-lf', {text:'"a\nb",c\nd,e', header:false}],
  ['quoted-crlf', {text:'"a\r\nb",c', header:false}],
  ['quoted-lone-cr', {text:'"a\rb",c', header:false}],
  ['quoted-cr-eof-in', {text:'"a\r', header:false}],
  ['junk-basic', {text:'"a"kg,b', header:false}],
  ['junk-space', {text:'"a" ,b', header:false}],
  ['junk-quote', {text:'"a"x"y,b', header:false}],
  ['junk-eof', {text:'"a"zz', header:false}],
  ['junk-then-nl', {text:'"a"zz\nb', header:false}],
  ['junk-cr', {text:'"a"z\rb', header:false}],
  ['junk-crlf', {text:'"a"z\r\nb', header:false}],
  ['junk-in-header', {text:'"a"zz,b\nc,d', header:true}],
  ['unterm-simple', {text:'"abc', header:false}],
  ['unterm-commas', {text:'"a,b,c', header:false}],
  ['unterm-newline', {text:'"abc\nx,y', header:false}],
  ['unterm-mid-field', {text:'a,"bc\nd,e', header:false}],
  ['unterm-doubled', {text:'"a""', header:false}],
  ['unterm-triple', {text:'"a"""', header:false}],
  ['unterm-quote-only', {text:'"', header:false}],
  ['unterm-quote-comma', {text:'",x', header:false}],
  ['unterm-cr-in-reread', {text:'"a\rb\nc', header:false}],
  ['unterm-in-header', {text:'"ab\nc,d', header:true}],
  ['quote-in-unquoted', {text:'a"b,c', header:false}],
  ['quote-mid-unquoted', {text:'ab"cd",e', header:false}],
  ['short-row', {text:'a,b,c\nx', header:false}],
  ['short-row-h', {text:'a,b,c\nx', header:true}],
  ['long-row', {text:'a\nx,y,z', header:false}],
  ['long-row-h', {text:'a\nx,y,z', header:true}],
  ['first-defines-width', {text:'x\na,b,c', header:false}],
  ['ragged-multi', {text:'a,b\n1\n2,3,4\n5,6', header:false}],
  ['err-order', {text:'h1,h2\n"a"j\rx\n1', header:true}],
  ['multiline-then-err', {text:'"a\nb",c\nd\re,f', header:false}],
  ['multiline-line-num', {text:'"a\nb\nc",d\ne,f', header:false}],
  ['crlf-inside-line-num', {text:'"a\r\nb",c\nd,e', header:false}],
  ['lonecr-inside-line-num', {text:'"a\rb",c\nd,e', header:false}],
  ['spaces-field', {text:'  \n', header:false}],
  ['spaces-only-line', {text:'a\n \nb', header:false}],
  ['quoted-only-line', {text:'""\n', header:false}],
  ['bom-mid', {text:'a\n\uFEFFb', header:false}],
  ['bom-after-first', {text:'x\uFEFFy', header:false}],
  ['eof-no-nl-quoted', {text:'a,"b"', header:false}],
  ['empty-last-field-q', {text:'a,""', header:false}],
  ['junk-empty-check', {text:'"a",b', header:false}],
  ['quote-junk-second-field', {text:'a,"b"!,c', header:false}],
  ['two-junks-one-record', {text:'"a"!,"b"?,c', header:false}],
  ['stray-and-junk', {text:'"a"!\rb', header:false}],
  ['unterm-after-good', {text:'a,b\n"x\ny,z', header:false}],
  ['header-only', {text:'a,b,c', header:true}],
  ['header-only-nl', {text:'a,b,c\n', header:true}],
  ['width1-short', {text:'a\nb,c', header:true}],
  ['cr-inside-quoted-junk-after', {text:'"a\rb"j,c\nd', header:false}],
  ['newline-in-junk-q', {text:'"a"x\n"y', header:false}],
  ['unterm-second-line-start', {text:'a\n"bc', header:false}],
  ['doubled-at-close', {text:'"a""",b', header:false}],
  ['quote-space-field', {text:' "a",b', header:false}],
  ['lf-blank-in-quotes-then-row', {text:'"a\n\nb",c\nx', header:false}],
  ['stray-cr-after-quoted', {text:'"a"\rb', header:false}],
  ['unterm-line-count-after', {text:'"a\nb\nc,d\ne,f', header:false}],
  ['P1-nl-header', {text:'\n', header:true}],
  ['P2-cr-header', {text:'\r', header:true}],
  ['P3-h-then-cr-eof', {text:'a,b\n\r', header:true}],
  ['P4-nh-then-cr-eof', {text:'a\n\r', header:false}],
  ['P5-cr-cr-crlf', {text:'a\n\r\r\nb', header:false}],
  ['P6-scan-crosses-lf', {text:'"abc\ndef",x', header:false}],
  ['P7-junk-only-cr-comma', {text:'"a"\r,b', header:false}],
  ['P8-junk-only-cr-eof', {text:'"a"\r', header:false}],
  ['P9-junk-empty-crlf', {text:'"a"\r\nb', header:false}],
  ['P10-junk-z-cr-comma', {text:'"a"z\r,b', header:false}],
  ['P11-double-bom', {text:'\uFEFF\uFEFFa', header:false}],
  ['P12-stray-line-is-recstart', {text:'"x\ny"\rz,w', header:false}],
  ['P13-unterm-line-recstart', {text:'a,"x\ny', header:false}],
  ['P14-blanks-before-header', {text:'\n\na,b\nc', header:true}],
  ['P15-blanks-short-line', {text:'a,b\n\n\nx', header:true}],
  ['P16-junk-zz-cr-eof', {text:'"a"zz\r', header:false}],
  ['P17-two-quotes', {text:'""', header:false}],
  ['P18-four-quotes', {text:'""""', header:false}],
  ['P19-three-quotes', {text:'"""', header:false}],
  ['P20-crlf-then-stray', {text:'a\r\n\rb', header:false}],
  ['P22-junk-two-cr-comma', {text:'"a"\r\r,b', header:false}],
  ['P24-scan-crosses-comma-lf', {text:'"a,b\nc",d', header:false}],
  ['P25-quote-letter-close', {text:'"a"b",c', header:false}],
  ['P26-close-next-line', {text:'a,"b\nc"', header:false}],
  ['P31-long-extra-quoted', {text:'a\n"x,y",z', header:true}],
  ['P32-short-trailing-comma', {text:'a,b,c\nx,', header:true}],
  ['P33-cr-crlf-in-quotes', {text:'"a\r\r\nb"', header:false}],
  ['P35-unterm-then-records', {text:'"a\nb\nc', header:false}],
  ['P39-cr-first-header', {text:'\ra', header:true}],
  ['P42-emptyq-junk', {text:'""x,y', header:false}],
  ['P43-junk-cr-cr-eof', {text:'"a"z\r\r', header:false}],
  ['P44-stray-cr-before-header-blank', {text:'\r\r\na,b\nc,d', header:true}],
  ['P45-unterm-junk-cr-order', {text:'"a\r\rb', header:false}],
  ['P46-quote-after-comma-space', {text:'a, "b"', header:false}],
  ['P47-cr-in-middle-field2', {text:'a,b\rc\nd,e', header:false}],
  ['P48-only-stray-crs', {text:'\r\r\r', header:false}],
  ['P49-header-blank-then-stray', {text:'\n\rx,y', header:true}],
  ['P50-lf-inside-junk-none', {text:'"a"j\nb', header:false}],
  ['P51-unterm-in-extra', {text:'a\nb,"c', header:true}],
  ['P52-wide-header-short-0fields', {text:'a,b\n\n', header:true}],
  ['P53-quote-junk-crlf-mid', {text:'"a"j\r\nb,c', header:false}],
  ['P54-crlf-blank-stray-mix', {text:'x\r\n\r\ny', header:false}],
];
for (const [label, input] of ADVERSARIAL) check(`adversarial:${label}`, input, oracle(input));

console.log(`${passed} passed, ${failed} failed (${passed + failed} checks)`);
if (failed > 0) process.exit(1);

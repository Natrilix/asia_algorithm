/**
 * Rendering tests: the worksheet display list, the SVG output and the
 * structural integrity of the PDF we write by hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyState } from '../js/classify.js';
import { buildWorksheet, PAGE_SIZES } from '../js/render/worksheet.js';
import { renderSvg } from '../js/render/svg.js';
import { renderPdf } from '../js/render/pdf.js';
import { measureText, wrapText, truncateText } from '../js/render/fonts.js';
import { buildFilename } from '../js/export.js';
import { identifiedState } from './helpers.js';

const CONFIG = { pageSize: 'A4', institutionName: 'Example Health Service', mrnLabel: 'MRN' };

function render(state, config = CONFIG) {
  return buildWorksheet(state, classifyState(state), {
    config,
    generatedAt: new Date('2026-07-26T09:30:00'),
    appVersion: 'test',
  });
}

function textOf(pages) {
  return pages.flatMap((page) => page.ops.filter((op) => op.type === 'text').map((op) => op.value));
}

test('the worksheet fits one page and uses the configured paper size', () => {
  const pages = render(identifiedState());
  assert.equal(pages.length, 1);
  assert.equal(pages[0].width, PAGE_SIZES.A4.width);
  assert.equal(pages[0].height, PAGE_SIZES.A4.height);

  const letter = render(identifiedState(), { ...CONFIG, pageSize: 'Letter' });
  assert.equal(letter[0].width, PAGE_SIZES.Letter.width);
});

test('nothing is drawn outside the page box', () => {
  const pages = render(identifiedState());
  for (const page of pages) {
    for (const op of page.ops) {
      if (op.type === 'rect') {
        assert.ok(op.x >= 0 && op.y >= 0, 'rect starts on the page');
        assert.ok(op.x + op.w <= page.width + 0.01, `rect overflows width: ${op.x + op.w}`);
        assert.ok(op.y + op.h <= page.height + 0.01, `rect overflows height: ${op.y + op.h}`);
      }
      if (op.type === 'text') {
        assert.ok(op.y > 0 && op.y <= page.height, `text baseline off page: ${op.y}`);
      }
    }
  }
});

test('the three points of identification appear on every page', () => {
  const longComment = 'Assessment note. '.repeat(400);
  const pages = render(identifiedState((state) => {
    state.exam.comments = longComment;
  }));
  assert.ok(pages.length > 1, 'a long comment flows onto a second page');

  for (const page of pages) {
    const text = page.ops.filter((op) => op.type === 'text').map((op) => op.value).join('|');
    assert.match(text, /TESTPATIENT, Alex/, 'name present');
    assert.match(text, /10004821/, 'MRN present');
    assert.match(text, /3 Feb 1978/, 'date of birth present');
  }
});

test('the classification and totals reach the page', () => {
  const state = identifiedState((draft) => {
    for (const level of ['L2', 'L3', 'L4', 'L5', 'S1']) {
      draft.values.right.motor[level] = '2';
      draft.values.left.motor[level] = '1';
    }
    draft.voluntaryAnalContraction = 'No';
  });
  const result = classifyState(state);
  const values = textOf(render(state));

  assert.ok(values.includes(result.classification.ASIAImpairmentScale));
  assert.ok(values.includes(result.classification.neurologicalLevelOfInjury));
  assert.ok(values.includes(String(result.totals.lightTouch)));
  assert.ok(values.includes('Voluntary anal contraction (VAC)'));
});

test('an incomplete exam renders a warning instead of a classification', () => {
  const state = identifiedState((draft) => {
    draft.values.right.motor.C5 = '';
  });
  const values = textOf(render(state)).join('|');
  assert.match(values, /Exam incomplete/);
});

test('star footnotes appear only when a star is used', () => {
  const plain = textOf(render(identifiedState())).join('|');
  assert.doesNotMatch(plain, /not due to spinal cord injury/);

  const starred = textOf(render(identifiedState((state) => {
    state.values.left.motor.L4 = '1**';
  }))).join('|');
  assert.match(starred, /NOT considered normal/);
  assert.match(starred, /considered normal for classification/);
});

test('SVG output is self contained', () => {
  const svg = renderSvg(render(identifiedState())[0]);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.doesNotMatch(svg, /<image|xlink:href|@import|url\(http/, 'no external references');
  assert.match(svg, /TESTPATIENT, Alex/);
});

test('SVG escapes text that would otherwise break the markup', () => {
  const svg = renderSvg(render(identifiedState((state) => {
    state.exam.examiner = 'Dr <A> & "B"';
  }))[0]);
  assert.match(svg, /Dr &lt;A&gt; &amp; &quot;B&quot;/);
});

test('the PDF is structurally valid', () => {
  const pdf = renderPdf(render(identifiedState()), { title: 'ISNCSCI worksheet' });
  const text = Buffer.from(pdf).toString('latin1');

  assert.match(text, /^%PDF-1\.4\n/);
  assert.match(text, /%%EOF\n$/);

  // Every xref offset must land exactly on its object header, or readers
  // report a damaged file.
  const startxref = Number(/startxref\s+(\d+)/.exec(text)[1]);
  assert.equal(text.substr(startxref, 4), 'xref');

  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) \d{5} ([nf]) $/gm)];
  assert.ok(entries.length > 1);
  entries.forEach((entry, index) => {
    if (entry[2] === 'f') {
      return;
    }
    const header = `${index} 0 obj`;
    assert.equal(
      text.substr(Number(entry[1]), header.length),
      header,
      `xref entry ${index} points at its object`,
    );
  });

  // Stream lengths must match the bytes actually written.
  for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    assert.equal(
      text.substr(start + Number(match[1]), 10),
      '\nendstream',
      'declared stream length matches the content',
    );
  }
});

test('PDF text is real text, with reserved characters escaped', () => {
  const pdf = renderPdf(render(identifiedState((state) => {
    state.exam.examiner = 'Dr (A) \\ B';
  })), {});
  const text = Buffer.from(pdf).toString('latin1');

  assert.ok(text.includes('(TESTPATIENT, Alex) Tj'), 'names are drawn as text, not paths');
  assert.ok(text.includes('Dr \\(A\\) \\\\ B'), 'parentheses and backslashes are escaped');
  assert.ok(text.includes('/BaseFont /Helvetica'), 'uses a base-14 font, nothing embedded');
});

test('PDF maps characters outside WinAnsi rather than emitting raw bytes', () => {
  const pdf = renderPdf(render(identifiedState((state) => {
    state.exam.examiner = 'Dr A — B ☃';
  })), {});
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.includes('\\227'), 'em dash becomes its WinAnsi octal escape');
  assert.ok(text.includes('?'), 'an unmappable glyph degrades to a question mark');
});

test('font metrics measure, wrap and truncate consistently', () => {
  assert.ok(measureText('iii', 10) < measureText('WWW', 10), 'widths are per glyph');
  assert.equal(measureText('', 10), 0);
  assert.ok(measureText('Hello', 10, true) > measureText('Hello', 10), 'bold is wider');

  const lines = wrapText('one two three four five six seven', 40, 7);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(measureText(line, 7) <= 40.01, `"${line}" fits the column`);
  }

  const longWord = wrapText('supercalifragilisticexpialidocious', 20, 7);
  for (const line of longWord) {
    assert.ok(measureText(line, 7) <= 20.01, 'an unbreakable word is hard-broken');
  }

  const short = truncateText('a very long label indeed', 30, 7);
  assert.ok(measureText(short, 7) <= 30.01);
  assert.match(short, /\.\.\.$/);
});

test('filenames identify the exam and stay filesystem safe', () => {
  const name = buildFilename(identifiedState((state) => {
    state.patient.familyName = 'O\'Brien / Smith';
  }), 'pdf');
  assert.match(name, /^ISNCSCI-/);
  assert.match(name, /10004821/);
  assert.match(name, /2026-07-26\.pdf$/);
  assert.doesNotMatch(name, /[/\\:*?"<>|']/);
});

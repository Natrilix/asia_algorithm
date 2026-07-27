/**
 * Adobe standard font metrics for Helvetica and Helvetica-Bold.
 *
 * These are the two base-14 fonts every PDF reader provides, so the exported
 * form needs no embedded font programme and the whole exporter stays
 * dependency free. Widths are in 1/1000 em for WinAnsi code points 32..126;
 * anything outside that range falls back to the width of a space.
 */

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const FIRST_CODE = 32;

export const FONT_REGULAR = 'Helvetica';
export const FONT_BOLD = 'Helvetica-Bold';

function widthTable(bold) {
  return bold ? HELVETICA_BOLD : HELVETICA;
}

/** Width of `text` in points at `size`, for the regular or bold face. */
export function measureText(text, size, bold = false) {
  const table = widthTable(bold);
  let total = 0;
  const string = String(text ?? '');
  for (let i = 0; i < string.length; i += 1) {
    const code = string.charCodeAt(i);
    const index = code - FIRST_CODE;
    total += index >= 0 && index < table.length ? table[index] : table[0];
  }
  return (total * size) / 1000;
}

/** Truncates with an ellipsis so the result fits within `maxWidth`. */
export function truncateText(text, maxWidth, size, bold = false) {
  const string = String(text ?? '');
  if (measureText(string, size, bold) <= maxWidth) {
    return string;
  }
  const ellipsis = '...';
  let result = string;
  while (result.length > 0 && measureText(result + ellipsis, size, bold) > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + ellipsis;
}

/** Greedy word wrap. Long words are hard-broken so a line never overflows. */
export function wrapText(text, maxWidth, size, bold = false) {
  const lines = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (measureText(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') {
        lines.push(line);
      }
      line = word;
      while (measureText(line, size, bold) > maxWidth && line.length > 1) {
        let head = line;
        while (head.length > 1 && measureText(head, size, bold) > maxWidth) {
          head = head.slice(0, -1);
        }
        lines.push(head);
        line = line.slice(head.length);
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Display list -> PDF, with no third-party dependency.
 *
 * The exported form is real vector content: lines and rules are drawn as PDF
 * paths and every label is selectable, searchable text set in the base-14
 * Helvetica faces. That keeps the file small (tens of kilobytes), keeps the
 * medical record legible at any zoom, and avoids shipping a rasteriser.
 */

import { measureText } from './fonts.js';

const WIN_ANSI_REPLACEMENTS = new Map([
  [0x2013, 0x96], [0x2014, 0x97], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x2122, 0x99], [0x20ac, 0x80],
]);

function toWinAnsi(text) {
  let out = '';
  for (const character of String(text)) {
    const code = character.codePointAt(0);
    if (code <= 0xff) {
      out += String.fromCharCode(code);
    } else if (WIN_ANSI_REPLACEMENTS.has(code)) {
      out += String.fromCharCode(WIN_ANSI_REPLACEMENTS.get(code));
    } else {
      out += '?';
    }
  }
  return out;
}

function escapePdfString(text) {
  let out = '';
  for (const character of toWinAnsi(text)) {
    const code = character.charCodeAt(0);
    if (character === '(' || character === ')' || character === '\\') {
      out += `\\${character}`;
    } else if (code < 32 || code > 126) {
      out += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      out += character;
    }
  }
  return out;
}

function hexToRgb(color) {
  const normalised = String(color ?? '#000000').trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(normalised);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normalised);
  if (long) {
    return [parseInt(long[1], 16) / 255, parseInt(long[2], 16) / 255, parseInt(long[3], 16) / 255];
  }
  if (short) {
    return [
      parseInt(short[1] + short[1], 16) / 255,
      parseInt(short[2] + short[2], 16) / 255,
      parseInt(short[3] + short[3], 16) / 255,
    ];
  }
  return [0, 0, 0];
}

function n(value) {
  return (Math.round(value * 1000) / 1000).toString();
}

/** Serialises one display list into a PDF content stream. */
function contentStream(drawing) {
  const height = drawing.height;
  const parts = [];
  let currentFill = null;
  let currentStroke = null;
  let currentLineWidth = null;

  const setFill = (color) => {
    const key = String(color);
    if (currentFill !== key) {
      const [r, g, b] = hexToRgb(color);
      parts.push(`${n(r)} ${n(g)} ${n(b)} rg`);
      currentFill = key;
    }
  };
  const setStroke = (color) => {
    const key = String(color);
    if (currentStroke !== key) {
      const [r, g, b] = hexToRgb(color);
      parts.push(`${n(r)} ${n(g)} ${n(b)} RG`);
      currentStroke = key;
    }
  };
  const setLineWidth = (width) => {
    if (currentLineWidth !== width) {
      parts.push(`${n(width)} w`);
      currentLineWidth = width;
    }
  };

  for (const op of drawing.ops) {
    if (op.type === 'rect') {
      const hasFill = op.fill && op.fill !== 'none';
      const hasStroke = op.stroke && op.stroke !== 'none';
      if (!hasFill && !hasStroke) {
        continue;
      }
      if (hasFill) {
        setFill(op.fill);
      }
      if (hasStroke) {
        setStroke(op.stroke);
        setLineWidth(op.lineWidth);
      }
      parts.push(`${n(op.x)} ${n(height - op.y - op.h)} ${n(op.w)} ${n(op.h)} re`);
      parts.push(hasFill && hasStroke ? 'B' : (hasFill ? 'f' : 'S'));
    } else if (op.type === 'line') {
      setStroke(op.stroke);
      setLineWidth(op.lineWidth);
      parts.push(`${n(op.x1)} ${n(height - op.y1)} m ${n(op.x2)} ${n(height - op.y2)} l S`);
    } else if (op.type === 'text') {
      setFill(op.color);
      const width = measureText(op.value, op.size, op.bold)
        + (op.letterSpacing ? op.letterSpacing * Math.max(0, op.value.length - 1) : 0);
      let x = op.x;
      if (op.align === 'center') {
        x -= width / 2;
      } else if (op.align === 'right') {
        x -= width;
      }
      parts.push('BT');
      parts.push(`/${op.bold ? 'F2' : 'F1'} ${n(op.size)} Tf`);
      if (op.letterSpacing) {
        parts.push(`${n(op.letterSpacing)} Tc`);
      }
      parts.push(`1 0 0 1 ${n(x)} ${n(height - op.y)} Tm`);
      parts.push(`(${escapePdfString(op.value)}) Tj`);
      if (op.letterSpacing) {
        parts.push('0 Tc');
      }
      parts.push('ET');
    }
  }

  return parts.join('\n');
}

function pdfDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    + `${sign}${pad(Math.floor(absolute / 60))}'${pad(absolute % 60)}'`;
}

/**
 * Builds a PDF from one or more display lists (one per page).
 * @param {Drawing[]} drawings
 * @param {{title?: string, author?: string, subject?: string, keywords?: string,
 *          producer?: string, creationDate?: Date}} [metadata]
 * @returns {Uint8Array}
 */
export function renderPdf(drawings, metadata = {}) {
  const pages = Array.isArray(drawings) ? drawings : [drawings];
  if (pages.length === 0) {
    throw new Error('A PDF needs at least one page.');
  }

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length; // 1-based object number
  };

  // Reserve 1 = catalog, 2 = page tree; they reference objects created below.
  addObject('');
  addObject('');
  const fontRegular = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageIds = [];
  for (const drawing of pages) {
    const stream = contentStream(drawing);
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      '<< /Type /Page /Parent 2 0 R '
      + `/MediaBox [0 0 ${n(drawing.width)} ${n(drawing.height)}] `
      + `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> `
      + `/Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const created = metadata.creationDate ?? new Date();
  const infoEntries = [
    metadata.title ? `/Title (${escapePdfString(metadata.title)})` : null,
    metadata.author ? `/Author (${escapePdfString(metadata.author)})` : null,
    metadata.subject ? `/Subject (${escapePdfString(metadata.subject)})` : null,
    metadata.keywords ? `/Keywords (${escapePdfString(metadata.keywords)})` : null,
    `/Producer (${escapePdfString(metadata.producer ?? 'ISNCSCI worksheet')})`,
    `/CreationDate (${pdfDate(created)})`,
    `/ModDate (${pdfDate(created)})`,
  ].filter(Boolean);
  const infoId = addObject(`<< ${infoEntries.join(' ')} >>`);

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

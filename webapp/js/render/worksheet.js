/**
 * The printable ISNCSCI worksheet.
 *
 * Produces one `Drawing` per page from the exam state and its classification.
 * The same display list drives the on-screen preview, the PNG export and the
 * PDF export, so what the clinician checks is exactly what gets filed.
 *
 * The layout is our own: it carries the same fields as the ASIA worksheet but
 * is not a reproduction of ASIA's copyrighted form artwork.
 */

import { Drawing, box } from './drawing.js';
import { wrapText } from './fonts.js';
import {
  SENSORY_LEVELS,
  MOTOR_LEVELS,
  KEY_MUSCLE_NAMES,
  LEVEL_LABELS,
} from '../isncsci-data.js';
import { hasStars } from '../model.js';
import { formatDate, formatTime, formatDateTime, formatPatientName } from '../format.js';

export const PAGE_SIZES = {
  A4: { width: 841.89, height: 595.28 },
  Letter: { width: 792, height: 612 },
};

const INK = '#111111';
const RULE = '#555555';
const HAIRLINE = '#b0b0b0';
const LABEL = '#4a4a4a';
const SHADE = '#ededed';
const HEAD_SHADE = '#dcdcdc';
const BLOCKED = '#f4f4f4';
const MUTED = '#777777';

const MARGIN = 20;
const TITLE_HEIGHT = 15;
const ID_ROW_HEIGHT = 27;
const ID_BAND_HEIGHT = ID_ROW_HEIGHT * 2;
const FOOTER_HEIGHT = 12;

const GRID_COLUMNS = [
  { key: 'rMotor', width: 38 },
  { key: 'rLightTouch', width: 30 },
  { key: 'rPinPrick', width: 30 },
  { key: 'centre', width: 132 },
  { key: 'lLightTouch', width: 30 },
  { key: 'lPinPrick', width: 30 },
  { key: 'lMotor', width: 38 },
];
const GRID_WIDTH = GRID_COLUMNS.reduce((total, column) => total + column.width, 0);
const PANEL_GAP = 12;

const HEADER_TIER_1 = 13;
const HEADER_TIER_2 = 20;
const TOTALS_ROW_HEIGHT = 13;
const BAND_HEIGHT = 16;

/**
 * @param {object} state worksheet state (see js/model.js)
 * @param {object} result output of `classifyState`
 * @param {{config: object, generatedAt?: Date, appVersion?: string}} options
 * @returns {Drawing[]} one drawing per page
 */
export function buildWorksheet(state, result, options = {}) {
  const config = options.config ?? {};
  const size = PAGE_SIZES[config.pageSize] ?? PAGE_SIZES.A4;
  const generatedAt = options.generatedAt ?? new Date();

  const context = {
    state,
    result,
    config,
    generatedAt,
    appVersion: options.appVersion ?? '',
    size,
  };

  const page = new Drawing(size.width, size.height);
  const bodyTop = drawPageFurniture(page, context, 1);
  const bodyBottom = size.height - MARGIN - FOOTER_HEIGHT;

  drawGrid(page, context, MARGIN, bodyTop, bodyBottom);

  const panelX = MARGIN + GRID_WIDTH + PANEL_GAP;
  const panelWidth = size.width - MARGIN - panelX;
  const overflow = drawPanel(page, context, panelX, bodyTop, panelWidth, bodyBottom);

  const pages = [page];
  if (overflow) {
    const second = new Drawing(size.width, size.height);
    const secondTop = drawPageFurniture(second, context, 2);
    drawContinuationPage(second, context, MARGIN, secondTop, size.width - MARGIN * 2, bodyBottom, overflow);
    pages.push(second);
  }

  pages.forEach((drawing, index) => {
    drawFooter(drawing, context, index + 1, pages.length);
  });

  return pages;
}

/* ------------------------------------------------------------------ */
/* Page furniture: title strip and the patient identification band.   */
/* The band is repeated on every page so no sheet can be filed         */
/* without the three points of identification.                         */
/* ------------------------------------------------------------------ */

function drawPageFurniture(drawing, context, pageNumber) {
  const { config, state, size } = context;
  const width = size.width - MARGIN * 2;

  const titleBox = box(MARGIN, MARGIN, width, TITLE_HEIGHT);
  drawing.rect(titleBox.x, titleBox.y, titleBox.w, titleBox.h, { fill: HEAD_SHADE, stroke: RULE, lineWidth: 0.7 });
  drawing.textInBox(
    config.institutionName || 'ISNCSCI worksheet',
    box(titleBox.x + 4, titleBox.y, titleBox.w * 0.45, titleBox.h),
    { align: 'left', size: 8.5, bold: true, padding: 0 },
  );
  drawing.textInBox(
    'International Standards for Neurological Classification of Spinal Cord Injury',
    box(titleBox.x, titleBox.y, titleBox.w - 6, titleBox.h),
    { align: 'right', size: 7.5, padding: 0, color: LABEL },
  );

  const bandTop = MARGIN + TITLE_HEIGHT;
  const patient = state.patient;
  const exam = state.exam;

  const rowOne = [
    { label: 'FAMILY NAME, GIVEN NAME(S)', value: formatPatientName(patient), weight: 0.34, emphasis: true },
    { label: config.mrnLabel || 'MRN', value: patient.mrn, weight: 0.2, emphasis: true },
    { label: 'DATE OF BIRTH', value: formatDate(patient.dateOfBirth), weight: 0.2, emphasis: true },
    { label: 'SEX', value: patient.sex, weight: 0.1 },
    { label: 'WARD / UNIT', value: patient.ward, weight: 0.16 },
  ];
  const rowTwo = [
    { label: 'ENCOUNTER / ADMISSION', value: patient.encounter, weight: 0.2 },
    { label: 'DATE OF EXAMINATION', value: formatDate(exam.examDate), weight: 0.2 },
    { label: 'TIME', value: formatTime(exam.examTime), weight: 0.1 },
    { label: 'EXAMINER', value: exam.examiner, weight: 0.3 },
    { label: 'ROLE / DESIGNATION', value: exam.examinerRole, weight: 0.2 },
  ];

  drawFieldRow(drawing, rowOne, MARGIN, bandTop, width, ID_ROW_HEIGHT);
  drawFieldRow(drawing, rowTwo, MARGIN, bandTop + ID_ROW_HEIGHT, width, ID_ROW_HEIGHT);

  if (pageNumber > 1) {
    drawing.textInBox('continued', box(MARGIN, bandTop + ID_BAND_HEIGHT, width, 10), {
      align: 'right', size: 6.5, color: MUTED, padding: 0,
    });
  }

  return bandTop + ID_BAND_HEIGHT + 6;
}

function drawFieldRow(drawing, fields, x, y, width, height) {
  let cursor = x;
  fields.forEach((field, index) => {
    const isLast = index === fields.length - 1;
    const fieldWidth = isLast ? x + width - cursor : Math.round(width * field.weight);
    drawField(drawing, box(cursor, y, fieldWidth, height), field.label, field.value, field.emphasis);
    cursor += fieldWidth;
  });
}

function drawField(drawing, area, label, value, emphasis = false) {
  drawing.rect(area.x, area.y, area.w, area.h, { stroke: RULE, lineWidth: 0.6, fill: '#ffffff' });
  drawing.text(label, area.x + 3, area.y + 7.5, { size: 5.2, color: LABEL, letterSpacing: 0.2 });
  drawing.textInBox(
    value || '',
    box(area.x, area.y + 8, area.w, area.h - 8),
    { align: 'left', padding: 3, size: emphasis ? 9.5 : 8, bold: emphasis },
  );
}

/* ------------------------------------------------------------------ */
/* The dermatome / myotome grid.                                       */
/* ------------------------------------------------------------------ */

function columnPositions(x) {
  const positions = {};
  let cursor = x;
  for (const column of GRID_COLUMNS) {
    positions[column.key] = { x: cursor, width: column.width };
    cursor += column.width;
  }
  return positions;
}

function drawGrid(drawing, context, x, top, bottom) {
  const { state } = context;
  const columns = columnPositions(x);

  const fixedHeight = HEADER_TIER_1 + HEADER_TIER_2 + TOTALS_ROW_HEIGHT * 2 + BAND_HEIGHT * 2;
  const rowHeight = (bottom - top - fixedHeight) / SENSORY_LEVELS.length;

  drawGridHeader(drawing, columns, x, top);

  const rowsTop = top + HEADER_TIER_1 + HEADER_TIER_2;
  SENSORY_LEVELS.forEach((level, index) => {
    drawGridRow(drawing, state, columns, level, rowsTop + index * rowHeight, rowHeight);
  });

  const totalsTop = rowsTop + SENSORY_LEVELS.length * rowHeight;
  drawGridTotals(drawing, context, columns, totalsTop);

  const bandsTop = totalsTop + TOTALS_ROW_HEIGHT * 2;
  drawAnalBand(drawing, state, x, bandsTop, GRID_WIDTH);
  drawNonKeyMuscleBand(drawing, state, x, bandsTop + BAND_HEIGHT, GRID_WIDTH);

  // Outer border last so it sits crisply over the cell edges.
  drawing.rect(x, top, GRID_WIDTH, bottom - top, { stroke: INK, lineWidth: 1 });
}

function drawGridHeader(drawing, columns, x, top) {
  const rightSpan = columns.rMotor.width + columns.rLightTouch.width + columns.rPinPrick.width;
  const leftSpan = columns.lLightTouch.width + columns.lPinPrick.width + columns.lMotor.width;

  const tier1 = box(x, top, GRID_WIDTH, HEADER_TIER_1);
  drawing.rect(tier1.x, tier1.y, tier1.w, tier1.h, { fill: HEAD_SHADE, stroke: RULE });
  drawing.textInBox('RIGHT', box(x, top, rightSpan, HEADER_TIER_1), { size: 8, bold: true, letterSpacing: 1 });
  drawing.textInBox('LEFT', box(columns.lLightTouch.x, top, leftSpan, HEADER_TIER_1), {
    size: 8, bold: true, letterSpacing: 1,
  });
  drawing.line(columns.centre.x, top, columns.centre.x, top + HEADER_TIER_1, { stroke: RULE });
  drawing.line(columns.lLightTouch.x, top, columns.lLightTouch.x, top + HEADER_TIER_1, { stroke: RULE });

  const tier2Top = top + HEADER_TIER_1;
  const captions = [
    { key: 'rMotor', lines: ['MOTOR', 'key muscles'] },
    { key: 'rLightTouch', lines: ['LIGHT', 'TOUCH'] },
    { key: 'rPinPrick', lines: ['PIN', 'PRICK'] },
    { key: 'centre', lines: ['LEVEL', 'key muscle function'] },
    { key: 'lLightTouch', lines: ['LIGHT', 'TOUCH'] },
    { key: 'lPinPrick', lines: ['PIN', 'PRICK'] },
    { key: 'lMotor', lines: ['MOTOR', 'key muscles'] },
  ];
  for (const caption of captions) {
    const column = columns[caption.key];
    drawing.rect(column.x, tier2Top, column.width, HEADER_TIER_2, { fill: SHADE, stroke: RULE });
    drawing.textInBox(caption.lines[0], box(column.x, tier2Top + 1, column.width, HEADER_TIER_2 / 2), {
      size: 6.2, bold: true,
    });
    drawing.textInBox(caption.lines[1], box(column.x, tier2Top + HEADER_TIER_2 / 2 - 1, column.width, HEADER_TIER_2 / 2), {
      size: 5.4, color: LABEL,
    });
  }
}

function drawGridRow(drawing, state, columns, level, y, height) {
  const hasMotor = MOTOR_LEVELS.includes(level);
  const cells = [
    { key: 'rMotor', side: 'right', kind: 'motor', enabled: hasMotor },
    { key: 'rLightTouch', side: 'right', kind: 'lightTouch', enabled: true },
    { key: 'rPinPrick', side: 'right', kind: 'pinPrick', enabled: true },
    { key: 'lLightTouch', side: 'left', kind: 'lightTouch', enabled: true },
    { key: 'lPinPrick', side: 'left', kind: 'pinPrick', enabled: true },
    { key: 'lMotor', side: 'left', kind: 'motor', enabled: hasMotor },
  ];

  for (const cell of cells) {
    const column = columns[cell.key];
    drawing.rect(column.x, y, column.width, height, {
      stroke: HAIRLINE,
      fill: cell.enabled ? '#ffffff' : BLOCKED,
      lineWidth: 0.4,
    });
    if (!cell.enabled) {
      continue;
    }
    const value = state.values[cell.side][cell.kind][level] ?? '';
    drawing.textInBox(value, box(column.x, y, column.width, height), { size: 8, bold: true });
  }

  const centre = columns.centre;
  drawing.rect(centre.x, y, centre.width, height, { stroke: HAIRLINE, fill: SHADE, lineWidth: 0.4 });
  drawing.textInBox(LEVEL_LABELS[level], box(centre.x, y, 26, height), { size: 7, bold: true });
  if (hasMotor) {
    drawing.textInBox(
      KEY_MUSCLE_NAMES[level],
      box(centre.x + 26, y, centre.width - 28, height),
      { align: 'left', size: 5.8, color: LABEL, padding: 2 },
    );
  }
}

function drawGridTotals(drawing, context, columns, top) {
  const totals = context.result.totals;
  const value = (input) => (input === null || input === undefined || input === '' ? '' : String(input));

  const rows = [
    {
      label: 'SUBTOTALS — UEMS / LT / PP',
      right: {
        motor: value(totals.right.upperExtremity),
        lightTouch: value(totals.right.lightTouch),
        pinPrick: value(totals.right.pinPrick),
      },
      left: {
        motor: value(totals.left.upperExtremity),
        lightTouch: value(totals.left.lightTouch),
        pinPrick: value(totals.left.pinPrick),
      },
      note: 'max 25 / 56 / 56 each side',
    },
    {
      label: 'SUBTOTALS — LEMS',
      right: { motor: value(totals.right.lowerExtremity), lightTouch: null, pinPrick: null },
      left: { motor: value(totals.left.lowerExtremity), lightTouch: null, pinPrick: null },
      note: 'max 25 each side',
    },
  ];

  rows.forEach((row, index) => {
    const y = top + index * TOTALS_ROW_HEIGHT;
    const cells = [
      { key: 'rMotor', text: row.right.motor },
      { key: 'rLightTouch', text: row.right.lightTouch },
      { key: 'rPinPrick', text: row.right.pinPrick },
      { key: 'lLightTouch', text: row.left.lightTouch },
      { key: 'lPinPrick', text: row.left.pinPrick },
      { key: 'lMotor', text: row.left.motor },
    ];
    for (const cell of cells) {
      const column = columns[cell.key];
      const blocked = cell.text === null;
      drawing.rect(column.x, y, column.width, TOTALS_ROW_HEIGHT, {
        stroke: RULE,
        fill: blocked ? BLOCKED : SHADE,
        lineWidth: 0.5,
      });
      if (!blocked) {
        drawing.textInBox(cell.text, box(column.x, y, column.width, TOTALS_ROW_HEIGHT), { size: 8, bold: true });
      }
    }
    const centre = columns.centre;
    drawing.rect(centre.x, y, centre.width, TOTALS_ROW_HEIGHT, { stroke: RULE, fill: SHADE, lineWidth: 0.5 });
    drawing.textInBox(row.label, box(centre.x, y, centre.width, TOTALS_ROW_HEIGHT), {
      align: 'left', size: 5.4, bold: true, padding: 3,
    });
  });
}

function drawAnalBand(drawing, state, x, y, width) {
  drawing.rect(x, y, width, BAND_HEIGHT, { stroke: RULE, fill: '#ffffff', lineWidth: 0.6 });
  const half = width / 2;
  drawing.line(x + half, y, x + half, y + BAND_HEIGHT, { stroke: RULE, lineWidth: 0.5 });
  drawInlineValue(drawing, box(x, y, half, BAND_HEIGHT), 'Voluntary anal contraction (VAC)', state.voluntaryAnalContraction);
  drawInlineValue(drawing, box(x + half, y, half, BAND_HEIGHT), 'Deep anal pressure (DAP)', state.deepAnalPressure);
}

function drawNonKeyMuscleBand(drawing, state, x, y, width) {
  drawing.rect(x, y, width, BAND_HEIGHT, { stroke: RULE, fill: '#ffffff', lineWidth: 0.6 });
  drawing.textInBox(
    'Lowest non-key muscle with motor function',
    box(x, y, width * 0.56, BAND_HEIGHT),
    { align: 'left', size: 5.8, color: LABEL, padding: 4 },
  );
  const rightBox = box(x + width * 0.56, y, width * 0.22, BAND_HEIGHT);
  const leftBox = box(x + width * 0.78, y, width * 0.22, BAND_HEIGHT);
  drawInlineValue(drawing, rightBox, 'R', state.values.right.lowestNonKeyMuscleWithMotorFunction || '—', 6.5);
  drawInlineValue(drawing, leftBox, 'L', state.values.left.lowestNonKeyMuscleWithMotorFunction || '—', 6.5);
}

function drawInlineValue(drawing, area, label, value, labelSize = 5.8) {
  drawing.textInBox(label, box(area.x, area.y, area.w * 0.62, area.h), {
    align: 'left', size: labelSize, color: LABEL, padding: 4,
  });
  drawing.textInBox(value || '', box(area.x + area.w * 0.62, area.y, area.w * 0.38, area.h), {
    align: 'left', size: 8, bold: true, padding: 2,
  });
}

/* ------------------------------------------------------------------ */
/* Right-hand classification panel.                                    */
/* ------------------------------------------------------------------ */

function drawPanel(drawing, context, x, top, width, bottom) {
  const { result, state } = context;
  const classification = result.classification;
  let y = top;

  if (!classification) {
    const height = 22;
    drawing.rect(x, y, width, height, { stroke: INK, fill: SHADE, lineWidth: 0.8 });
    drawing.textInBox(
      result.error
        ? `Not classified: ${result.error}`
        : 'Exam incomplete — classification not calculated.',
      box(x, y, width, height),
      { align: 'left', size: 7.5, bold: true, padding: 6 },
    );
    y += height + 6;
  }

  y = drawSection(drawing, x, y, width, 'NEUROLOGICAL LEVELS', 40, (area) => {
    const cellWidth = area.w / 4;
    const entries = [
      ['SENSORY R', classification?.neurologicalLevels.sensoryRight ?? ''],
      ['SENSORY L', classification?.neurologicalLevels.sensoryLeft ?? ''],
      ['MOTOR R', classification?.neurologicalLevels.motorRight ?? ''],
      ['MOTOR L', classification?.neurologicalLevels.motorLeft ?? ''],
    ];
    entries.forEach(([label, value], index) => {
      drawValueCell(drawing, box(area.x + index * cellWidth, area.y, cellWidth, area.h), label, value);
    });
  });

  y = drawSection(drawing, x, y, width, 'CLASSIFICATION', 46, (area) => {
    const widths = [area.w * 0.34, area.w * 0.33, area.w * 0.33];
    const entries = [
      ['NEUROLOGICAL LEVEL OF INJURY (NLI)', classification?.neurologicalLevelOfInjury ?? ''],
      ['COMPLETE / INCOMPLETE', formatInjuryComplete(classification?.injuryComplete)],
      ['ASIA IMPAIRMENT SCALE (AIS)', classification?.ASIAImpairmentScale ?? ''],
    ];
    let cursor = area.x;
    entries.forEach(([label, value], index) => {
      drawValueCell(drawing, box(cursor, area.y, widths[index], area.h), label, value, { size: 15 });
      cursor += widths[index];
    });
  });

  y = drawSection(drawing, x, y, width, 'ZONE OF PARTIAL PRESERVATION', 40, (area) => {
    const cellWidth = area.w / 4;
    const entries = [
      ['SENSORY R', classification?.zoneOfPartialPreservations.sensoryRight ?? ''],
      ['SENSORY L', classification?.zoneOfPartialPreservations.sensoryLeft ?? ''],
      ['MOTOR R', classification?.zoneOfPartialPreservations.motorRight ?? ''],
      ['MOTOR L', classification?.zoneOfPartialPreservations.motorLeft ?? ''],
    ];
    entries.forEach(([label, value], index) => {
      drawValueCell(drawing, box(area.x + index * cellWidth, area.y, cellWidth, area.h), label, value);
    });
  });

  y = drawSection(drawing, x, y, width, 'TOTALS', 58, (area) => {
    drawTotalsTable(drawing, context, area);
  });

  const footnoteHeight = hasStars(state) ? 26 : 0;
  const commentsHeight = Math.max(40, bottom - y - footnoteHeight - (footnoteHeight ? 6 : 0));
  const overflow = drawComments(drawing, x, y, width, commentsHeight, state.exam.comments);
  y += commentsHeight + 6;

  if (footnoteHeight) {
    drawFootnotes(drawing, x, bottom - footnoteHeight, width, footnoteHeight);
  }

  return overflow;
}

function drawSection(drawing, x, y, width, title, height, body) {
  const titleHeight = 11;
  drawing.rect(x, y, width, titleHeight, { fill: HEAD_SHADE, stroke: RULE, lineWidth: 0.6 });
  drawing.textInBox(title, box(x, y, width, titleHeight), {
    align: 'left', size: 6.2, bold: true, padding: 4, letterSpacing: 0.4,
  });
  body(box(x, y + titleHeight, width, height));
  drawing.rect(x, y, width, titleHeight + height, { stroke: RULE, lineWidth: 0.7 });
  return y + titleHeight + height + 6;
}

function drawValueCell(drawing, area, label, value, options = {}) {
  drawing.rect(area.x, area.y, area.w, area.h, { stroke: HAIRLINE, fill: '#ffffff', lineWidth: 0.5 });
  drawing.textInBox(label, box(area.x, area.y + 2, area.w, 8), { size: 5.2, color: LABEL, padding: 3 });
  drawing.textInBox(value ?? '', box(area.x, area.y + 8, area.w, area.h - 10), {
    size: options.size ?? 12,
    bold: true,
  });
}

function formatInjuryComplete(value) {
  if (!value) {
    return value === '' ? '' : null;
  }
  // The algorithm returns 'C', 'I', or a comma separated pair when both remain
  // possible; expand it so the reader does not have to know the shorthand.
  const expanded = value
    .split(',')
    .map((part) => {
      const starred = part.includes('*');
      const base = part.replace(/\*/g, '');
      const word = base === 'C' ? 'Complete' : 'Incomplete';
      return starred ? `${word}*` : word;
    })
    .join(' / ');
  return expanded;
}

function drawTotalsTable(drawing, context, area) {
  const totals = context.result.totals;
  const value = (input) => (input === null || input === undefined ? '' : String(input));
  const labelWidth = area.w * 0.34;
  const cellWidth = (area.w - labelWidth) / 3;
  const headerHeight = 11;
  const rowHeight = (area.h - headerHeight) / 4;

  const headers = ['RIGHT', 'LEFT', 'TOTAL'];
  headers.forEach((header, index) => {
    const cell = box(area.x + labelWidth + index * cellWidth, area.y, cellWidth, headerHeight);
    drawing.rect(cell.x, cell.y, cell.w, cell.h, { fill: SHADE, stroke: HAIRLINE, lineWidth: 0.5 });
    drawing.textInBox(header, cell, { size: 5.6, bold: true, color: LABEL });
  });
  drawing.rect(area.x, area.y, labelWidth, headerHeight, { fill: SHADE, stroke: HAIRLINE, lineWidth: 0.5 });

  const rows = [
    ['UPPER EXTREMITY MOTOR (max 50)', totals.right.upperExtremity, totals.left.upperExtremity, totals.upperExtremity],
    ['LOWER EXTREMITY MOTOR (max 50)', totals.right.lowerExtremity, totals.left.lowerExtremity, totals.lowerExtremity],
    ['LIGHT TOUCH (max 112)', totals.right.lightTouch, totals.left.lightTouch, totals.lightTouch],
    ['PIN PRICK (max 112)', totals.right.pinPrick, totals.left.pinPrick, totals.pinPrick],
  ];

  rows.forEach((row, index) => {
    const y = area.y + headerHeight + index * rowHeight;
    drawing.rect(area.x, y, labelWidth, rowHeight, { stroke: HAIRLINE, fill: '#ffffff', lineWidth: 0.5 });
    drawing.textInBox(row[0], box(area.x, y, labelWidth, rowHeight), {
      align: 'left', size: 5.6, padding: 4, color: LABEL,
    });
    for (let column = 0; column < 3; column += 1) {
      const cell = box(area.x + labelWidth + column * cellWidth, y, cellWidth, rowHeight);
      drawing.rect(cell.x, cell.y, cell.w, cell.h, {
        stroke: HAIRLINE,
        fill: column === 2 ? SHADE : '#ffffff',
        lineWidth: 0.5,
      });
      drawing.textInBox(value(row[column + 1]), cell, { size: 8, bold: column === 2 });
    }
  });
}

/** Returns any comment text that did not fit, so it can flow to page 2. */
function drawComments(drawing, x, y, width, height, comments) {
  const titleHeight = 11;
  drawing.rect(x, y, width, titleHeight, { fill: HEAD_SHADE, stroke: RULE, lineWidth: 0.6 });
  drawing.textInBox('COMMENTS / NON-SCI FINDINGS', box(x, y, width, titleHeight), {
    align: 'left', size: 6.2, bold: true, padding: 4, letterSpacing: 0.4,
  });
  drawing.rect(x, y, width, height + titleHeight, { stroke: RULE, lineWidth: 0.7 });

  const text = String(comments ?? '').trim();
  if (!text) {
    return null;
  }
  const size = 7;
  const lineHeight = size * 1.35;
  const available = Math.max(0, height - 8);
  const maxLines = Math.floor(available / lineHeight);
  const lines = wrapText(text, width - 12, size);
  const shown = lines.slice(0, Math.max(0, maxLines));

  let cursor = y + titleHeight + 4 + size;
  for (const line of shown) {
    drawing.text(line, x + 6, cursor, { size });
    cursor += lineHeight;
  }

  if (lines.length > shown.length) {
    drawing.textInBox('continued on page 2', box(x, y + titleHeight + height - 10, width - 6, 10), {
      align: 'right', size: 5.8, color: MUTED, padding: 0,
    });
    return lines.slice(shown.length).join('\n');
  }
  return null;
}

function drawFootnotes(drawing, x, y, width, height) {
  drawing.rect(x, y, width, height, { stroke: HAIRLINE, fill: SHADE, lineWidth: 0.5 });
  drawing.text(
    '*  impairment not due to spinal cord injury, NOT considered normal for classification.',
    x + 5, y + 10, { size: 5.8, color: INK },
  );
  drawing.text(
    '**  impairment not due to spinal cord injury, considered normal for classification.',
    x + 5, y + 19, { size: 5.8, color: INK },
  );
}

/* ------------------------------------------------------------------ */
/* Continuation page for long comments.                                */
/* ------------------------------------------------------------------ */

function drawContinuationPage(drawing, context, x, top, width, bottom, overflow) {
  const titleHeight = 11;
  drawing.rect(x, top, width, titleHeight, { fill: HEAD_SHADE, stroke: RULE, lineWidth: 0.6 });
  drawing.textInBox('COMMENTS / NON-SCI FINDINGS (continued)', box(x, top, width, titleHeight), {
    align: 'left', size: 6.2, bold: true, padding: 4, letterSpacing: 0.4,
  });
  const bodyHeight = bottom - top - titleHeight;
  drawing.rect(x, top, width, titleHeight + bodyHeight, { stroke: RULE, lineWidth: 0.7 });
  drawing.paragraph(overflow, x + 6, top + titleHeight + 4, width - 12, { size: 7, lineHeight: 9.5 });
}

/* ------------------------------------------------------------------ */

function drawFooter(drawing, context, pageNumber, pageCount) {
  const { state, config, generatedAt, appVersion, size } = context;
  const y = size.height - MARGIN - FOOTER_HEIGHT;
  const width = size.width - MARGIN * 2;

  drawing.line(MARGIN, y, MARGIN + width, y, { stroke: HAIRLINE, lineWidth: 0.5 });

  const identifiers = [
    formatPatientName(state.patient),
    state.patient.mrn ? `${config.mrnLabel || 'MRN'} ${state.patient.mrn}` : '',
    state.patient.dateOfBirth ? `DOB ${formatDate(state.patient.dateOfBirth)}` : '',
  ].filter(Boolean).join('  ·  ');

  drawing.textInBox(identifiers, box(MARGIN, y, width * 0.6, FOOTER_HEIGHT), {
    align: 'left', size: 6, padding: 2, color: INK,
  });

  const generated = `Generated ${formatDateTime(generatedAt)}${appVersion ? ` · ${appVersion}` : ''}`;
  drawing.textInBox(generated, box(MARGIN + width * 0.6, y, width * 0.28, FOOTER_HEIGHT), {
    align: 'right', size: 6, padding: 2, color: MUTED,
  });
  drawing.textInBox(`Page ${pageNumber} of ${pageCount}`, box(MARGIN + width * 0.88, y, width * 0.12, FOOTER_HEIGHT), {
    align: 'right', size: 6, padding: 2, color: MUTED,
  });
}

/**
 * Producing the finished document.
 *
 * Everything happens in the browser: the worksheet display list becomes SVG for
 * the preview, PNG through a canvas, and a vector PDF through our own writer.
 * No exam data leaves the workstation unless the site has configured the
 * optional upload endpoint and the clinician presses the button.
 */

import { buildWorksheet, PAGE_SIZES } from './render/worksheet.js';
import { renderSvg, svgToPngBlob } from './render/svg.js';
import { renderPdf } from './render/pdf.js';
import { formatDate, formatPatientName, safeFilename } from './format.js';

export const APP_VERSION = 'ISNCSCI worksheet 1.0';

/** Builds the display lists and their SVG for a given state + classification. */
export function renderForm(state, result, config) {
  const generatedAt = new Date();
  const pages = buildWorksheet(state, result, {
    config,
    generatedAt,
    appVersion: APP_VERSION,
  });
  return {
    pages,
    generatedAt,
    svg: pages.map((page) => renderSvg(page)),
  };
}

/** `SMITH-John-12345678-2026-07-26` — identifiable at a glance in a downloads list. */
export function buildFilename(state, extension) {
  const parts = [
    safeFilename(state.patient.familyName, 'patient'),
    safeFilename(state.patient.givenName, ''),
    safeFilename(state.patient.mrn, ''),
    safeFilename(state.exam.examDate, ''),
  ].filter(Boolean);
  return `ISNCSCI-${parts.join('-')}.${extension}`;
}

function pdfMetadata(state, config, generatedAt) {
  const name = formatPatientName(state.patient);
  const mrnLabel = config.mrnLabel || 'MRN';
  return {
    title: `ISNCSCI worksheet — ${name}${state.patient.mrn ? ` (${mrnLabel} ${state.patient.mrn})` : ''}`,
    author: state.exam.examiner || config.institutionName || '',
    subject: `ISNCSCI examination ${formatDate(state.exam.examDate)}`,
    keywords: [
      'ISNCSCI', 'ASIA', 'spinal cord injury',
      state.patient.mrn ? `${mrnLabel} ${state.patient.mrn}` : '',
    ].filter(Boolean).join(', '),
    producer: `${config.institutionName || 'ISNCSCI worksheet'} · ${APP_VERSION}`,
    creationDate: generatedAt,
  };
}

export function pdfBlob(form, state, config) {
  const bytes = renderPdf(form.pages, pdfMetadata(state, config, form.generatedAt));
  return new Blob([bytes], { type: 'application/pdf' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on a timer: Safari needs the URL to survive the click handler.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportPdf(form, state, config) {
  downloadBlob(pdfBlob(form, state, config), buildFilename(state, 'pdf'));
}

export async function exportPng(form, state) {
  // One PNG per page; a single image cannot represent a two-page form honestly.
  for (const [index, svg] of form.svg.entries()) {
    const blob = await svgToPngBlob(svg, 3);
    const suffix = form.svg.length > 1 ? `-page${index + 1}` : '';
    downloadBlob(blob, buildFilename(state, 'png').replace(/\.png$/, `${suffix}.png`));
  }
}

export function exportSvg(form, state) {
  for (const [index, svg] of form.svg.entries()) {
    const suffix = form.svg.length > 1 ? `-page${index + 1}` : '';
    downloadBlob(
      new Blob([svg], { type: 'image/svg+xml' }),
      buildFilename(state, 'svg').replace(/\.svg$/, `${suffix}.svg`),
    );
  }
}

export function exportJson(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, buildFilename(state, 'json'));
}

/**
 * Sets the print page size to match the rendered form, so the browser's print
 * dialog defaults to the right paper instead of shrinking a landscape A4 form
 * onto portrait Letter.
 */
export function applyPrintPageSize(config) {
  const size = PAGE_SIZES[config.pageSize] ?? PAGE_SIZES.A4;
  const id = 'print-page-size';
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${size.width}pt ${size.height}pt; margin: 0; }`;
}

/**
 * Optional "send to record" upload. Disabled unless `config.upload.url` is set.
 * The PDF goes as a file part alongside the identifiers, which is the shape
 * most document-management intake endpoints expect.
 */
export async function uploadForm(form, state, config) {
  const upload = config.upload ?? {};
  if (!upload.url) {
    throw new Error('No upload endpoint is configured.');
  }

  const body = new FormData();
  body.append('file', pdfBlob(form, state, config), buildFilename(state, 'pdf'));
  body.append('mrn', state.patient.mrn);
  body.append('familyName', state.patient.familyName);
  body.append('givenName', state.patient.givenName);
  body.append('dateOfBirth', state.patient.dateOfBirth);
  body.append('encounter', state.patient.encounter);
  body.append('examDate', state.exam.examDate);
  body.append('examTime', state.exam.examTime);
  body.append('examiner', state.exam.examiner);
  body.append('documentType', 'ISNCSCI');

  const response = await fetch(upload.url, {
    method: 'POST',
    credentials: upload.credentials || 'include',
    headers: { ...(upload.headers ?? {}) },
    body,
  });

  if (!response.ok) {
    throw new Error(`The record system rejected the document (${response.status}).`);
  }
  return response;
}

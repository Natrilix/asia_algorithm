/**
 * Live classification panel.
 *
 * Shows the algorithm's output as soon as the exam is complete, and until then
 * shows exactly what is still missing — with each missing cell clickable, so
 * finishing an exam never turns into hunting for the one blank box.
 */

import { formatTotal } from './classify.js';
import { LEVEL_LABELS } from './isncsci-data.js';

const KIND_LABELS = {
  motor: 'motor',
  lightTouch: 'light touch',
  pinPrick: 'pin prick',
};

const MAX_LISTED_CELLS = 8;

export class ResultsPanel {
  /**
   * @param {HTMLElement} container
   * @param {(cell: {side: string, kind: string, level: string}) => void} onRevealCell
   */
  constructor(container, onRevealCell) {
    this.container = container;
    this.onRevealCell = onRevealCell;
  }

  render(result) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(this.buildBanner(result));

    if (result.classification) {
      fragment.appendChild(this.buildClassification(result.classification));
    }

    fragment.appendChild(this.buildTotals(result));
    this.container.replaceChildren(fragment);
  }

  buildBanner(result) {
    const banner = document.createElement('div');

    if (result.error) {
      banner.className = 'result-banner result-banner--error';
      banner.textContent = `The exam could not be classified: ${result.error}`;
      return banner;
    }

    if (result.complete) {
      banner.className = 'result-banner result-banner--ready';
      banner.textContent = 'Exam complete — classification calculated and ready to export.';
      return banner;
    }

    banner.className = 'result-banner result-banner--todo';
    const remaining = result.missing.cells.length + result.missing.binary.length;
    const heading = document.createElement('div');
    heading.textContent = `${remaining} ${remaining === 1 ? 'entry' : 'entries'} still to record before the exam can be classified.`;
    banner.appendChild(heading);

    const list = document.createElement('ul');
    for (const cell of result.missing.cells.slice(0, MAX_LISTED_CELLS)) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${cell.side === 'right' ? 'R' : 'L'} ${KIND_LABELS[cell.kind]} ${LEVEL_LABELS[cell.level]}`;
      button.addEventListener('click', () => this.onRevealCell(cell));
      item.appendChild(button);
      list.appendChild(item);
    }
    for (const name of result.missing.binary) {
      const item = document.createElement('li');
      item.textContent = name === 'voluntaryAnalContraction'
        ? 'Voluntary anal contraction (VAC)'
        : 'Deep anal pressure (DAP)';
      list.appendChild(item);
    }
    if (result.missing.cells.length > MAX_LISTED_CELLS) {
      const item = document.createElement('li');
      item.textContent = `…and ${result.missing.cells.length - MAX_LISTED_CELLS} more`;
      list.appendChild(item);
    }
    banner.appendChild(list);
    return banner;
  }

  buildClassification(classification) {
    const grid = document.createElement('div');
    grid.className = 'result-grid';

    grid.appendChild(card('Neurological level of injury', classification.neurologicalLevelOfInjury, { hero: true }));
    grid.appendChild(card('ASIA impairment scale', classification.ASIAImpairmentScale, { hero: true }));
    grid.appendChild(card('Injury', describeInjuryComplete(classification.injuryComplete), { wide: true, small: true }));

    grid.appendChild(card('Sensory level R', classification.neurologicalLevels.sensoryRight));
    grid.appendChild(card('Sensory level L', classification.neurologicalLevels.sensoryLeft));
    grid.appendChild(card('Motor level R', classification.neurologicalLevels.motorRight));
    grid.appendChild(card('Motor level L', classification.neurologicalLevels.motorLeft));

    grid.appendChild(card('ZPP sensory R', classification.zoneOfPartialPreservations.sensoryRight));
    grid.appendChild(card('ZPP sensory L', classification.zoneOfPartialPreservations.sensoryLeft));
    grid.appendChild(card('ZPP motor R', classification.zoneOfPartialPreservations.motorRight));
    grid.appendChild(card('ZPP motor L', classification.zoneOfPartialPreservations.motorLeft));

    return grid;
  }

  buildTotals(result) {
    const wrapper = document.createElement('div');
    const table = document.createElement('table');
    table.className = 'result-table';

    const caption = document.createElement('caption');
    caption.textContent = result.complete ? 'Totals' : 'Totals (provisional)';
    table.appendChild(caption);

    const head = document.createElement('thead');
    head.innerHTML = '<tr><th scope="col"></th><th scope="col">Right</th><th scope="col">Left</th><th scope="col">Total</th></tr>';
    table.appendChild(head);

    const totals = result.totals;
    const rows = [
      ['Upper extremity motor', totals.right.upperExtremity, totals.left.upperExtremity, totals.upperExtremity],
      ['Lower extremity motor', totals.right.lowerExtremity, totals.left.lowerExtremity, totals.lowerExtremity],
      ['Light touch', totals.right.lightTouch, totals.left.lightTouch, totals.lightTouch],
      ['Pin prick', totals.right.pinPrick, totals.left.pinPrick, totals.pinPrick],
    ];

    const bodyElement = document.createElement('tbody');
    for (const [label, right, left, total] of rows) {
      const row = document.createElement('tr');
      const header = document.createElement('th');
      header.scope = 'row';
      header.textContent = label;
      row.appendChild(header);
      for (const [index, value] of [right, left, total].entries()) {
        const cell = document.createElement('td');
        cell.textContent = formatTotal(value);
        if (index === 2) {
          cell.className = 'is-total';
        }
        row.appendChild(cell);
      }
      bodyElement.appendChild(row);
    }
    table.appendChild(bodyElement);
    wrapper.appendChild(table);

    if (!result.complete) {
      const note = document.createElement('p');
      note.className = 'result-provisional';
      note.textContent = 'Provisional subtotals for the values entered so far. '
        + 'Only a complete exam produces a classification or an exportable form.';
      wrapper.appendChild(note);
    }

    return wrapper;
  }
}

function card(label, value, options = {}) {
  const element = document.createElement('dl');
  element.className = 'result-card'
    + (options.wide ? ' result-card--wide' : '')
    + (options.hero ? ' result-card--hero' : '');
  const term = document.createElement('dt');
  term.textContent = label;
  const definition = document.createElement('dd');
  const text = value === undefined || value === null || value === '' ? '—' : String(value);
  definition.textContent = text;
  if (text === '—') {
    definition.classList.add('is-blank');
  }
  if (options.small) {
    definition.style.fontSize = '15px';
  }
  element.append(term, definition);
  return element;
}

/**
 * The algorithm reports 'C', 'I', or a comma separated pair when the exam
 * leaves both possible; spell it out rather than making the reader decode it.
 */
export function describeInjuryComplete(value) {
  if (!value) {
    return '';
  }
  return value
    .split(',')
    .map((part) => {
      const starred = part.includes('*');
      const word = part.replace(/\*/g, '') === 'C' ? 'Complete' : 'Incomplete';
      return starred ? `${word}*` : word;
    })
    .join(' / ');
}

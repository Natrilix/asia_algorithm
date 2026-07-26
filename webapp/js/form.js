/**
 * The data-entry grid.
 *
 * Every cell is reachable and settable from the keyboard alone — clinicians
 * enter 68 values per exam and a mouse round-trip per cell is the difference
 * between a usable tool and an abandoned one. The pop-up keypad exists for
 * touch screens and for discoverability of the star flags.
 */

import {
  SENSORY_LEVELS,
  MOTOR_LEVELS,
  NON_KEY_MUSCLE_LEVELS,
  KEY_MUSCLE_NAMES,
  LEVEL_LABELS,
  BINARY_VALUES,
  allowedBaseValues,
  canBeStarred,
  splitValue,
  joinValue,
} from './isncsci-data.js';
import { getCell, setCell } from './model.js';

/** Column order, left to right, matching the printed worksheet. */
const COLUMNS = [
  { side: 'right', kind: 'motor' },
  { side: 'right', kind: 'lightTouch' },
  { side: 'right', kind: 'pinPrick' },
  { side: 'left', kind: 'lightTouch' },
  { side: 'left', kind: 'pinPrick' },
  { side: 'left', kind: 'motor' },
];

const KIND_LABELS = {
  motor: 'Motor',
  lightTouch: 'Light touch',
  pinPrick: 'Pin prick',
};

const SIDE_LABELS = { right: 'Right', left: 'Left' };

export class ExamGrid {
  /**
   * @param {object} options
   * @param {Store} options.store
   * @param {HTMLElement} options.body tbody to render rows into
   * @param {HTMLElement} options.keypad
   */
  constructor({ store, body, keypad, extras }) {
    this.store = store;
    this.body = body;
    this.keypad = keypad;
    this.extras = extras;
    this.cells = new Map();
    this.active = null;

    this.renderRows();
    this.renderExtras();
    this.bindEvents();
    this.refresh();
  }

  static cellKey(side, kind, level) {
    return `${side}:${kind}:${level}`;
  }

  /* ------------------------------------------------------------- rendering */

  renderRows() {
    const fragment = document.createDocumentFragment();

    for (const level of SENSORY_LEVELS) {
      const hasMotor = MOTOR_LEVELS.includes(level);
      const row = document.createElement('tr');
      row.dataset.level = level;

      COLUMNS.forEach((column, index) => {
        if (index === 3) {
          row.appendChild(this.buildCentreCell(level, hasMotor));
        }
        row.appendChild(this.buildValueCell(column.side, column.kind, level, hasMotor));
      });

      fragment.appendChild(row);
    }

    this.body.replaceChildren(fragment);
  }

  buildCentreCell(level, hasMotor) {
    const cell = document.createElement('th');
    cell.scope = 'row';
    cell.className = 'grid__centre';
    const label = document.createElement('b');
    label.textContent = LEVEL_LABELS[level];
    cell.appendChild(label);
    if (hasMotor) {
      const muscle = document.createElement('span');
      muscle.textContent = KEY_MUSCLE_NAMES[level];
      cell.appendChild(muscle);
    }
    return cell;
  }

  buildValueCell(side, kind, level, hasMotor) {
    const cell = document.createElement('td');
    if (kind === 'motor' && !hasMotor) {
      cell.className = 'grid__blocked';
      return cell;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell';
    button.dataset.side = side;
    button.dataset.kind = kind;
    button.dataset.level = level;
    button.setAttribute(
      'aria-label',
      `${SIDE_LABELS[side]} ${KIND_LABELS[kind]} ${LEVEL_LABELS[level]}`,
    );
    cell.appendChild(button);
    this.cells.set(ExamGrid.cellKey(side, kind, level), button);
    return cell;
  }

  renderExtras() {
    for (const container of this.extras.querySelectorAll('[data-binary]')) {
      const name = container.dataset.binary;
      container.replaceChildren(...BINARY_VALUES.map((value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = value;
        button.dataset.value = value;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        button.addEventListener('click', () => {
          this.store.update((state) => {
            state[name] = state[name] === value ? '' : value;
          });
        });
        return button;
      }));
    }

    for (const select of this.extras.querySelectorAll('[data-nonkey]')) {
      const options = [new Option('None', '')];
      for (const level of NON_KEY_MUSCLE_LEVELS) {
        options.push(new Option(level, level));
      }
      select.replaceChildren(...options);
      select.addEventListener('change', () => {
        const side = select.dataset.nonkey;
        this.store.update((state) => {
          state.values[side].lowestNonKeyMuscleWithMotorFunction = select.value;
        });
      });
    }
  }

  /* ---------------------------------------------------------------- events */

  bindEvents() {
    this.body.addEventListener('click', (event) => {
      const button = event.target.closest('.cell');
      if (button) {
        this.setActive(button.dataset.side, button.dataset.kind, button.dataset.level);
      }
    });

    this.body.addEventListener('keydown', (event) => this.onKeyDown(event));

    // Tabbing into the grid must update the active cell too, otherwise the
    // keypad and the arrow keys would act on a stale selection.
    this.body.addEventListener('focusin', (event) => {
      const button = event.target.closest('.cell');
      if (!button) {
        return;
      }
      const { side, kind, level } = button.dataset;
      if (this.active && this.active.side === side
        && this.active.kind === kind && this.active.level === level) {
        return;
      }
      this.setActive(side, kind, level, { silent: true });
    });

    this.body.addEventListener('focusout', (event) => {
      // Closing the keypad when focus leaves the grid entirely, but not when it
      // moves into the keypad itself.
      const next = event.relatedTarget;
      if (next && (this.body.contains(next) || this.keypad.contains(next))) {
        return;
      }
      this.closeKeypad();
    });

    this.keypad.addEventListener('click', (event) => this.onKeypadClick(event));

    document.addEventListener('click', (event) => {
      if (this.keypad.hidden) {
        return;
      }
      if (this.keypad.contains(event.target) || event.target.closest('.cell')) {
        return;
      }
      this.closeKeypad();
    });
  }

  onKeyDown(event) {
    const button = event.target.closest('.cell');
    if (!button) {
      return;
    }
    const { side, kind, level } = button.dataset;

    if (event.key === 'Escape') {
      this.closeKeypad();
      return;
    }

    const moves = {
      ArrowUp: () => this.move(side, kind, level, 0, -1),
      ArrowDown: () => this.move(side, kind, level, 0, 1),
      ArrowLeft: () => this.move(side, kind, level, -1, 0),
      ArrowRight: () => this.move(side, kind, level, 1, 0),
    };
    if (moves[event.key]) {
      event.preventDefault();
      moves[event.key]();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.focusNextEmpty(side, kind, level);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      this.justAdvancedFrom = null;
      this.writeCell(side, kind, level, '');
      return;
    }

    if (event.key === '*') {
      event.preventDefault();
      this.cycleStar(side, kind, level);
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'n') {
      event.preventDefault();
      this.applyBase(side, kind, level, 'NT');
      return;
    }

    if (/^[0-9]$/.test(event.key)) {
      const allowed = allowedBaseValues(kind);
      if (allowed.includes(event.key)) {
        event.preventDefault();
        this.applyBase(side, kind, level, event.key);
      }
    }
  }

  onKeypadClick(event) {
    const target = event.target.closest('button');
    if (!target || !this.active) {
      return;
    }
    const { side, kind, level } = this.active;

    if (target.dataset.value !== undefined) {
      this.applyBase(side, kind, level, target.dataset.value, { keepOpen: true });
    } else if (target.dataset.star !== undefined) {
      const current = splitValue(getCell(this.store.state, side, kind, level));
      if (!current.base) {
        return;
      }
      const star = current.star === target.dataset.star ? '' : target.dataset.star;
      this.writeCell(side, kind, level, joinValue(current.base, star, kind), { keepOpen: true });
    } else if (target.id === 'keypad-clear') {
      this.writeCell(side, kind, level, '', { keepOpen: true });
    }
  }

  /* --------------------------------------------------------------- writing */

  /**
   * Applies a base value while preserving any star already on the cell, then
   * advances so a run of values can be typed without touching the mouse.
   */
  applyBase(side, kind, level, base, options = {}) {
    const current = splitValue(getCell(this.store.state, side, kind, level));
    const star = canBeStarred(base, kind) ? current.star : '';
    this.writeCell(side, kind, level, joinValue(base, star, kind), options);
    if (!options.keepOpen) {
      this.move(side, kind, level, 0, 1, { silent: true });
      // Set after the move: `move` clears it, and the whole point is to
      // remember the cell we just left. See `cycleStar`.
      this.justAdvancedFrom = { side, kind, level };
    }
  }

  /**
   * Cycles none -> * -> ** -> none.
   *
   * Typing a value advances to the next cell, so by the time the examiner
   * reaches for `*` the selection has already moved on. Reading "4 then *" as
   * "a starred 4" is what they mean, so a star immediately after a value goes
   * to the cell that value went into. Focus stays put, which keeps a run of
   * values flowing without a detour. Any deliberate navigation — a click, an
   * arrow key, Enter — clears this, so `*` then targets the selected cell.
   */
  cycleStar(side, kind, level) {
    const target = this.justAdvancedFrom ?? { side, kind, level };
    const current = splitValue(getCell(this.store.state, target.side, target.kind, target.level));
    if (!current.base || !canBeStarred(current.base, target.kind)) {
      return;
    }
    const next = { '': '*', '*': '**', '**': '' }[current.star];
    this.writeCell(target.side, target.kind, target.level, joinValue(current.base, next, target.kind));
  }

  writeCell(side, kind, level, value, options = {}) {
    this.store.update((state) => setCell(state, side, kind, level, value));
    if (options.keepOpen) {
      this.renderKeypad();
    }
  }

  /* ------------------------------------------------------------- navigation */

  move(side, kind, level, dx, dy, options = {}) {
    this.justAdvancedFrom = null;
    let columnIndex = COLUMNS.findIndex((column) => column.side === side && column.kind === kind);
    let levelIndex = SENSORY_LEVELS.indexOf(level);

    if (dx !== 0) {
      columnIndex = clamp(columnIndex + dx, 0, COLUMNS.length - 1);
    }
    if (dy !== 0) {
      levelIndex = clamp(levelIndex + dy, 0, SENSORY_LEVELS.length - 1);
    }

    // Motor columns only exist on the ten myotome rows; step past the gaps so
    // arrow keys never land on a blocked cell.
    let target = this.resolveTarget(columnIndex, levelIndex, dy || dx);
    if (!target) {
      target = this.resolveTarget(columnIndex, levelIndex, -(dy || dx));
    }
    if (target) {
      this.setActive(target.side, target.kind, target.level, options);
    }
  }

  resolveTarget(columnIndex, levelIndex, direction) {
    const column = COLUMNS[columnIndex];
    const step = direction >= 0 ? 1 : -1;
    for (let index = levelIndex; index >= 0 && index < SENSORY_LEVELS.length; index += step) {
      const level = SENSORY_LEVELS[index];
      if (column.kind !== 'motor' || MOTOR_LEVELS.includes(level)) {
        return { side: column.side, kind: column.kind, level };
      }
    }
    return null;
  }

  /** Jumps to the next cell without a value, wrapping to the start of the grid. */
  focusNextEmpty(side, kind, level) {
    const order = this.cellOrder();
    const startIndex = order.findIndex(
      (cell) => cell.side === side && cell.kind === kind && cell.level === level,
    );
    for (let step = 1; step <= order.length; step += 1) {
      const candidate = order[(startIndex + step) % order.length];
      if (!getCell(this.store.state, candidate.side, candidate.kind, candidate.level)) {
        this.setActive(candidate.side, candidate.kind, candidate.level);
        return;
      }
    }
  }

  /** Cells in column-major order: fill one column top to bottom, then move on. */
  cellOrder() {
    if (!this.order) {
      this.order = [];
      for (const column of COLUMNS) {
        const levels = column.kind === 'motor' ? MOTOR_LEVELS : SENSORY_LEVELS;
        for (const level of levels) {
          this.order.push({ side: column.side, kind: column.kind, level });
        }
      }
    }
    return this.order;
  }

  setActive(side, kind, level, options = {}) {
    const button = this.cells.get(ExamGrid.cellKey(side, kind, level));
    if (!button) {
      return;
    }
    this.justAdvancedFrom = null;
    if (this.activeButton) {
      this.activeButton.classList.remove('is-active');
    }
    this.active = { side, kind, level };
    this.activeButton = button;
    button.classList.add('is-active');
    button.focus({ preventScroll: false });
    if (!options.silent || !this.keypad.hidden) {
      this.openKeypad(button);
    }
  }

  focusFirst() {
    const first = this.cellOrder()[0];
    this.setActive(first.side, first.kind, first.level, { silent: true });
  }

  /** Highlights and scrolls to a specific cell, used by the validation list. */
  reveal(side, kind, level) {
    const button = this.cells.get(ExamGrid.cellKey(side, kind, level));
    if (!button) {
      return;
    }
    button.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.setActive(side, kind, level, { silent: true });
  }

  /* ---------------------------------------------------------------- keypad */

  openKeypad(anchor) {
    this.keypad.hidden = false;
    this.renderKeypad();
    const rect = anchor.getBoundingClientRect();
    const width = this.keypad.offsetWidth;
    const height = this.keypad.offsetHeight;
    const left = clamp(
      rect.right + window.scrollX + 6,
      8,
      window.scrollX + document.documentElement.clientWidth - width - 8,
    );
    const top = clamp(
      rect.top + window.scrollY - 4,
      window.scrollY + 8,
      window.scrollY + document.documentElement.clientHeight - height - 8,
    );
    this.keypad.style.left = `${left}px`;
    this.keypad.style.top = `${top}px`;
  }

  closeKeypad() {
    this.keypad.hidden = true;
  }

  renderKeypad() {
    if (this.keypad.hidden || !this.active) {
      return;
    }
    const { side, kind, level } = this.active;
    const current = splitValue(getCell(this.store.state, side, kind, level));

    this.keypad.querySelector('#keypad-title').textContent =
      `${SIDE_LABELS[side]} ${KIND_LABELS[kind]} · ${LEVEL_LABELS[level]}`;

    const values = this.keypad.querySelector('#keypad-values');
    values.replaceChildren(...allowedBaseValues(kind).map((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value;
      button.dataset.value = value;
      button.setAttribute('aria-pressed', String(current.base === value));
      return button;
    }));

    const starrable = canBeStarred(current.base, kind);
    const stars = this.keypad.querySelector('#keypad-stars');
    stars.replaceChildren(...[
      { star: '*', label: '* not normal' },
      { star: '**', label: '** normal' },
    ].map((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label;
      button.dataset.star = entry.star;
      button.disabled = !starrable;
      button.setAttribute('aria-pressed', String(current.star === entry.star));
      button.title = entry.star === '*'
        ? 'Impairment not due to spinal cord injury, NOT considered normal for classification'
        : 'Impairment not due to spinal cord injury, considered normal for classification';
      return button;
    }));
  }

  /* --------------------------------------------------------------- refresh */

  /** Re-reads the store and repaints every cell. Cheap enough at this size. */
  refresh() {
    const state = this.store.state;

    for (const [key, button] of this.cells) {
      const [side, kind, level] = key.split(':');
      const value = getCell(state, side, kind, level);
      const { star } = splitValue(value);
      button.textContent = value;
      button.dataset.empty = value ? 'false' : 'true';
      button.dataset.star = star;
    }

    for (const container of this.extras.querySelectorAll('[data-binary]')) {
      const value = state[container.dataset.binary];
      for (const button of container.querySelectorAll('button')) {
        button.setAttribute('aria-checked', String(button.dataset.value === value));
      }
    }

    for (const select of this.extras.querySelectorAll('[data-nonkey]')) {
      select.value = state.values[select.dataset.nonkey].lowestNonKeyMuscleWithMotorFunction ?? '';
    }

    this.renderKeypad();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Exam state: a plain, serialisable object plus a tiny observable store.
 *
 * The shape kept here is the *worksheet* shape (values may be blank while the
 * form is being filled in). `toAlgorithmExam()` converts it to the `Exam`
 * interface expected by the ISNCSCI algorithm, which requires every cell.
 */

import {
  SENSORY_LEVELS,
  MOTOR_LEVELS,
  allCells,
  isComplete,
  splitValue,
} from './isncsci-data.js';

export const SCHEMA_VERSION = 1;

function emptySide() {
  const lightTouch = {};
  const pinPrick = {};
  const motor = {};
  for (const level of SENSORY_LEVELS) {
    lightTouch[level] = '';
    pinPrick[level] = '';
  }
  for (const level of MOTOR_LEVELS) {
    motor[level] = '';
  }
  return { lightTouch, pinPrick, motor, lowestNonKeyMuscleWithMotorFunction: '' };
}

export function createEmptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    patient: {
      familyName: '',
      givenName: '',
      mrn: '',
      dateOfBirth: '',
      sex: '',
      encounter: '',
      ward: '',
      source: '',
    },
    exam: {
      examDate: '',
      examTime: '',
      examiner: '',
      examinerRole: '',
      comments: '',
    },
    values: {
      right: emptySide(),
      left: emptySide(),
    },
    voluntaryAnalContraction: '',
    deepAnalPressure: '',
  };
}

/** Deep clone that is safe for the plain data we hold. */
export function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

export function getCell(state, side, kind, level) {
  return state.values[side][kind][level] ?? '';
}

export function setCell(state, side, kind, level, value) {
  state.values[side][kind][level] = value;
}

/**
 * Cells still missing a value, in worksheet order. Used to drive validation and
 * the "next empty cell" navigation.
 */
export function missingCells(state) {
  return allCells().filter((cell) => !isComplete(getCell(state, cell.side, cell.kind, cell.level)));
}

export function missingBinaryObservations(state) {
  const missing = [];
  if (!state.voluntaryAnalContraction) {
    missing.push('voluntaryAnalContraction');
  }
  if (!state.deepAnalPressure) {
    missing.push('deepAnalPressure');
  }
  return missing;
}

export function isExamComplete(state) {
  return missingCells(state).length === 0 && missingBinaryObservations(state).length === 0;
}

/**
 * Converts worksheet state to the algorithm's `Exam` interface.
 * Throws when the exam is incomplete — callers should check `isExamComplete`.
 */
export function toAlgorithmExam(state) {
  if (!isExamComplete(state)) {
    throw new Error('The exam is incomplete and cannot be classified.');
  }
  const side = (name) => {
    const source = state.values[name];
    const result = {
      lightTouch: { ...source.lightTouch },
      pinPrick: { ...source.pinPrick },
      motor: { ...source.motor },
    };
    if (source.lowestNonKeyMuscleWithMotorFunction) {
      result.lowestNonKeyMuscleWithMotorFunction = source.lowestNonKeyMuscleWithMotorFunction;
    }
    return result;
  };
  return {
    right: side('right'),
    left: side('left'),
    voluntaryAnalContraction: state.voluntaryAnalContraction,
    deepAnalPressure: state.deepAnalPressure,
  };
}

/** True when any exam value has been entered — used to guard destructive actions. */
export function hasExamData(state) {
  if (state.voluntaryAnalContraction || state.deepAnalPressure) {
    return true;
  }
  return allCells().some((cell) => isComplete(getCell(state, cell.side, cell.kind, cell.level)));
}

/** True when any cell carries a star, which the printed form must footnote. */
export function hasStars(state) {
  return allCells().some((cell) => splitValue(getCell(state, cell.side, cell.kind, cell.level)).star !== '');
}

/**
 * Merges a loaded object into a fresh state so that unknown or missing keys
 * cannot corrupt the model.
 */
export function fromJSON(raw) {
  const state = createEmptyState();
  if (!raw || typeof raw !== 'object') {
    return state;
  }
  Object.assign(state.patient, pick(raw.patient, Object.keys(state.patient)));
  Object.assign(state.exam, pick(raw.exam, Object.keys(state.exam)));
  for (const side of ['right', 'left']) {
    const source = raw.values?.[side];
    if (!source) {
      continue;
    }
    for (const level of SENSORY_LEVELS) {
      if (typeof source.lightTouch?.[level] === 'string') {
        state.values[side].lightTouch[level] = source.lightTouch[level];
      }
      if (typeof source.pinPrick?.[level] === 'string') {
        state.values[side].pinPrick[level] = source.pinPrick[level];
      }
    }
    for (const level of MOTOR_LEVELS) {
      if (typeof source.motor?.[level] === 'string') {
        state.values[side].motor[level] = source.motor[level];
      }
    }
    if (MOTOR_LEVELS.includes(source.lowestNonKeyMuscleWithMotorFunction)) {
      state.values[side].lowestNonKeyMuscleWithMotorFunction = source.lowestNonKeyMuscleWithMotorFunction;
    }
  }
  if (['Yes', 'No', 'NT'].includes(raw.voluntaryAnalContraction)) {
    state.voluntaryAnalContraction = raw.voluntaryAnalContraction;
  }
  if (['Yes', 'No', 'NT'].includes(raw.deepAnalPressure)) {
    state.deepAnalPressure = raw.deepAnalPressure;
  }
  return state;
}

function pick(source, keys) {
  const result = {};
  if (!source || typeof source !== 'object') {
    return result;
  }
  for (const key of keys) {
    if (typeof source[key] === 'string') {
      result[key] = source[key];
    }
  }
  return result;
}

/** Minimal observable store — subscribe, mutate through `update`, get notified. */
export class Store {
  constructor(state = createEmptyState()) {
    this.state = state;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** `mutator` receives the live state and may change it in place. */
  update(mutator, meta = {}) {
    mutator(this.state);
    this.notify(meta);
  }

  replace(state, meta = {}) {
    this.state = state;
    this.notify(meta);
  }

  notify(meta = {}) {
    for (const listener of this.listeners) {
      listener(this.state, meta);
    }
  }
}

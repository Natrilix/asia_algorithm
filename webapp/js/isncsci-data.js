/**
 * Static description of the ISNCSCI worksheet: levels, allowed cell values and
 * the star ("not due to SCI") semantics used by the classification algorithm.
 *
 * Star semantics, as consumed by the algorithm in `src/`:
 *   ''   - ordinary value.
 *   '*'  - impairment is not due to SCI and is NOT considered normal.
 *   '**' - impairment is not due to SCI and IS considered normal for
 *          classification (see `isNormalSensory` in src/classification/common.ts).
 * A value that is already normal ('2' sensory, '5' motor) cannot carry a star.
 */

export const SENSORY_LEVELS = [
  'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
  'L1', 'L2', 'L3', 'L4', 'L5',
  'S1', 'S2', 'S3', 'S4_5',
];

export const MOTOR_LEVELS = ['C5', 'C6', 'C7', 'C8', 'T1', 'L2', 'L3', 'L4', 'L5', 'S1'];

export const UPPER_MOTOR_LEVELS = ['C5', 'C6', 'C7', 'C8', 'T1'];
export const LOWER_MOTOR_LEVELS = ['L2', 'L3', 'L4', 'L5', 'S1'];

/** Levels that may be recorded as the lowest non-key muscle with motor function. */
export const NON_KEY_MUSCLE_LEVELS = MOTOR_LEVELS;

export const SENSORY_BASE_VALUES = ['0', '1', '2', 'NT'];
export const MOTOR_BASE_VALUES = ['0', '1', '2', '3', '4', '5', 'NT'];

/** A base value is "already normal" and therefore cannot be starred. */
export const NORMAL_SENSORY_VALUE = '2';
export const NORMAL_MOTOR_VALUE = '5';

export const BINARY_VALUES = ['Yes', 'No', 'NT'];

export const KEY_MUSCLE_NAMES = {
  C5: 'Elbow flexors',
  C6: 'Wrist extensors',
  C7: 'Elbow extensors',
  C8: 'Finger flexors',
  T1: 'Finger abductors (little finger)',
  L2: 'Hip flexors',
  L3: 'Knee extensors',
  L4: 'Ankle dorsiflexors',
  L5: 'Long toe extensors',
  S1: 'Ankle plantar flexors',
};

/** Short label used on the printed worksheet. */
export const LEVEL_LABELS = SENSORY_LEVELS.reduce((labels, level) => {
  labels[level] = level === 'S4_5' ? 'S4-5' : level;
  return labels;
}, {});

/**
 * Splits a stored cell value into its numeric part and star flag.
 * `'1**'` becomes `{ base: '1', star: '**' }`.
 */
export function splitValue(value) {
  if (typeof value !== 'string' || value === '') {
    return { base: '', star: '' };
  }
  const match = /^(NT|\d)(\*{0,2})$/.exec(value);
  if (!match) {
    return { base: '', star: '' };
  }
  return { base: match[1], star: match[2] };
}

/** Recombines a base value and star flag, dropping stars where not permitted. */
export function joinValue(base, star, kind) {
  if (!base) {
    return '';
  }
  if (!canBeStarred(base, kind)) {
    return base;
  }
  return base + (star || '');
}

export function canBeStarred(base, kind) {
  if (!base) {
    return false;
  }
  const normal = kind === 'motor' ? NORMAL_MOTOR_VALUE : NORMAL_SENSORY_VALUE;
  return base !== normal;
}

export function allowedBaseValues(kind) {
  return kind === 'motor' ? MOTOR_BASE_VALUES : SENSORY_BASE_VALUES;
}

/** True when the cell holds a value the algorithm can classify. */
export function isComplete(value) {
  return splitValue(value).base !== '';
}

/**
 * The set of cells that must be filled before a classification is meaningful.
 * Returns `{ side, kind, level }` descriptors.
 */
export function allCells() {
  const cells = [];
  for (const side of ['right', 'left']) {
    for (const level of SENSORY_LEVELS) {
      cells.push({ side, kind: 'lightTouch', level });
      cells.push({ side, kind: 'pinPrick', level });
    }
    for (const level of MOTOR_LEVELS) {
      cells.push({ side, kind: 'motor', level });
    }
  }
  return cells;
}

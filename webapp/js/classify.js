/**
 * Thin wrapper over the ISNCSCI algorithm bundle.
 *
 * The algorithm requires a fully populated exam, so while the worksheet is
 * being filled in we also compute *provisional* subtotals locally. Those are
 * clearly labelled in the UI and never appear on an exported form: only a
 * complete exam produces a classification.
 */

import ISNCSCI from '../vendor/isncsci.esm.js';
import {
  SENSORY_LEVELS,
  UPPER_MOTOR_LEVELS,
  LOWER_MOTOR_LEVELS,
  splitValue,
} from './isncsci-data.js';
import { isExamComplete, missingCells, missingBinaryObservations, toAlgorithmExam } from './model.js';

const NOT_DETERMINABLE = 'ND';

/**
 * @returns {{complete: boolean, classification: object|null, totals: object,
 *            missing: object, error: string|null}}
 */
export function classifyState(state) {
  const missing = {
    cells: missingCells(state),
    binary: missingBinaryObservations(state),
  };
  const complete = isExamComplete(state);

  if (!complete) {
    return {
      complete: false,
      classification: null,
      totals: provisionalTotals(state),
      missing,
      error: null,
    };
  }

  try {
    const result = new ISNCSCI(toAlgorithmExam(state));
    return {
      complete: true,
      classification: result.classification,
      totals: result.totals,
      missing,
      error: null,
    };
  } catch (error) {
    return {
      complete: true,
      classification: null,
      totals: provisionalTotals(state),
      missing,
      error: error && error.message ? error.message : String(error),
    };
  }
}

/**
 * Subtotals for a partially completed exam. Mirrors `src/totals/totals.ts`:
 * any `NT` in a group makes the group not determinable; here a blank cell makes
 * it unknown (`null`) instead of throwing.
 */
export function provisionalTotals(state) {
  const side = (name) => {
    const values = state.values[name];
    return {
      upperExtremity: sumGroup(UPPER_MOTOR_LEVELS.map((l) => values.motor[l])),
      lowerExtremity: sumGroup(LOWER_MOTOR_LEVELS.map((l) => values.motor[l])),
      motor: sumGroup(Object.values(values.motor)),
      lightTouch: sumGroup(SENSORY_LEVELS.map((l) => values.lightTouch[l])),
      pinPrick: sumGroup(SENSORY_LEVELS.map((l) => values.pinPrick[l])),
    };
  };
  const right = side('right');
  const left = side('left');
  return {
    right,
    left,
    upperExtremity: addTotals(right.upperExtremity, left.upperExtremity),
    lowerExtremity: addTotals(right.lowerExtremity, left.lowerExtremity),
    lightTouch: addTotals(right.lightTouch, left.lightTouch),
    pinPrick: addTotals(right.pinPrick, left.pinPrick),
  };
}

function sumGroup(values) {
  let sum = 0;
  for (const value of values) {
    const { base } = splitValue(value);
    if (base === '') {
      return null;
    }
    if (base === 'NT') {
      return NOT_DETERMINABLE;
    }
    sum += Number(base);
  }
  return String(sum);
}

function addTotals(a, b) {
  if (a === null || b === null) {
    return null;
  }
  if (a === NOT_DETERMINABLE || b === NOT_DETERMINABLE) {
    return NOT_DETERMINABLE;
  }
  return String(Number(a) + Number(b));
}

/** Formats a total for display, turning `null` into an em dash. */
export function formatTotal(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

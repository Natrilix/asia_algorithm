/**
 * Shared fixtures. Kept out of the `.check.js` files so importing a helper does
 * not re-run another file's tests.
 */

import { createEmptyState } from '../js/model.js';
import { SENSORY_LEVELS, MOTOR_LEVELS } from '../js/isncsci-data.js';

/** An all-normal exam: every cell filled, so the algorithm will classify it. */
export function completeState(overrides = () => {}) {
  const state = createEmptyState();
  for (const side of ['right', 'left']) {
    for (const level of SENSORY_LEVELS) {
      state.values[side].lightTouch[level] = '2';
      state.values[side].pinPrick[level] = '2';
    }
    for (const level of MOTOR_LEVELS) {
      state.values[side].motor[level] = '5';
    }
  }
  state.voluntaryAnalContraction = 'Yes';
  state.deepAnalPressure = 'Yes';
  overrides(state);
  return state;
}

/** A complete exam that also carries the three points of identification. */
export function identifiedState(overrides = () => {}) {
  return completeState((state) => {
    state.patient.familyName = 'Testpatient';
    state.patient.givenName = 'Alex';
    state.patient.mrn = '10004821';
    state.patient.dateOfBirth = '1978-02-03';
    state.exam.examDate = '2026-07-26';
    state.exam.examTime = '09:30';
    state.exam.examiner = 'Dr A Clinician';
    overrides(state);
  });
}

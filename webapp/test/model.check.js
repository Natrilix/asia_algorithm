/**
 * Model and classification tests.
 *
 * Named `.check.js` rather than `.test.js` so Jest — which owns the library's
 * TypeScript suite — leaves them alone. Run with `npm run test:webapp`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  createEmptyState,
  fromJSON,
  toAlgorithmExam,
  isExamComplete,
  missingCells,
  hasExamData,
  hasStars,
} from '../js/model.js';
import { classifyState } from '../js/classify.js';
import { splitValue, joinValue, canBeStarred } from '../js/isncsci-data.js';
import { completeState } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

test('a new exam is empty and not classifiable', () => {
  const state = createEmptyState();
  assert.equal(isExamComplete(state), false);
  assert.equal(hasExamData(state), false);
  // 2 sides x (28 light touch + 28 pin prick + 10 motor)
  assert.equal(missingCells(state).length, 132);
  assert.throws(() => toAlgorithmExam(state), /incomplete/i);
});

test('a completed exam matches the library fixture', () => {
  // demo/demo-exam.json is all-normal; its known-good output is committed
  // alongside it, so this pins our wiring to the algorithm's own expectations.
  const expected = JSON.parse(readFileSync(path.join(REPO, 'demo/demo-exam-result.json'), 'utf8'));
  const result = classifyState(completeState());

  assert.equal(result.complete, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.classification, expected.classification);
  assert.deepEqual(result.totals, expected.totals);
});

test('provisional totals report unknown rather than throwing', () => {
  const state = completeState();
  state.values.right.motor.C5 = '';
  const result = classifyState(state);

  assert.equal(result.complete, false);
  assert.equal(result.classification, null);
  assert.equal(result.totals.right.upperExtremity, null, 'a blank cell makes the group unknown');
  assert.equal(result.totals.right.lightTouch, '56', 'untouched groups still total');
  assert.equal(result.totals.upperExtremity, null, 'unknown propagates to the combined total');
});

test('provisional totals mirror the library rule that NT is not determinable', () => {
  const state = completeState((draft) => {
    draft.values.left.motor.L2 = 'NT';
  });
  const result = classifyState(state);
  assert.equal(result.totals.left.lowerExtremity, 'ND');
  assert.equal(result.totals.lowerExtremity, 'ND');
});

test('the star flag changes the classification, matching isNormalSensory', () => {
  // C5 light touch impaired by a non-SCI cause on both sides. Marked '**' the
  // algorithm treats it as normal; marked '*' it does not.
  const asNormal = classifyState(completeState((state) => {
    state.values.right.lightTouch.C5 = '1**';
    state.values.left.lightTouch.C5 = '1**';
  }));
  const asAbnormal = classifyState(completeState((state) => {
    state.values.right.lightTouch.C5 = '1*';
    state.values.left.lightTouch.C5 = '1*';
  }));

  // '**' is treated as normal, so sensation is intact -- the algorithm still
  // flags the level with a star to show a non-SCI impairment was recorded.
  assert.equal(asNormal.classification.neurologicalLevels.sensoryRight, 'INT*');
  assert.equal(asAbnormal.classification.neurologicalLevels.sensoryRight, 'C4');
  assert.notEqual(
    asNormal.classification.ASIAImpairmentScale,
    asAbnormal.classification.ASIAImpairmentScale,
  );
});

test('star helpers refuse to star an already-normal value', () => {
  assert.equal(canBeStarred('5', 'motor'), false);
  assert.equal(canBeStarred('2', 'lightTouch'), false);
  assert.equal(canBeStarred('4', 'motor'), true);
  assert.equal(joinValue('5', '*', 'motor'), '5');
  assert.equal(joinValue('4', '**', 'motor'), '4**');
  assert.deepEqual(splitValue('NT**'), { base: 'NT', star: '**' });
  assert.deepEqual(splitValue(''), { base: '', star: '' });
  assert.deepEqual(splitValue('nonsense'), { base: '', star: '' });
});

test('hasStars only reports genuine star flags', () => {
  assert.equal(hasStars(completeState()), false);
  assert.equal(hasStars(completeState((state) => {
    state.values.left.motor.L4 = '3*';
  })), true);
});

test('the non-key muscle field reaches the algorithm exam', () => {
  const state = completeState((draft) => {
    draft.values.right.lowestNonKeyMuscleWithMotorFunction = 'S1';
  });
  const exam = toAlgorithmExam(state);
  assert.equal(exam.right.lowestNonKeyMuscleWithMotorFunction, 'S1');
  assert.equal(
    'lowestNonKeyMuscleWithMotorFunction' in exam.left,
    false,
    'an unset non-key muscle is omitted rather than sent as an empty string',
  );
});

test('fromJSON ignores unknown keys and bad values', () => {
  const loaded = fromJSON({
    patient: { mrn: '123', injected: 'nope', familyName: 42 },
    values: {
      right: { motor: { C5: '4*', L9: '3' }, lightTouch: { C2: '2' } },
      elbow: { motor: {} },
    },
    voluntaryAnalContraction: 'Maybe',
    deepAnalPressure: 'NT',
  });

  assert.equal(loaded.patient.mrn, '123');
  assert.equal(loaded.patient.familyName, '', 'a non-string is discarded');
  assert.equal('injected' in loaded.patient, false);
  assert.equal(loaded.values.right.motor.C5, '4*');
  assert.equal('L9' in loaded.values.right.motor, false);
  assert.equal(loaded.voluntaryAnalContraction, '', 'an invalid observation is dropped');
  assert.equal(loaded.deepAnalPressure, 'NT');
});

test('fromJSON round-trips a completed exam', () => {
  const original = completeState((state) => {
    state.patient.mrn = '10004821';
    state.values.left.motor.L4 = '1**';
    state.values.right.lowestNonKeyMuscleWithMotorFunction = 'L5';
  });
  const restored = fromJSON(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
});

/* Built from src/ by "npm run build:webapp-vendor". Do not edit by hand. */
var MotorLevels = [
    'C5', 'C6', 'C7', 'C8', 'T1',
    'L2', 'L3', 'L4', 'L5', 'S1',
];

var SensoryLevels = [
    'C1',
    'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8',
    'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
    'L1', 'L2', 'L3', 'L4', 'L5',
    'S1', 'S2', 'S3', 'S4_5',
];

var isAbnormalSensory = function (value) { return ['0', '1', '0*', '1*'].includes(value); };
var NTVariableSensory = function (value) { return ['0**', '1**'].includes(value); };
var NTNotVariableSensory = function (value) { return ['2', 'NT', 'NT**'].includes(value); };
var checkSensoryLevel = function (side, level, nextLevel, variable) {
    if (nextLevel === 'C1') {
        throw "invalid arguments level: " + level + " nextLevel: " + nextLevel;
    }
    if (side.lightTouch[nextLevel] === '2' && side.pinPrick[nextLevel] === '2') {
        return { continue: true, variable: variable };
    }
    else if (isAbnormalSensory(side.lightTouch[nextLevel]) || isAbnormalSensory(side.pinPrick[nextLevel])) {
        return { continue: false, level: level + (variable ? '*' : ''), variable: variable };
    }
    else if ([side.lightTouch[nextLevel], side.pinPrick[nextLevel]].includes('NT*')) {
        return { continue: false, level: level + '*', variable: true };
    }
    else if (side.lightTouch[nextLevel] === 'NT' || side.pinPrick[nextLevel] === 'NT') {
        if (NTVariableSensory(side.lightTouch[nextLevel]) || NTVariableSensory(side.pinPrick[nextLevel])) {
            return { continue: true, level: level + (variable ? '*' : ''), variable: true };
        }
        else if (NTNotVariableSensory(side.lightTouch[nextLevel]) || NTNotVariableSensory(side.pinPrick[nextLevel])) {
            return { continue: true, level: level + (variable ? '*' : ''), variable: variable };
        }
        else {
            throw '';
        }
    }
    else {
        return { continue: true, variable: true };
    }
};
/**
 * 1. step through each level
 *    a. If next PP and LT are both considered normal then continue to next level
 *    b. If next PP and LT contains NT and does not contain abnormal then add current level to list then continue to next level
 *    c. Else one of next PP and LT is altered then add current level to list then stop
 *       i. if next PP and LT both
 *    d. If reached last level (S4_5) then add current level to list
 * 2. return current list
 */
var determineSensoryLevel = function (side) {
    var levels = [];
    var variable = false;
    for (var i = 0; i < SensoryLevels.length; i++) {
        var level = SensoryLevels[i];
        var nextLevel = SensoryLevels[i + 1];
        if (nextLevel) {
            var result = checkSensoryLevel(side, level, nextLevel, variable);
            variable = variable || !!result.variable;
            if (result.level) {
                levels.push(result.level);
            }
            if (result.continue) {
                continue;
            }
            else {
                break;
            }
        }
        else {
            // reached end of SensoryLevels
            levels.push('INT' + (variable ? '*' : ''));
        }
    }
    return levels.join(',');
};

/**
 * `['0', 'NT', '0*', 'NT*'].includes(value)`
 */
var canBeAbsentSensory = function (value) { return ['0', 'NT', '0*', 'NT*'].includes(value); };
var levelIsBetween = function (index, firstLevel, lastLevel) {
    return index >= SensoryLevels.indexOf(firstLevel) && index <= SensoryLevels.indexOf(lastLevel);
};

var checkMotorLevel = function (side, level, nextLevel, variable) {
    if (['0', '1', '2'].includes(side.motor[level])) {
        throw new Error("Invalid motor value at current level");
    }
    var result = { continue: false, variable: variable };
    if (!['0', '1', '2'].includes(side.motor[level])) {
        if (!['0*', '1*', '2*', 'NT*', '3', '4', '3*', '4*'].includes(side.motor[level])) {
            if (!['0', '1', '2'].includes(side.motor[nextLevel])) {
                result.continue = true;
            }
        }
    }
    if (!(['5', '0**', '1**', '2**', '3**', '4**', 'NT**'].includes(side.motor[level]) && !['0', '1', '2', '0*', '1*', '2*', 'NT', 'NT*'].includes(side.motor[nextLevel]))) {
        if (['0*', '1*', '2*', 'NT*'].includes(side.motor[level]) || (['0**', '1**', '2**'].includes(side.motor[level]) && ['0*', '1*', '2*', 'NT', 'NT*'].includes(side.motor[nextLevel]))) {
            result.level = level + '*';
        }
        else {
            result.level = level + (variable ? '*' : '');
        }
    }
    if (!['5', '3', '4', '3*', '4*', 'NT'].includes(side.motor[level])) {
        if (['0**', '1**', '2**', '3**', '4**', 'NT**'].includes(side.motor[level])) {
            if (!['0', '1', '2'].includes(side.motor[nextLevel])) {
                result.variable = true;
            }
        }
        else {
            result.variable = true;
        }
    }
    else if (side.motor[level] === '5' && ['0**', '1**', '2**'].includes(side.motor[nextLevel])) {
        result.variable = true;
    }
    return result;
};
var checkMotorLevelBeforeStartOfKeyMuscles = function (side, level, nextLevel, variable) {
    return {
        continue: !['0', '1', '2'].includes(side.motor[nextLevel]),
        level: ['0', '1', '2', '0*', '1*', '2*', 'NT', 'NT*'].includes(side.motor[nextLevel]) ? level + (variable ? '*' : '') : undefined,
        variable: variable || ['0**', '1**', '2**'].includes(side.motor[nextLevel]),
    };
};
var checkMotorLevelUsingSensoryValues = function (side, firstMotorLevelOfMotorBlock) {
    var startIndex = SensoryLevels.indexOf(firstMotorLevelOfMotorBlock) - 1;
    var result = { continue: true, variable: false };
    for (var i = startIndex; i <= startIndex + 5; i++) {
        var level = SensoryLevels[i];
        var nextLevel = SensoryLevels[i + 1];
        var currentLevelResult = checkSensoryLevel(side, level, nextLevel, false);
        if (currentLevelResult.continue === false) {
            result.continue = false;
        }
        if (currentLevelResult.level) {
            result.level = currentLevelResult.level;
        }
        if (currentLevelResult.variable) {
            result.variable = true;
        }
    }
    return result;
};
var checkWithSensoryCheckLevelResult = function (side, level, variable, sensoryCheckLevelResult) {
    var result = { continue: true, variable: variable };
    if ((['3', '4', '0*', '1*', '2*', '3*', '4*', 'NT*'].includes(side.motor[level]) || !sensoryCheckLevelResult.continue)) {
        result.continue = false;
    }
    if (side.motor[level] === 'NT' || !(['5', '0**', '1**', '2**', '3**', '4**', 'NT**'].includes(side.motor[level]) && sensoryCheckLevelResult.continue && !sensoryCheckLevelResult.level)) {
        if (['0*', '1*', '2*', 'NT*'].includes(side.motor[level]) ||
            (['0**', '1**', '2**'].includes(side.motor[level]) &&
                (sensoryCheckLevelResult.level || !sensoryCheckLevelResult.continue))) {
            result.level = level + '*';
        }
        else {
            result.level = level + (variable ? '*' : '');
        }
    }
    if (['0*', '1*', '2*', 'NT*', '0**', '1**', '2**'].includes(side.motor[level]) || (['3**', '4**', 'NT**'].includes(side.motor[level]) && sensoryCheckLevelResult.continue) || (['5', 'NT'].includes(side.motor[level]) &&
        (sensoryCheckLevelResult.continue && sensoryCheckLevelResult.variable && !sensoryCheckLevelResult.level))) {
        result.variable = true;
    }
    return result;
};
var checkMotorLevelAtEndOfKeyMuscles = function (side, level, variable) {
    if (['0', '1', '2'].includes(side.motor[level])) {
        throw new Error("Invalid motor value at current level");
    }
    var firstMotorLevelOfMotorBlock = level === 'T1' ? 'C5' : 'L2';
    var sensoryCheckLevelResult = checkMotorLevelUsingSensoryValues(side, firstMotorLevelOfMotorBlock);
    return checkWithSensoryCheckLevelResult(side, level, variable, sensoryCheckLevelResult);
};
/** TODO
 * 1. step through each level
 *    a. ...
 * 2. return current list
 */
var determineMotorLevel = function (side, vac) {
    var levels = [];
    var level;
    var nextLevel;
    var result;
    var variable = false;
    for (var i = 0; i < SensoryLevels.length; i++) {
        level = SensoryLevels[i];
        nextLevel = SensoryLevels[i + 1];
        // check sensory
        if (levelIsBetween(i, 'C1', 'C3') || levelIsBetween(i, 'T2', 'T12') || levelIsBetween(i, 'S2', 'S3')) {
            result = checkSensoryLevel(side, level, nextLevel, variable);
        }
        // check before key muscles
        else if (level === 'C4' || level === 'L1') {
            nextLevel = level === 'C4' ? 'C5' : 'L2';
            result = checkMotorLevelBeforeStartOfKeyMuscles(side, level, nextLevel, variable);
        }
        // check motor
        else if (levelIsBetween(i, 'C5', 'C8') || levelIsBetween(i, 'L2', 'L5')) {
            // level = C5 to C8
            var index = i - (levelIsBetween(i, 'C5', 'C8') ? 4 : 16);
            level = MotorLevels[index];
            nextLevel = MotorLevels[index + 1];
            result = checkMotorLevel(side, level, nextLevel, variable);
        }
        // check at end of key muscles
        else if (level === 'T1' || level === 'S1') {
            result = checkMotorLevelAtEndOfKeyMuscles(side, level, variable);
        }
        else {
            if (vac === 'No') {
                if ((levels.includes('S3') || levels.includes('S3*'))) {
                    break;
                }
                else {
                    result = { continue: false, level: 'S3' + (variable ? '*' : ''), variable: variable };
                }
            }
            else if (vac === 'NT') {
                if ((levels.includes('S3') || levels.includes('S3*'))) {
                    result = { continue: false, level: 'INT' + (variable ? '*' : ''), variable: variable };
                }
                else {
                    levels.push('S3' + (variable ? '*' : ''));
                    result = { continue: false, level: 'INT' + (variable ? '*' : ''), variable: variable };
                }
            }
            else {
                result = { continue: false, level: 'INT' + (variable ? '*' : ''), variable: variable };
            }
        }
        variable = variable || result.variable;
        if (result.level) {
            levels.push(result.level);
        }
        if (result.continue) {
            continue;
        }
        else {
            return levels.join(',');
        }
    }
    return levels.join(',');
};

var determineNeurologicalLevels = function (exam) {
    var sensoryRight = determineSensoryLevel(exam.right);
    var sensoryLeft = determineSensoryLevel(exam.left);
    var motorRight = determineMotorLevel(exam.right, exam.voluntaryAnalContraction);
    var motorLeft = determineMotorLevel(exam.left, exam.voluntaryAnalContraction);
    return { sensoryRight: sensoryRight, sensoryLeft: sensoryLeft, motorRight: motorRight, motorLeft: motorLeft };
};

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

function __spreadArray(to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
}

var isAbsentSensory = function (value) { return value === '0'; };
var checkLevelForSensoryZPP = function (side, level, variable) {
    if (level === 'C1') {
        throw "invalid argument level: " + level;
    }
    var currentLevelPinPrickIsAbsent = isAbsentSensory(side.pinPrick[level]);
    var currentLevelLightTouchIsAbsent = isAbsentSensory(side.lightTouch[level]);
    if (currentLevelPinPrickIsAbsent && currentLevelLightTouchIsAbsent) {
        // TODO: remove hard coded variable
        return { continue: true, variable: variable };
    }
    if (!canBeAbsentSensory(side.pinPrick[level]) || !canBeAbsentSensory(side.lightTouch[level])) {
        // TODO: remove hard coded variable
        return { continue: false, level: level + (variable ? '*' : ''), variable: variable };
    }
    else {
        // TODO: remove hard coded variable
        var foundSomeNT = [side.pinPrick[level], side.lightTouch[level]].some(function (v) { return ['NT', 'NT*'].includes(v); });
        if (foundSomeNT) {
            return { continue: true, level: level + (variable ? '*' : ''), variable: variable };
        }
        else {
            return { continue: true, level: level + '*', variable: variable || !foundSomeNT };
        }
    }
};
var determineSensoryZPP = function (side, deepAnalPressure) {
    var zpp = [];
    var variable = false;
    if ((deepAnalPressure === 'No' || deepAnalPressure === 'NT') && canBeAbsentSensory(side.lightTouch.S4_5) && canBeAbsentSensory(side.pinPrick.S4_5)) {
        var sacralResult = checkLevelForSensoryZPP(side, 'S4_5', variable);
        if (deepAnalPressure === 'NT' ||
            (deepAnalPressure === 'No' && (!sacralResult.continue || sacralResult.level !== undefined))) {
            zpp.push('NA');
        }
        var levels = [];
        for (var i = SensoryLevels.indexOf('S3'); i >= 0; i--) {
            var level = SensoryLevels[i];
            // if not level !== C1
            if (i > 0) {
                var result = checkLevelForSensoryZPP(side, level, variable);
                variable = variable || result.variable;
                if (result.level) {
                    levels.unshift(result.level);
                }
                if (result.continue) {
                    continue;
                }
                else {
                    break;
                }
            }
            else {
                // reached end of SensoryLevels
                levels.unshift(level);
            }
        }
        zpp = __spreadArray(__spreadArray([], zpp), levels);
        return zpp.join(',');
    }
    else {
        return 'NA';
    }
};

/* *************************************** */
/*  Support methods                        */
/* *************************************** */
/*
 * Iterates down the side and builds a chain of `SideLevel` objects with only the levels that need to be checked.
 * It also maps the top, bottom, nonKeyMuscle, firstLevelWithStar, and lastLevelWithConsecutiveNormalValues.
 * Can throw the following exception:
 *   'Unable to determine the topLevel, bottomLevel, or lastLevelWithConsecutiveNormalValues'
 *   This happens when the side has invalid or missing values or the provided top or bottom level are calculated incorrectly.
 */
function getLevelsRange(side, top, bottom, nonKeyMuscleName) {
    var _a, _b;
    var currentLevel = null;
    var topLevel = null;
    var bottomLevel = null;
    var nonKeyMuscle = null;
    var firstLevelWithStar = null;
    var lastLevelWithConsecutiveNormalValues = null;
    for (var i = 0; i < SensoryLevels.length && !bottomLevel; i++) {
        var sensoryLevelName = SensoryLevels[i];
        var motorLevelName = MotorLevels.includes(sensoryLevelName) ? sensoryLevelName : null;
        var level = {
            name: sensoryLevelName,
            lightTouch: sensoryLevelName === 'C1' ? '2' : side.lightTouch[sensoryLevelName],
            pinPrick: sensoryLevelName === 'C1' ? '2' : side.pinPrick[sensoryLevelName],
            motor: motorLevelName ? side.motor[motorLevelName] : null,
            index: i,
            next: null,
            previous: null,
        };
        if (!firstLevelWithStar
            && (/\*/.test(level.lightTouch)
                || /\*/.test(level.pinPrick)
                || /\*/.test((_a = level.motor) !== null && _a !== void 0 ? _a : ''))) {
            firstLevelWithStar = level;
        }
        if (!lastLevelWithConsecutiveNormalValues
            && (!/(^2$)|(\*\*$)/.test(level.lightTouch)
                || !/(^2$)|(\*\*$)/.test(level.pinPrick)
                || !/(^5$)|(\*\*$)/.test((_b = level.motor) !== null && _b !== void 0 ? _b : ''))) {
            lastLevelWithConsecutiveNormalValues = currentLevel;
        }
        if (motorLevelName && motorLevelName === nonKeyMuscleName) {
            nonKeyMuscle = level;
        }
        if (top === sensoryLevelName) {
            currentLevel = level;
            topLevel = level;
        }
        else if (currentLevel) {
            currentLevel.next = level;
            level.previous = currentLevel;
            currentLevel = level;
        }
        if (bottom === sensoryLevelName) {
            bottomLevel = currentLevel;
            if (!lastLevelWithConsecutiveNormalValues) {
                lastLevelWithConsecutiveNormalValues = currentLevel;
            }
        }
    }
    if (!topLevel || !bottomLevel || !lastLevelWithConsecutiveNormalValues) {
        throw new Error('getLevelsRange :: Unable to determine the topLevel, bottomLevel, or lastLevelWithConsecutiveNormalValues');
    }
    return { topLevel: topLevel, bottomLevel: bottomLevel, nonKeyMuscle: nonKeyMuscle, firstLevelWithStar: firstLevelWithStar, lastLevelWithConsecutiveNormalValues: lastLevelWithConsecutiveNormalValues };
}
/*
 * Returns `true` if there is a level flagged with `*` above the `currentLevel` or if `currentLevel` has it.
 */
function hasStarOnCurrentOrAboveLevel(currentLevel, lastLevelWithConsecutiveNormalValues, firstLevelWithStar) {
    // Good example, case #93
    if (!firstLevelWithStar) {
        return false;
    }
    if (currentLevel.motor !== null) {
        return /0\*/.test(currentLevel.motor);
    }
    if (/\d\*/.test(currentLevel.lightTouch) || /\d\*/.test(currentLevel.pinPrick)) {
        return true;
    }
    // return currentLevel.index <= lastLevelWithConsecutiveNormalValues.index && currentLevel.index >= firstLevelWithStar.index;
    return /\d\*/.test(currentLevel.lightTouch)
        || /\d\*/.test(currentLevel.pinPrick)
        || (currentLevel.index <= lastLevelWithConsecutiveNormalValues.index && currentLevel.index >= firstLevelWithStar.index);
}
/* *************************************** */
/*  Motor ZPP calculation command methods  */
/* *************************************** */
/*
 * This is the sixth and final step when calculating the motor ZPP.
 * Sorts the ZPP results ensuring the `NA` value, if available, is at the beginning of the list.
 */
function sortMotorZPP(state) {
    var zpp = state.zpp.sort(function (a, b) {
        var aIndex = a === 'NA' ? -1 : SensoryLevels.indexOf(a.replace(/\*/, ''));
        var bIndex = b === 'NA' ? -1 : SensoryLevels.indexOf(b.replace(/\*/, ''));
        return aIndex - bIndex;
    });
    return {
        description: { key: 'motorZPPSortMotorZPPDescription' },
        actions: [{ key: 'motorZPPSortMotorZPPEnsureNAIsPlacedFirstAction' }],
        state: __assign(__assign({}, state), { zpp: zpp }),
        next: null,
    };
}
/*
 * This is the fifth step when calculating the Motor ZPP.
 * It adds the non-key muscle to ZPP, it has not been added already and if one is available.
 * It sets `sortMotorZPP` as the next and final step.
 */
function addLowerNonKeyMuscleToMotorZPPIfNeeded(state) {
    var description = { key: 'motorZPPAddLowerNonKeyMuscleToMotorZPPIfNeededDescription' };
    return state.addNonKeyMuscle && !state.nonKeyMuscleHasBeenAdded && state.nonKeyMuscle
        ? {
            description: description,
            actions: [{ key: 'motorZPPAddLowerNonKeyMuscleToMotorZPPIfNeededAddNonKeyMuscleAction' }],
            state: __assign(__assign({}, state), { zpp: __spreadArray(__spreadArray([], state.zpp), [state.nonKeyMuscle.name]) }),
            next: sortMotorZPP,
        }
        : {
            description: description,
            actions: [{ key: 'motorZPPAddLowerNonKeyMuscleToMotorZPPIfNeededIgnoreNonKeyMuscleAction' }],
            state: __assign(__assign({}, state), { zpp: __spreadArray([], state.zpp) }),
            next: sortMotorZPP,
        };
}
/*
 * Branch in the fourth step of the calculation.
 * It produces iteration, by calling `checkLevel`, as with `checkForMotorFunction` and `checkForSensoryFunction` it looks for normal motor function.
 * Looks for normal sensory function in the current level.
 *   - If the level is included in the Motor levels,
 *     It checks if the non-key muscle overrides it or adds it to the zpp values if not overridden
 *     It checks if `*` needs to be added to ZPP value
 *   - If we have reached the top level in the range, it sets `addLowerNonKeyMuscleToMotorZPPIfNeeded` as next step, `checkLevel` to continue iterating otherwise.
 * Could throw the following error:
 *   - state.currentLevel is null. A SideLevel value is required.
 */
function checkForSensoryFunction(state) {
    if (!state.currentLevel) {
        throw new Error('checkForSensoryFunction :: state.currentLevel is null. A SideLevel value is required.');
    }
    var currentLevel = state.currentLevel;
    var description = {
        key: 'motorZPPCheckForSensoryFunctionDescription',
        params: {
            levelName: currentLevel.name,
            lightTouch: currentLevel.lightTouch,
            pinPrick: currentLevel.pinPrick,
        },
    };
    var isTopRange = currentLevel.name === state.topLevel.name;
    if (state.motorLevel.includes(currentLevel.name)) {
        var hasStar = hasStarOnCurrentOrAboveLevel(currentLevel, state.lastLevelWithConsecutiveNormalValues, state.firstLevelWithStar);
        var motorZPPName = "" + currentLevel.name + (hasStar ? '*' : '');
        var overrideWithNonKeyMuscle = state.testNonKeyMuscle && state.nonKeyMuscle !== null && state.nonKeyMuscle.index - currentLevel.index > 3;
        var actions = [
            { key: 'motorZPPCheckForSensoryFunctionLevelIncludedInMotorValuesAction', params: { levelName: currentLevel.name } },
            { key: overrideWithNonKeyMuscle ? 'motorZPPCheckForSensoryFunctionLevelIncludedButOverriddenByNonKeyMuscleAction' : 'motorZPPCheckForSensoryFunctionAddLevelAndContinueAction' },
        ];
        if (isTopRange) {
            actions.push({ key: 'motorZPPCheckForSensoryFunctionTopOfRangeReachedStopAction' });
        }
        return {
            description: description,
            actions: actions,
            state: __assign(__assign({}, state), { zpp: overrideWithNonKeyMuscle ? __spreadArray([], state.zpp) : __spreadArray([motorZPPName], state.zpp), currentLevel: currentLevel.previous, addNonKeyMuscle: state.addNonKeyMuscle || overrideWithNonKeyMuscle }),
            next: isTopRange ? addLowerNonKeyMuscleToMotorZPPIfNeeded : checkLevel,
        };
    }
    return isTopRange
        ? {
            description: description,
            actions: [{ key: 'motorZPPCheckForSensoryFunctionTopOfRangeReachedStopAction' }],
            state: __assign(__assign({}, state), { zpp: __spreadArray([], state.zpp) }),
            next: addLowerNonKeyMuscleToMotorZPPIfNeeded,
        }
        : {
            description: description,
            actions: [{ key: 'motorZPPCheckForSensoryFunctionNoSensoryFunctionFoundContinueAction' }],
            state: __assign(__assign({}, state), { zpp: __spreadArray([], state.zpp), currentLevel: currentLevel.previous }),
            next: checkLevel,
        };
}
/*
 * Branch in the fourth step of the calculation.
 * It produces iteration, by calling `checkLevel`, as with `checkForMotorFunction` and `checkForSensoryFunction` it looks for normal motor function.
 * Looks for motor function in the current level.
 *   - If the level has any normal motor function, it checks if the  non-key muscle overrides it or adds it to ZPP.
 *     When adding, it checks if a star needs to be added.
 *     It then sets `addLowerNonKeyMuscleToMotorZPPIfNeeded` as next step.
 *   - If the motor value is `NT` or contains a `*`, it checks if the  non-key muscle overrides it or adds it to ZPP.
 *     When adding, it checks if a star needs to be added.
 *     It sets `checkLevel` as the next step to continue iterating through the range, or `addLowerNonKeyMuscleToMotorZPPIfNeeded` if we have reached the top level in the range.
 *   - If no normal or `NT | *` value is found, and the `currentLevel` is the `topLevel`, it sets `addLowerNonKeyMuscleToMotorZPPIfNeeded` as next step breaking the iteration.
 *   - If non of the previous cases happen, it sets `checkLevel` as the next step to continue iterating through the range.
 * Could throw one of the following errors:
 *   - state.currentLevel is null. A SideLevel value is required.
 *   - state.currentLevel.motor is null.
 */
function checkForMotorFunction(state) {
    if (!state.currentLevel) {
        throw new Error('checkForMotorFunction :: state.currentLevel is null. A SideLevel value is required.');
    }
    var currentLevel = state.currentLevel;
    if (!currentLevel.motor) {
        throw new Error('checkForMotorFunction :: state.currentLevel.motor is null.');
    }
    var isNonKeyMuscle = state.nonKeyMuscle ? currentLevel.name === state.nonKeyMuscle.name : false;
    var overrideWithNonKeyMuscle = state.testNonKeyMuscle && state.nonKeyMuscle && state.nonKeyMuscle.index - currentLevel.index > 3;
    var description = { key: 'motorZPPCheckForMotorFunctionDescription', params: { levelName: currentLevel.name, motor: currentLevel.motor } };
    var isTopRangeLevel = currentLevel.name === state.topLevel.name;
    // This will skip 0*, which needs to be handled individually
    if (/^[1-5]/.test(currentLevel.motor) || /^(NT|[0-4])\*\*$/.test(currentLevel.motor)) {
        var hasStar = hasStarOnCurrentOrAboveLevel(currentLevel, state.lastLevelWithConsecutiveNormalValues, state.firstLevelWithStar);
        return overrideWithNonKeyMuscle
            ? {
                description: description,
                actions: [{ key: 'motorZPPCheckForMotorFunctionNonKeyMuscleOverrideAndStopAction' }],
                state: __assign(__assign({}, state), { zpp: __spreadArray([], state.zpp), currentLevel: currentLevel.previous, addNonKeyMuscle: true }),
                next: addLowerNonKeyMuscleToMotorZPPIfNeeded,
            }
            : {
                description: description,
                actions: [{ key: 'motorZPPCheckForMotorFunctionAddLevelAndStopAction' }],
                state: __assign(__assign({}, state), { zpp: __spreadArray(["" + currentLevel.name + (hasStar ? '*' : '')], state.zpp), currentLevel: currentLevel.previous, nonKeyMuscleHasBeenAdded: state.nonKeyMuscleHasBeenAdded || isNonKeyMuscle }),
                next: addLowerNonKeyMuscleToMotorZPPIfNeeded,
            };
    }
    if (/^(NT\*?$)|(0\*$)/.test(currentLevel.motor)) {
        var actions = [
            { key: isTopRangeLevel ? 'motorZPPCheckForMotorFunctionStopAtTopAction' : 'motorZPPCheckForMotorFunctionContinueUntilTopAction' },
        ];
        var hasStar = hasStarOnCurrentOrAboveLevel(currentLevel, state.lastLevelWithConsecutiveNormalValues, state.firstLevelWithStar);
        if (hasStar) {
            actions.push({ key: 'motorZPPCheckForMotorFunctionAddStarAction' });
        }
        return overrideWithNonKeyMuscle
            ? {
                description: description,
                actions: __spreadArray([
                    { key: 'motorZPPCheckForMotorFunctionFunctionFoundButKeyMuscleOverrideAction' }
                ], actions),
                state: __assign(__assign({}, state), { zpp: __spreadArray([], state.zpp), currentLevel: currentLevel.previous, addNonKeyMuscle: true }),
                next: isTopRangeLevel ? addLowerNonKeyMuscleToMotorZPPIfNeeded : checkLevel,
            }
            : {
                description: description,
                actions: __spreadArray([
                    { key: 'motorZPPCheckForMotorFunctionAddLevelWithNormalFunctionAndContinue' }
                ], actions),
                state: __assign(__assign({}, state), { zpp: __spreadArray(["" + currentLevel.name + (hasStar ? '*' : '')], state.zpp), currentLevel: currentLevel.previous, nonKeyMuscleHasBeenAdded: state.nonKeyMuscleHasBeenAdded || isNonKeyMuscle }),
                next: isTopRangeLevel ? addLowerNonKeyMuscleToMotorZPPIfNeeded : checkLevel,
            };
    }
    if (currentLevel.name === state.topLevel.name) {
        return {
            description: description,
            actions: [{ key: 'motorZPPCheckForMotorFunctionTopOfRangeReachedStopAction' }],
            state: __assign(__assign({}, state), { currentLevel: currentLevel.previous }),
            next: addLowerNonKeyMuscleToMotorZPPIfNeeded,
        };
    }
    return {
        description: description,
        actions: [{ key: 'motorZPPCheckForMotorFunctionNoFunctionFoundContinueAction' }],
        state: __assign(__assign({}, state), { currentLevel: currentLevel.previous }),
        next: checkLevel,
    };
}
/*
 * This is the fourth step when calculating the Motor ZPP.
 * Checks if it is a sensory or motor level. It then calls either `checkForMotorFunction` or `checkForSensoryFunction`.
 */
function checkLevel(state) {
    var _a;
    return ((_a = state.currentLevel) === null || _a === void 0 ? void 0 : _a.motor)
        ? checkForMotorFunction(state)
        : checkForSensoryFunction(state);
}
/*
 * This is the third step when calculating the Motor ZPP.
 * Using the pre-calculated Motor levels, this method determines the top and bottom levels for our test range.
 * By iterating down the `side`, the method determines the `firstLevelWithStar` and the `lastLevelWithConsecutiveNormalValues`.
 * It also builds a chain of `SideLevels` with only the levels that need testing.
 * It sets `currentLevel = bottom` and a reference to `nonKeyMuscle` if one was specified.
 */
function getTopAndBottomLevelsForCheck(state) {
    var motorLevels = state.motorLevel.replace(/\*/g, '').split(',');
    var top = motorLevels[0];
    var lowestMotorLevel = motorLevels[motorLevels.length - 1];
    // We exclude not normal S1 values as there would be no propagation for that case
    var hasMotorBelowS1 = /(S2|S3|INT)\*?(,|$)/.test(state.motorLevel);
    var bottom = hasMotorBelowS1
        ? lowestMotorLevel === 'INT' ? 'S3' : lowestMotorLevel
        : 'S1';
    var includeS10OrLowerAction = {
        key: hasMotorBelowS1
            ? 'motorZPPGetTopAndBottomLevelsForCheckIncludeBelowS1Action'
            : 'motorZPPGetTopAndBottomLevelsForCheckDoNotIncludeBelowS1Action'
    };
    var _a = getLevelsRange(state.side, top, bottom, state.side.lowestNonKeyMuscleWithMotorFunction ? state.side.lowestNonKeyMuscleWithMotorFunction : null), topLevel = _a.topLevel, bottomLevel = _a.bottomLevel, nonKeyMuscle = _a.nonKeyMuscle, firstLevelWithStar = _a.firstLevelWithStar, lastLevelWithConsecutiveNormalValues = _a.lastLevelWithConsecutiveNormalValues;
    return {
        description: { key: 'motorZPPGetTopAndBottomLevelsForCheckDescription' },
        actions: [
            { key: 'motorZPPGetTopAndBottomLevelsForCheckRangeAction', params: { bottom: bottomLevel.name, top: topLevel.name } },
            includeS10OrLowerAction,
        ],
        state: __assign(__assign({}, state), { topLevel: topLevel,
            bottomLevel: bottomLevel, currentLevel: bottomLevel, nonKeyMuscle: nonKeyMuscle,
            firstLevelWithStar: firstLevelWithStar,
            lastLevelWithConsecutiveNormalValues: lastLevelWithConsecutiveNormalValues, zpp: __spreadArray([], state.zpp) }),
        next: checkLevel,
    };
}
/*
 * This is the second step when calculating the Motor ZPP.
 * Updates the `testNonKeyMuscle` flag of the new state object.
 * If the AIS is C or C* and there is a non-key muscle with motor function, it sets the `testNonKeyMuscle` flag to true.
 * The flag will be used in the next steps to let the algorithm know if the Motor ZPP levels detected need to be tested against the non-key muscle.
 * An AIS C or C* implies that there is sensory function at S4-5 and that the lowest non-key muscle could have influenced the AIS calculation.
 */
function checkLowerNonKeyMuscle(state) {
    // AIS C or C* implies that there is sensory function at S4-5 and that the lowest non-key muscle could have influenced the AIS calculation.
    var testNonKeyMuscle = state.side.lowestNonKeyMuscleWithMotorFunction !== null && /C/i.test(state.ais);
    return {
        description: { key: 'motorZPPCheckLowerNonKeyMuscleDescription' },
        actions: [
            {
                key: testNonKeyMuscle
                    ? 'motorZPPCheckLowerNonKeyMuscleConsiderAction'
                    : 'motorZPPCheckLowerNonKeyMuscleDoNotConsiderAction'
            },
        ],
        state: __assign(__assign({}, state), { zpp: __spreadArray([], state.zpp), testNonKeyMuscle: testNonKeyMuscle }),
        next: getTopAndBottomLevelsForCheck,
    };
}
/*
 * This is the first step when calculating the Motor ZPP.
 * Updates the `zpp` property of the new state object.
 * If the VAC is 'Yes', we add 'NA' to the Motor ZPP and stop.
 * If the VAC is 'NT', we add 'NA' to the Motor ZPP and continue to check for the presence of a non-key muscle.
 * If the VAC is 'No', we leave the Motor ZPP empty and continue to check for the presence of a non-key muscle.
 */
function checkIfMotorZPPIsApplicable(state) {
    var description = { key: 'motorZPPCheckIfMotorZPPIsApplicableDescription' };
    var next = checkLowerNonKeyMuscle;
    if (state.voluntaryAnalContraction === 'Yes') {
        return {
            description: description,
            actions: [{ key: 'motorZPPCheckIfMotorZPPIsApplicableYesAction' }],
            state: __assign(__assign({}, state), { zpp: ['NA'] }),
            next: null,
        };
    }
    if (state.voluntaryAnalContraction === 'NT') {
        return {
            description: description,
            actions: [{ key: 'motorZPPCheckIfMotorZPPIsApplicableNTAction' }],
            state: __assign(__assign({}, state), { zpp: ['NA'] }),
            next: next,
        };
    }
    return {
        description: description,
        actions: [{ key: 'motorZPPCheckIfMotorZPPIsApplicableNoAction' }],
        state: __assign(__assign({}, state), { zpp: __spreadArray([], state.zpp) }),
        next: next,
    };
}
/*
 * Creates a State object ready to be used in the calculation methods.
 * It sets the top, bottom, and lastLevelWithConsecutiveNormalValues levels to C1,
 * the current level to null, and the zpp to empty array.
 */
function getInitialState(side, voluntaryAnalContraction, ais, motorLevel) {
    var c1 = {
        name: 'C1',
        lightTouch: '2',
        pinPrick: '2',
        motor: null,
        index: 0,
        next: null,
        previous: null,
    };
    return {
        ais: ais,
        motorLevel: motorLevel.replace(/\*/g, ''),
        voluntaryAnalContraction: voluntaryAnalContraction,
        zpp: [],
        topLevel: c1,
        bottomLevel: c1,
        currentLevel: null,
        side: side,
        nonKeyMuscle: null,
        nonKeyMuscleHasBeenAdded: false,
        testNonKeyMuscle: false,
        addNonKeyMuscle: false,
        firstLevelWithStar: null,
        lastLevelWithConsecutiveNormalValues: c1,
    };
}
function determineMotorZPP(side, voluntaryAnalContraction, ais, motorLevel) {
    var step = {
        description: { key: 'motorZPPCheckIfMotorZPPIsApplicableDescription' },
        actions: [],
        state: getInitialState(side, voluntaryAnalContraction, ais, motorLevel),
        next: checkIfMotorZPPIsApplicable,
    };
    while (step.next) {
        step = step.next(step.state);
        // ToDo: Add logger
        // console.log(step.description);
        // console.log(step.action);
    }
    return step.state.zpp.join(',');
}

var determineZoneOfPartialPreservations = function (exam, ASIAImpairmentScale, neurologicalLevels) {
    var sensoryRight = determineSensoryZPP(exam.right, exam.deepAnalPressure);
    var sensoryLeft = determineSensoryZPP(exam.left, exam.deepAnalPressure);
    var motorRight = determineMotorZPP(exam.right, exam.voluntaryAnalContraction, ASIAImpairmentScale, neurologicalLevels.motorRight);
    var motorLeft = determineMotorZPP(exam.left, exam.voluntaryAnalContraction, ASIAImpairmentScale, neurologicalLevels.motorLeft);
    return { sensoryRight: sensoryRight, sensoryLeft: sensoryLeft, motorRight: motorRight, motorLeft: motorLeft };
};

var checkLevelWithoutMotor = function (level, leftSensoryResult, rightSensoryResult, variable) {
    var resultLevel;
    if (leftSensoryResult.level || rightSensoryResult.level) {
        if (leftSensoryResult.level && rightSensoryResult.level &&
            leftSensoryResult.level.includes('*') && rightSensoryResult.level.includes('*')) {
            resultLevel = level + '*';
        }
        else {
            resultLevel = level + (variable ? '*' : '');
        }
    }
    return {
        continue: leftSensoryResult.continue && rightSensoryResult.continue,
        level: resultLevel,
        variable: variable || leftSensoryResult.variable || rightSensoryResult.variable,
    };
};
var checkLevelWithMotor = function (exam, level, sensoryResult, variable) {
    var i = SensoryLevels.indexOf(level);
    var index = i - (levelIsBetween(i, 'C4', 'T1') ? 4 : 16);
    var motorLevel = MotorLevels[index];
    var nextMotorLevel = MotorLevels[index + 1];
    var leftMotorResult = level === 'C4' || level === 'L1' ?
        checkMotorLevelBeforeStartOfKeyMuscles(exam.left, level, nextMotorLevel, variable) :
        level === 'T1' || level === 'S1' ?
            checkMotorLevel(exam.left, motorLevel, motorLevel, variable) :
            checkMotorLevel(exam.left, motorLevel, nextMotorLevel, variable);
    var rightMotorResult = level === 'C4' || level === 'L1' ?
        checkMotorLevelBeforeStartOfKeyMuscles(exam.right, level, nextMotorLevel, variable) :
        level === 'T1' || level === 'S1' ?
            checkMotorLevel(exam.right, motorLevel, motorLevel, variable) : // TODO: hot fix
            checkMotorLevel(exam.right, motorLevel, nextMotorLevel, variable);
    var resultLevel;
    if (leftMotorResult.level || rightMotorResult.level || sensoryResult.level) {
        if (leftMotorResult.level && rightMotorResult.level &&
            (leftMotorResult.level.includes('*') || rightMotorResult.level.includes('*'))) {
            resultLevel = level + '*';
        }
        else {
            resultLevel = level + (variable ? '*' : '');
        }
    }
    return !sensoryResult.continue
        ? __assign(__assign({}, sensoryResult), { level: resultLevel }) : {
        continue: leftMotorResult.continue && rightMotorResult.continue,
        level: resultLevel,
        variable: variable || sensoryResult.variable || leftMotorResult.variable || rightMotorResult.variable,
    };
};
var determineNeurologicalLevelOfInjury = function (exam) {
    var listOfNLI = [];
    var variable = false;
    for (var i = 0; i < SensoryLevels.length; i++) {
        var level = SensoryLevels[i];
        var nextLevel = SensoryLevels[i + 1];
        var result = {
            continue: true,
            variable: false,
        };
        if (!nextLevel) {
            listOfNLI.push('INT' + (variable ? '*' : ''));
        }
        else {
            var leftSensoryResult = checkSensoryLevel(exam.left, level, nextLevel, variable);
            var rightSensoryResult = checkSensoryLevel(exam.right, level, nextLevel, variable);
            if (levelIsBetween(i, 'C4', 'T1') || levelIsBetween(i, 'L1', 'S1')) {
                var sensoryResult = checkLevelWithoutMotor(level, leftSensoryResult, rightSensoryResult, variable);
                result = checkLevelWithMotor(exam, level, sensoryResult, variable);
            }
            else {
                result = checkLevelWithoutMotor(level, leftSensoryResult, rightSensoryResult, variable);
            }
            variable = variable || result.variable;
            if (result.level) {
                listOfNLI.push(result.level);
            }
            if (!result.continue) {
                break;
            }
        }
    }
    return listOfNLI.join(',');
};

var determineInjuryComplete = function (exam) {
    var allS4_5Values = [
        exam.right.lightTouch.S4_5,
        exam.right.pinPrick.S4_5,
        exam.left.lightTouch.S4_5,
        exam.left.pinPrick.S4_5
    ];
    if (exam.voluntaryAnalContraction === 'No' && exam.deepAnalPressure === 'No') {
        if (allS4_5Values.every(function (v) { return v === '0'; })) {
            return 'C';
        }
        else if (allS4_5Values.every(function (v) { return ['0', '0*'].includes(v); })) {
            return 'C*,I*';
        }
        else if (allS4_5Values.every(function (v) { return ['0', '0**'].includes(v); })) {
            return 'I*';
        }
    }
    if (exam.voluntaryAnalContraction !== 'Yes' &&
        exam.deepAnalPressure !== 'Yes' &&
        allS4_5Values.every(canBeAbsentSensory)) {
        return 'C,I';
    }
    else {
        return 'I';
    }
};

var startingMotorIndex = function (sensoryIndex) {
    return levelIsBetween(sensoryIndex, 'C2', 'C4') ? 0 :
        levelIsBetween(sensoryIndex, 'C5', 'T1') ? sensoryIndex - 4 :
            levelIsBetween(sensoryIndex, 'T2', 'L1') ? 5 :
                levelIsBetween(sensoryIndex, 'L2', 'S1') ? sensoryIndex - 16 : MotorLevels.length;
};
var isSensoryPreserved = function (exam) {
    var sensoryAtS45 = [
        exam.right.lightTouch.S4_5,
        exam.right.pinPrick.S4_5,
        exam.left.lightTouch.S4_5,
        exam.left.pinPrick.S4_5,
    ];
    return {
        result: exam.deepAnalPressure !== 'No' ||
            exam.right.lightTouch.S4_5 !== '0' || exam.right.pinPrick.S4_5 !== '0' ||
            exam.left.lightTouch.S4_5 !== '0' || exam.left.pinPrick.S4_5 !== '0',
        variable: exam.deepAnalPressure === 'No' && !sensoryAtS45.every(function (v) { return v === '0'; }) && sensoryAtS45.every(function (v) { return ['0', '0*', '0**'].includes(v); }),
    };
};

var canBeInjuryComplete = function (injuryComplete) { return injuryComplete.includes('C'); };
var checkASIAImpairmentScaleA = function (injuryComplete) {
    if (canBeInjuryComplete(injuryComplete)) {
        if (injuryComplete.includes('*')) {
            return 'A*';
        }
        else {
            return 'A';
        }
    }
};

/**
 * ```!['0', 'NT', 'NT*', '0*'].includes(value)```
 */
var canBeNoPreservedMotor = function (value) { return !['0', 'NT', 'NT*', '0*'].includes(value); };
var canHaveNoMotorFunctionMoreThanThreeLevelsBelow = function (motor, motorLevel, lowestNonKeyMuscleWithMotorFunction) {
    var variable = false;
    for (var _i = 0, _a = motorLevel.split(','); _i < _a.length; _i++) {
        var m = _a[_i];
        var index = m === 'INT' || m === 'INT*' ? SensoryLevels.indexOf('S4_5') : SensoryLevels.indexOf(m.replace('*', '')) + 4;
        var startingIndex = startingMotorIndex(index);
        var thereCanBeNoMotorFunction = true;
        for (var i = startingIndex; i < MotorLevels.length; i++) {
            var level = MotorLevels[i];
            if (motor[level] === '0*' || motor[level] === '0**') {
                variable = true;
            }
            if (canBeNoPreservedMotor(motor[level]) || level === lowestNonKeyMuscleWithMotorFunction) {
                thereCanBeNoMotorFunction = false;
                if (motor[level] === '0*') {
                    variable = true;
                }
                break;
            }
        }
        if (thereCanBeNoMotorFunction) {
            return {
                result: true,
                variable: variable,
            };
        }
    }
    return {
        result: false,
        variable: false,
    };
};
var motorCanBeNotPreserved = function (exam, neurologicalLevels) {
    var leftMotorFunctionResult = canHaveNoMotorFunctionMoreThanThreeLevelsBelow(exam.left.motor, neurologicalLevels.motorLeft, exam.left.lowestNonKeyMuscleWithMotorFunction);
    var rightMotorFunctionResult = canHaveNoMotorFunctionMoreThanThreeLevelsBelow(exam.right.motor, neurologicalLevels.motorRight, exam.right.lowestNonKeyMuscleWithMotorFunction);
    return {
        result: exam.voluntaryAnalContraction !== 'Yes' &&
            rightMotorFunctionResult.result &&
            leftMotorFunctionResult.result,
        variable: exam.voluntaryAnalContraction === 'No' &&
            (leftMotorFunctionResult.variable || rightMotorFunctionResult.variable),
    };
};
/**
 * Check AIS can be B i.e. Is injury Motor Complete?
 */
var canBeSensoryIncomplete = function (exam, neurologicalLevels) {
    var isSensoryPreservedResult = isSensoryPreserved(exam);
    var motorCanBeNotPreservedResult = motorCanBeNotPreserved(exam, neurologicalLevels);
    return {
        result: isSensoryPreservedResult.result && motorCanBeNotPreservedResult.result,
        variable: isSensoryPreservedResult.variable || motorCanBeNotPreservedResult.variable,
    };
};
var checkASIAImpairmentScaleB = function (exam, neurologicalLevels) {
    var canBeSensoryIncompleteResult = canBeSensoryIncomplete(exam, neurologicalLevels);
    if (canBeSensoryIncompleteResult.result) {
        if (canBeSensoryIncompleteResult.variable) {
            return 'B*';
        }
        else {
            return 'B';
        }
    }
};

/**
 * removes all *'s found in the exam values
 */
var removeStars = function (exam) {
    return JSON.parse(JSON.stringify(exam).replace(/\*/g, ''));
};

var canHaveMuscleGradeLessThan3 = function (value) { return ['0', '1', '2', 'NT', 'NT*'].includes(value); };
var canHaveVariableMuscleGradeLessThan3 = function (value) { return ['0*', '1*', '2*'].includes(value); };
/**
 * Means in other words more than half of key muscles below NLI can have MuscleGradeLessThan3
 */
var canHaveLessThanHalfOfKeyMuscleFunctionsBelowNLIHaveMuscleGradeAtLeast3 = function (exam, neurologicalLevelOfInjury) {
    for (var _i = 0, _a = neurologicalLevelOfInjury.replace(/\*/g, '').split(','); _i < _a.length; _i++) {
        var nli = _a[_i];
        var indexOfNLI = nli === 'INT' || nli === 'INT*' ? SensoryLevels.indexOf('S4_5') : SensoryLevels.indexOf(nli);
        var startIndex = startingMotorIndex(indexOfNLI + 1);
        var half = MotorLevels.length - startIndex;
        var count = 0;
        var variableCount = 0;
        for (var i = startIndex; i < MotorLevels.length; i++) {
            var level = MotorLevels[i];
            if (canHaveMuscleGradeLessThan3(exam.left.motor[level])) {
                count++;
            }
            else if (canHaveVariableMuscleGradeLessThan3(exam.left.motor[level])) {
                count++;
                variableCount++;
            }
            if (canHaveMuscleGradeLessThan3(exam.right.motor[level])) {
                count++;
            }
            else if (canHaveVariableMuscleGradeLessThan3(exam.right.motor[level])) {
                count++;
                variableCount++;
            }
            if (count - variableCount > half) {
                return {
                    result: true,
                    variable: false,
                };
            }
        }
        if (count > half && count - variableCount <= half) {
            return {
                result: true,
                variable: true,
            };
        }
    }
    return {
        result: false,
        variable: false,
    };
};
var checkASIAImpairmentScaleC = function (exam, neurologicalLevelOfInjury, canBeMotorIncompleteResult) {
    var examWithStarsRemoved = removeStars(exam);
    var nliWithStarsRemoved = determineNeurologicalLevelOfInjury(examWithStarsRemoved);
    var motorFunctionCWithStarsRemoved = canHaveLessThanHalfOfKeyMuscleFunctionsBelowNLIHaveMuscleGradeAtLeast3(examWithStarsRemoved, nliWithStarsRemoved);
    var motorFunctionC = canHaveLessThanHalfOfKeyMuscleFunctionsBelowNLIHaveMuscleGradeAtLeast3(exam, neurologicalLevelOfInjury);
    if (motorFunctionC.result) {
        if (motorFunctionC.variable || canBeMotorIncompleteResult.variable || !motorFunctionCWithStarsRemoved.result) {
            return 'C*';
        }
        else {
            return 'C';
        }
    }
};

/**
 * ```!['0', '1', '2'].includes(value)```
 */
var canHaveMuscleGradeAtLeast3 = function (value) { return !['0', '1', '2'].includes(value); };
/**
 * ```['0*', '1*', '2*', '0**', '1**', '2**'].includes(value)```
 */
var canHaveVariableMuscleGradeAtLeast3 = function (value) { return ['0*', '1*', '2*', '0**', '1**', '2**'].includes(value); };
var canHaveAtLeastHalfOfKeyMuscleFunctionsBelowNLIHaveMuscleGradeAtLeast3 = function (exam, neurologicalLevelOfInjury) {
    var result = {
        result: false,
        variable: false,
    };
    for (var _i = 0, _a = neurologicalLevelOfInjury.replace(/\*/g, '').split(','); _i < _a.length; _i++) {
        var nli = _a[_i];
        if (nli === 'INT') {
            break;
        }
        var indexOfNLI = SensoryLevels.indexOf(nli);
        var startIndex = startingMotorIndex(indexOfNLI + 1);
        var half = MotorLevels.length - startIndex;
        if (half === 0) {
            return {
                result: true,
                variable: false,
            };
        }
        var count = 0;
        var variableCount = 0;
        for (var i = startIndex; i < MotorLevels.length; i++) {
            var level = MotorLevels[i];
            count += canHaveMuscleGradeAtLeast3(exam.left.motor[level]) ? 1 : 0;
            count += canHaveMuscleGradeAtLeast3(exam.right.motor[level]) ? 1 : 0;
            variableCount += canHaveVariableMuscleGradeAtLeast3(exam.left.motor[level]) ? 1 : 0;
            variableCount += canHaveVariableMuscleGradeAtLeast3(exam.right.motor[level]) ? 1 : 0;
            if (count - variableCount >= half) {
                return {
                    result: true,
                    variable: false,
                };
            }
        }
        if (count >= half) {
            result.result = true;
            result.variable = result.variable || count - variableCount < half;
        }
    }
    return result;
};
var checkASIAImpairmentScaleD = function (exam, neurologicalLevelOfInjury, canBeMotorIncompleteResult) {
    var motorFunctionD = canHaveAtLeastHalfOfKeyMuscleFunctionsBelowNLIHaveMuscleGradeAtLeast3(exam, neurologicalLevelOfInjury);
    if (motorFunctionD.result) {
        if (motorFunctionD.variable || canBeMotorIncompleteResult.variable) {
            return 'D*';
        }
        else {
            return 'D';
        }
    }
};

var checkASIAImpairmentScaleE = function (neurologicalLevelOfInjury, voluntaryAnalContraction) {
    if (voluntaryAnalContraction !== 'No') {
        if (neurologicalLevelOfInjury.includes('INT*')) {
            return 'E*';
        }
        else if (neurologicalLevelOfInjury.includes('INT')) {
            return 'E';
        }
        else {
            return;
        }
    }
};

/**
 * exam.voluntaryAnalContraction !== 'No'
 */
var motorFunctionCanBePreserved = function (exam) { return exam.voluntaryAnalContraction !== 'No'; };
var canHaveMotorFunctionMoreThanThreeLevelsBelow = function (motor, motorLevel, lowestNonKeyMuscleWithMotorFunction) {
    var variable = false;
    for (var _i = 0, _a = motorLevel.split(','); _i < _a.length; _i++) {
        var m = _a[_i];
        var index = m === 'INT' || m === 'INT*' ? SensoryLevels.indexOf('S4_5') : SensoryLevels.indexOf(m.replace('*', '')) + 4;
        var startingIndex = startingMotorIndex(index);
        for (var i = startingIndex; i < MotorLevels.length; i++) {
            var level = MotorLevels[i];
            if (motor[level] === '0**') {
                variable = true;
            }
            if (motor[level] !== '0' || level === lowestNonKeyMuscleWithMotorFunction) {
                return {
                    result: true,
                    variable: variable,
                };
            }
        }
    }
    return {
        result: variable,
        variable: variable,
    };
};
var canBeMotorIncomplete = function (exam, neurologicalLevels) {
    var result = {
        result: false,
        variable: false,
    };
    if (motorFunctionCanBePreserved(exam)) {
        result.result = true;
        return result;
    }
    var isSensoryPreservedResult = isSensoryPreserved(exam);
    if (isSensoryPreservedResult.result) {
        var rightMotorFunctionResult = canHaveMotorFunctionMoreThanThreeLevelsBelow(exam.right.motor, neurologicalLevels.motorRight, exam.right.lowestNonKeyMuscleWithMotorFunction);
        var leftMotorFunctionResult = canHaveMotorFunctionMoreThanThreeLevelsBelow(exam.left.motor, neurologicalLevels.motorLeft, exam.left.lowestNonKeyMuscleWithMotorFunction);
        if (rightMotorFunctionResult.result || leftMotorFunctionResult.result) {
            result.result = true;
            if (rightMotorFunctionResult.variable || leftMotorFunctionResult.variable) {
                result.variable = true;
            }
        }
    }
    return result;
};
var determineASIAImpairmentScale = function (exam, injuryComplete, neurologicalLevels, neurologicalLevelOfInjury) {
    // check isNormal because description of canBeMotorIncompleteD overlaps on canBeNormal
    if (neurologicalLevelOfInjury === 'INT' && exam.voluntaryAnalContraction === 'Yes') {
        return 'E';
    }
    else if (neurologicalLevelOfInjury === 'INT*' && exam.voluntaryAnalContraction === 'Yes') {
        return 'E*';
    }
    else {
        var possibleASIAImpairmentScales = [];
        var resultA = checkASIAImpairmentScaleA(injuryComplete);
        if (resultA) {
            possibleASIAImpairmentScales.push(resultA);
        }
        var resultB = checkASIAImpairmentScaleB(exam, neurologicalLevels);
        if (resultB) {
            possibleASIAImpairmentScales.push(resultB);
        }
        var canBeMotorIncompleteResult = canBeMotorIncomplete(exam, neurologicalLevels);
        if (canBeMotorIncompleteResult.result) {
            var resultC = checkASIAImpairmentScaleC(exam, neurologicalLevelOfInjury, canBeMotorIncompleteResult);
            if (resultC) {
                possibleASIAImpairmentScales.push(resultC);
            }
            var resultD = checkASIAImpairmentScaleD(exam, neurologicalLevelOfInjury, canBeMotorIncompleteResult);
            if (resultD) {
                possibleASIAImpairmentScales.push(resultD);
            }
        }
        var resultE = checkASIAImpairmentScaleE(neurologicalLevelOfInjury, exam.voluntaryAnalContraction);
        if (resultE) {
            possibleASIAImpairmentScales.push(resultE);
        }
        return possibleASIAImpairmentScales.join(',');
    }
};

var classify = function (exam) {
    var neurologicalLevels = determineNeurologicalLevels(exam);
    var neurologicalLevelOfInjury = determineNeurologicalLevelOfInjury(exam);
    var injuryComplete = determineInjuryComplete(exam);
    var ASIAImpairmentScale = determineASIAImpairmentScale(exam, injuryComplete, neurologicalLevels, neurologicalLevelOfInjury);
    var zoneOfPartialPreservations = determineZoneOfPartialPreservations(exam, ASIAImpairmentScale, neurologicalLevels);
    return { neurologicalLevels: neurologicalLevels, neurologicalLevelOfInjury: neurologicalLevelOfInjury, injuryComplete: injuryComplete, ASIAImpairmentScale: ASIAImpairmentScale, zoneOfPartialPreservations: zoneOfPartialPreservations };
};

var NOT_DETERMINABLE = 'ND';
var addValues = function () {
    var values = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        values[_i] = arguments[_i];
    }
    if (values.includes(NaN)) {
        throw values[values.indexOf(NaN)] + " is not a valid value";
    }
    var sum = values.reduce(function (sum, v) { return sum += v; }, 0);
    return sum.toString();
};
var calculateMotorTotal = function (motor, option) {
    var values;
    if (option === 'all') {
        values = Object.values(motor);
    }
    else if (option === 'upper') {
        values = [motor.C5, motor.C6, motor.C7, motor.C8, motor.T1];
    }
    else if (option === 'lower') {
        values = [motor.L2, motor.L3, motor.L4, motor.L5, motor.S1];
    }
    if (!values) {
        throw "option should be one of 'all' | 'upper' | 'lower'";
    }
    if (values.some(function (v) { return ['NT', 'NT*', 'NT**'].includes(v); })) {
        return NOT_DETERMINABLE;
    }
    else {
        var total = addValues.apply(void 0, values.map(function (v) { return parseInt(v.replace(/\*/g, '')); }));
        return total;
    }
};
var calculateSensoryTotal = function (sensory) {
    var values = Object.values(sensory);
    if (values.some(function (v) { return ['NT', 'NT*', 'NT**'].includes(v); })) {
        return NOT_DETERMINABLE;
    }
    else {
        var total = addValues.apply(void 0, values.map(function (v) { return parseInt(v.replace(/\*/g, '')); }));
        return total;
    }
};
var addTotals = function () {
    var values = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        values[_i] = arguments[_i];
    }
    if (values.includes(NOT_DETERMINABLE)) {
        return NOT_DETERMINABLE;
    }
    else {
        var total = addValues.apply(void 0, values.map(function (v) { return parseInt(v.replace(/\*/g, '')); }));
        return total + (values.some(function (v) { return v.includes('*'); }) ? '*' : '');
    }
};
var calculateSideTotals = function (side) {
    var motor = calculateMotorTotal(side.motor, 'all');
    var upperExtremity = calculateMotorTotal(side.motor, 'upper');
    var lowerExtremity = calculateMotorTotal(side.motor, 'lower');
    var lightTouch = calculateSensoryTotal(side.lightTouch);
    var pinPrick = calculateSensoryTotal(side.pinPrick);
    return { upperExtremity: upperExtremity, lowerExtremity: lowerExtremity, lightTouch: lightTouch, pinPrick: pinPrick, motor: motor };
};
var calculateTotals = function (exam) {
    var left = calculateSideTotals(exam.left);
    var right = calculateSideTotals(exam.right);
    var upperExtremity = addTotals(right.upperExtremity, left.upperExtremity);
    var lowerExtremity = addTotals(right.lowerExtremity, left.lowerExtremity);
    var lightTouch = addTotals(right.lightTouch, left.lightTouch);
    var pinPrick = addTotals(right.pinPrick, left.pinPrick);
    return {
        left: left,
        right: right,
        upperExtremity: upperExtremity,
        lowerExtremity: lowerExtremity,
        lightTouch: lightTouch,
        pinPrick: pinPrick,
    };
};

var ISNCSCI = /** @class */ (function () {
    function ISNCSCI(exam) {
        this.classification = classify(exam);
        this.totals = calculateTotals(exam);
    }
    return ISNCSCI;
}());

export default ISNCSCI;
export { ISNCSCI };


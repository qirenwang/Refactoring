'use strict';

const PERCENTAGE_DECIMAL_PLACES = 4;
const PERCENTAGE_TOLERANCE = 0.1;
const PERCENTAGE_SCALE = 10 ** PERCENTAGE_DECIMAL_PLACES;

function isBlankPercentage(value) {
    return value === undefined || value === null ||
        (typeof value === 'string' && value.trim() === '');
}

function parsePercentage(value, fieldName = 'Percentage') {
    if (isBlankPercentage(value)) {
        return null;
    }

    if (typeof value !== 'number' && typeof value !== 'string') {
        throw new TypeError(`${fieldName} must be a number.`);
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new TypeError(`${fieldName} must be a number.`);
    }
    if (parsed < 0 || parsed > 100) {
        throw new RangeError(`${fieldName} must be between 0 and 100.`);
    }

    return Number(parsed.toFixed(PERCENTAGE_DECIMAL_PLACES));
}

function sumPercentages(values, fieldName = 'Percentage') {
    return values.reduce((total, value) => {
        const parsed = parsePercentage(value, fieldName);
        return total + (parsed === null ? 0 : parsed);
    }, 0);
}

function isPercentageTotalValid(total, tolerance = PERCENTAGE_TOLERANCE) {
    if (!Number.isFinite(total) || !Number.isFinite(tolerance) || tolerance < 0) {
        return false;
    }

    // Compare fixed-point units so binary floating-point noise cannot turn a
    // boundary value such as 99.9 into an inconsistent pass/fail result.
    const totalUnits = Math.round(total * PERCENTAGE_SCALE);
    const expectedUnits = 100 * PERCENTAGE_SCALE;
    const toleranceUnits = Math.round(tolerance * PERCENTAGE_SCALE);
    return Math.abs(totalUnits - expectedUnits) <= toleranceUnits;
}

function toDatabasePercentage(value, fieldName = 'Percentage') {
    const parsed = parsePercentage(value, fieldName);
    return parsed === null ? null : parsed.toFixed(PERCENTAGE_DECIMAL_PLACES);
}

module.exports = {
    PERCENTAGE_DECIMAL_PLACES,
    PERCENTAGE_TOLERANCE,
    isBlankPercentage,
    isPercentageTotalValid,
    parsePercentage,
    sumPercentages,
    toDatabasePercentage
};

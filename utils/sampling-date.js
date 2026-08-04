const {
    formatPartialDate,
    formatPartialDateKey,
    validateDateOrder,
    validateDateParts
} = require('../public/js/partial-date-utils');

function hasSubmittedValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function readDateParts(formData, prefix) {
    return {
        year: formData[`${prefix}_year`],
        month: formData[`${prefix}_month`],
        day: formData[`${prefix}_day`]
    };
}

function createRequestError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function normalizeSamplingEventDates(formData = {}) {
    const mode = formData.device_installation_period || 'no';
    if (!['no', 'yes'].includes(mode)) {
        throw createRequestError('Device installation period must be yes or no.');
    }

    const startLabel = mode === 'yes'
        ? 'Device installation start date'
        : 'Plastic collection date';
    const startResult = validateDateParts(readDateParts(formData, 'start'), {
        label: startLabel
    });
    if (!startResult.valid) {
        throw createRequestError(startResult.errors[0]);
    }

    const rawEnd = readDateParts(formData, 'end');
    const hasEndValue = Object.values(rawEnd).some(hasSubmittedValue);
    if (mode === 'no' && hasEndValue) {
        throw createRequestError(
            'Device removal/end date must be blank for a single collection event.'
        );
    }

    let endResult = {
        year: null,
        month: null,
        day: null,
        precision: null
    };
    if (mode === 'yes') {
        endResult = validateDateParts(rawEnd, {
            label: 'Device removal/end date'
        });
        if (!endResult.valid) {
            throw createRequestError(endResult.errors[0]);
        }

        const orderResult = validateDateOrder(startResult, endResult);
        if (!orderResult.valid) {
            throw createRequestError(orderResult.errors[0]);
        }
    }

    return {
        mode,
        start: {
            year: startResult.year,
            month: startResult.month,
            day: startResult.day,
            precision: startResult.precision
        },
        end: {
            year: endResult.year,
            month: endResult.month,
            day: endResult.day,
            precision: endResult.precision
        }
    };
}

function getRowStartDateParts(row) {
    return {
        year: row.start_year ?? row.collection_year ?? row.StartYear,
        month: row.start_month ?? row.collection_month ?? row.StartMonth,
        day: row.start_day ?? row.collection_day ?? row.StartDay
    };
}

function getRowEndDateParts(row) {
    return {
        year: row.end_year ?? row.EndYear,
        month: row.end_month ?? row.EndMonth,
        day: row.end_day ?? row.EndDay
    };
}

function addPartialDatePresentation(row) {
    const startParts = getRowStartDateParts(row);
    const endParts = getRowEndDateParts(row);
    const startKey = formatPartialDateKey(startParts);
    const endKey = formatPartialDateKey(endParts);
    const startDisplay = formatPartialDate(startParts);
    const endDisplay = formatPartialDate(endParts);
    const deviceInstallationPeriod =
        row.device_installation_period ?? row.DeviceInstallationPeriod ?? 'no';

    return {
        ...row,
        start_year: startParts.year ?? null,
        start_month: startParts.month ?? null,
        start_day: startParts.day ?? null,
        collection_year: startParts.year ?? null,
        collection_month: startParts.month ?? null,
        collection_day: startParts.day ?? null,
        end_year: endParts.year ?? null,
        end_month: endParts.month ?? null,
        end_day: endParts.day ?? null,
        start_date: startKey || null,
        start_date_display: startDisplay,
        end_date: endKey || null,
        end_date_display: endKey ? endDisplay : null,
        collection_date: startKey || null,
        collection_date_key: startKey || null,
        collection_date_display:
            deviceInstallationPeriod === 'yes' && endKey
                ? `${startDisplay} – ${endDisplay}`
                : startDisplay
    };
}

module.exports = {
    addPartialDatePresentation,
    normalizeSamplingEventDates
};

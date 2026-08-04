(function attachPartialDateUtils(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.PartialDateUtils = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPartialDateUtils() {
    const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    function isBlank(value) {
        return value === undefined || value === null || String(value).trim() === '';
    }

    function parsePart(value) {
        if (isBlank(value)) return null;
        if (typeof value === 'number') {
            return Number.isInteger(value) ? value : Number.NaN;
        }

        const normalized = String(value).trim();
        if (!/^\d+$/.test(normalized)) return Number.NaN;
        return Number.parseInt(normalized, 10);
    }

    function isLeapYear(year) {
        return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    }

    function daysInMonth(year, month) {
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return null;
        }
        if (month === 2) return isLeapYear(year) ? 29 : 28;
        return [4, 6, 9, 11].includes(month) ? 30 : 31;
    }

    function validateDateParts(parts, options = {}) {
        const label = options.label || 'Date';
        const requireYear = options.requireYear !== false;
        const year = parsePart(parts?.year);
        const month = parsePart(parts?.month);
        const day = parsePart(parts?.day);
        const errors = [];

        if (requireYear && year === null) {
            errors.push(`${label} year is required.`);
        } else if (year !== null && (!Number.isInteger(year) || year < 1000 || year > 9999)) {
            errors.push(`${label} year must be a four-digit year.`);
        }

        if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
            errors.push(`${label} month must be between 1 and 12.`);
        }

        if (day !== null && month === null) {
            errors.push(`${label} day cannot be provided without a month.`);
        } else if (day !== null && year !== null && month !== null) {
            const maximumDay = daysInMonth(year, month);
            if (!Number.isInteger(day) || day < 1 || day > maximumDay) {
                errors.push(`${label} day must be between 1 and ${maximumDay}.`);
            }
        } else if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
            errors.push(`${label} day must be between 1 and 31.`);
        }

        let precision = null;
        if (year !== null && Number.isInteger(year)) {
            precision = month === null ? 'year' : (day === null ? 'month' : 'day');
        }

        return {
            valid: errors.length === 0,
            errors,
            year,
            month,
            day,
            precision
        };
    }

    function lastDayForParts(parts) {
        if (parts.day !== null) return parts.day;
        if (parts.month !== null) return daysInMonth(parts.year, parts.month);
        return 31;
    }

    function firstMonthForParts(parts) {
        return parts.month === null ? 1 : parts.month;
    }

    function lastMonthForParts(parts) {
        return parts.month === null ? 12 : parts.month;
    }

    function comparableValue(year, month, day) {
        return (year * 10000) + (month * 100) + day;
    }

    function getDateRange(parts) {
        const result = validateDateParts(parts);
        if (!result.valid) return null;

        const firstMonth = firstMonthForParts(result);
        const lastMonth = lastMonthForParts(result);
        const firstDay = result.day === null ? 1 : result.day;
        const lastDay = lastDayForParts(result);

        return {
            earliest: comparableValue(result.year, firstMonth, firstDay),
            latest: comparableValue(result.year, lastMonth, lastDay)
        };
    }

    function validateDateOrder(startParts, endParts) {
        const startResult = validateDateParts(startParts, { label: 'Start date' });
        const endResult = validateDateParts(endParts, { label: 'End date' });

        if (!startResult.valid || !endResult.valid) {
            return {
                valid: false,
                ambiguous: false,
                errors: [...startResult.errors, ...endResult.errors]
            };
        }

        const startRange = getDateRange(startResult);
        const endRange = getDateRange(endResult);
        if (endRange.latest <= startRange.earliest) {
            return {
                valid: false,
                ambiguous: false,
                errors: ['Device removal/end date must be after the installation start date.']
            };
        }

        return {
            valid: true,
            ambiguous: endRange.earliest <= startRange.latest,
            errors: []
        };
    }

    function formatPartialDate(parts, options = {}) {
        const emptyLabel = options.emptyLabel || 'N/A';
        const result = validateDateParts(parts, { requireYear: false });
        if (!result.valid || result.year === null) return emptyLabel;
        if (result.month === null) return String(result.year);

        const monthName = MONTH_NAMES[result.month - 1];
        if (result.day === null) return `${monthName} ${result.year}`;
        return `${monthName} ${result.day}, ${result.year}`;
    }

    function formatPartialDateKey(parts) {
        const result = validateDateParts(parts, { requireYear: false });
        if (!result.valid || result.year === null) return '';
        const year = String(result.year).padStart(4, '0');
        if (result.month === null) return year;
        const month = String(result.month).padStart(2, '0');
        if (result.day === null) return `${year}-${month}`;
        return `${year}-${month}-${String(result.day).padStart(2, '0')}`;
    }

    return {
        MONTH_NAMES,
        daysInMonth,
        formatPartialDate,
        formatPartialDateKey,
        getDateRange,
        isLeapYear,
        parsePart,
        validateDateOrder,
        validateDateParts
    };
}));

(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.DataSummaryUtils = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function normalizeReferenceCode(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function hasSummaryValue(value) {
        if (value === undefined || value === null) return false;
        return typeof value !== 'string' || value.trim() !== '';
    }

    function humanizeFieldSuffix(value) {
        return String(value || '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase());
    }

    function formatPolymerLabel(polymer = {}, fallbackCode = '') {
        const code = String(polymer.Polymer_Code || fallbackCode || '').trim();
        const fullName = String(polymer.Polymer_FullName || '').trim();
        const recycleCode = polymer.RecycleCode;
        const name = fullName && fullName.toLowerCase() !== code.toLowerCase()
            ? `${code} - ${fullName}`
            : code;
        const recycleLabel = recycleCode !== undefined &&
            recycleCode !== null &&
            String(recycleCode).trim() !== ''
            ? ` #${recycleCode}`
            : '';

        return `${name || 'Polymer Type'}${recycleLabel} (%)`;
    }

    function getPolymerSummaryEntries(formState = {}, prefix, polymers = []) {
        const enteredFields = Object.keys(formState)
            .filter(field => field.startsWith(prefix) && hasSummaryValue(formState[field]));
        const remainingFields = new Set(enteredFields);
        const entries = [];

        Array.from(polymers || []).forEach(polymer => {
            const normalizedCode = normalizeReferenceCode(polymer?.Polymer_Code);
            if (!normalizedCode) return;

            const field = `${prefix}${normalizedCode}`;
            if (!remainingFields.has(field)) return;

            entries.push({
                field,
                label: formatPolymerLabel(polymer),
                value: formState[field]
            });
            remainingFields.delete(field);
        });

        Array.from(remainingFields)
            .sort((left, right) => left.localeCompare(right))
            .forEach(field => {
                const suffix = field.slice(prefix.length);
                const isOtherSpecification = suffix.endsWith('_other_specify') ||
                    suffix === 'other_specify';
                entries.push({
                    field,
                    label: isOtherSpecification
                        ? 'Other Polymer Type (specified)'
                        : `${humanizeFieldSuffix(suffix)} (%)`,
                    value: formState[field]
                });
            });

        return entries;
    }

    function resolveMethodLabel(value, methods = [], fallbackLabel = '') {
        if (!hasSummaryValue(value)) return '';

        const method = Array.from(methods || []).find(item =>
            String(item?.MethodsUniqueID ?? item?.methodsUniqueId ?? item?.id ?? '') ===
            String(value)
        );
        if (method) {
            return String(
                method.Method_Label ||
                method.Method_Code ||
                method.label ||
                method.code ||
                value
            );
        }

        const fallback = String(fallbackLabel || '').trim();
        if (fallback && !fallback.startsWith('--')) {
            return fallback;
        }

        return `Unknown method (ID ${value})`;
    }

    function firstSummaryValue(state, fields) {
        for (const field of fields) {
            if (hasSummaryValue(state?.[field])) {
                return state[field];
            }
        }
        return '';
    }

    function buildParticleSummary(formState = {}, referenceData = {}) {
        const polymers = referenceData.polymers || [];
        const methods = referenceData.methods || [];

        return {
            microplastics: {
                count: formState.microplastics_count,
                mass: formState.micro_mass_mp_total,
                polymers: getPolymerSummaryEntries(formState, 'mp_polymer_', polymers),
                polymerMethod: resolveMethodLabel(
                    firstSummaryValue(formState, [
                        'micro_method_polymer_num',
                        'micro_methodPolymerNum'
                    ]),
                    methods
                ),
                percentMethod: resolveMethodLabel(
                    formState.micro_method_percent_estimate,
                    methods
                )
            },
            fragments: {
                count: formState.fragments_count,
                mass: formState.fragments_mass_debris_total,
                polymers: getPolymerSummaryEntries(formState, 'fragment_polymer_', polymers),
                polymerMethod: resolveMethodLabel(
                    firstSummaryValue(formState, [
                        'fragments_method_polymer_num',
                        'fragments_methodPolymerNum'
                    ]),
                    methods
                ),
                percentMethod: resolveMethodLabel(
                    formState.fragments_method_percent_estimate,
                    methods
                )
            }
        };
    }

    function getDetailMethodLabels(rows = [], methods = []) {
        const methodIds = [];
        Array.from(rows || []).forEach(row => {
            const methodId = row?.method_percent_estimate ?? row?.methodPercentEstimate;
            if (!hasSummaryValue(methodId)) return;
            if (!methodIds.some(value => String(value) === String(methodId))) {
                methodIds.push(methodId);
            }
        });

        return methodIds.map(methodId => resolveMethodLabel(methodId, methods));
    }

    function resolveSectionEditPage(sectionTitle) {
        if (sectionTitle === 'Location Information') return 1;
        if (sectionTitle === 'Sampling Event Information') return 2;
        if (sectionTitle === 'Sampling Weather Conditions') return 2;
        if (sectionTitle === 'Media Information') return 3;
        if (sectionTitle === 'Data Validation Status') return 6;
        if (sectionTitle === 'Submission Notes') return 6;
        if (
            sectionTitle === 'Other Information' ||
            sectionTitle === 'Environmental Conditions' ||
            sectionTitle.startsWith('Additional ')
        ) {
            return 4;
        }
        return 5;
    }

    return {
        buildParticleSummary,
        formatPolymerLabel,
        getDetailMethodLabels,
        getPolymerSummaryEntries,
        hasSummaryValue,
        normalizeReferenceCode,
        resolveMethodLabel,
        resolveSectionEditPage
    };
}));

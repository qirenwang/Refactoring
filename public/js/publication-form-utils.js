(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.PublicationFormUtils = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Data-source rules shared by the entry form (browser) and routes/api.js
    // (Node), so both sides accept the same input and give the same messages.
    // They mirror the DataSourceReference CHECK constraints added by
    // db/20261105_redesign_data_source_tables.sql: types 1-4 are Published and
    // need a publication year, types 5-8 are Unpublished and must not have one,
    // and only type 4 (Public Database or Data Repository) has an access date.
    // Title, authors/organization, journal/publisher/repository and the APA
    // citation are required here only; their columns stay nullable.
    const PUBLISHED_SOURCE_TYPE_IDS = [1, 2, 3, 4];
    const UNPUBLISHED_SOURCE_TYPE_IDS = [5, 6, 7, 8];
    const DATE_ACCESSED_SOURCE_TYPE_ID = 4;
    const DATA_SOURCE_TEXT_LIMITS = {
        sourceTitle: ['Source title', 500],
        sourceIdentifierOrUrl: ['Source identifier or URL', 500],
        projectOrCollectionName: ['Project or collection name', 255]
    };
    // Publication years run from 1900 to next year (in-press work); the upper
    // bound follows the calendar, so it is read when a check runs.
    const MIN_PUBLICATION_YEAR = 1900;
    const PLAIN_INTEGER_PATTERN = /^\d+$/;
    const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

    const DATA_SOURCE_MESSAGES = {
        required: 'A data source is required: choose one of your previous data sources or enter a new one.',
        typeRequired: 'Data source type is required: select one of the eight data-source types.',
        titleRequired: 'Source title is required (article, report, dataset, or project title).',
        authorsRequired: 'Authors or organization is required for the data source.',
        journalRequired: 'Journal, publisher, or repository is required for the data source.',
        citationRequired: 'Full citation (APA) is required for the data source.',
        yearRequired: 'Publication year is required for published data sources (types 1-4).',
        get yearFormat() {
            return `Publication year must be a four-digit year from ${MIN_PUBLICATION_YEAR} to ${getMaxPublicationYear()}.`;
        },
        yearNotAllowed: 'Leave the publication year blank for unpublished data sources (types 5-8).',
        dateAccessedRequired: 'Date accessed is required for a Public Database or Data Repository source.',
        dateAccessedFormat: 'Date accessed must be a valid date (YYYY-MM-DD).',
        dateAccessedNotAllowed: 'Date accessed only applies to Public Database or Data Repository sources; leave it blank.',
        legacyNotice: 'This sample was saved before a data source was required. You can still save other changes; please add its data source when you can.'
    };

    // Form field names (= the API's preferred input names) for a data source.
    // data_source_id selects an existing DataSourceReference row; the others
    // describe a new one.
    const DATA_SOURCE_DETAIL_FIELDS = [
        'data_source_type_id',
        'authors_or_organization',
        'publication_year',
        'source_title',
        'journal_publisher_or_repository',
        'source_identifier_or_url',
        'project_or_collection_name',
        'date_accessed',
        'citation_text'
    ];
    const DATA_SOURCE_FORM_FIELDS = ['data_source_id'].concat(DATA_SOURCE_DETAIL_FIELDS);

    // [form field name, key in a /api/data-sources row]: the values used to
    // autofill (and lock) the detail fields when an existing source is chosen.
    const PUBLICATION_FIELD_MAP = [
        ['data_source_type_id', 'source_type_id'],
        ['authors_or_organization', 'authors_or_organization'],
        ['publication_year', 'publication_year'],
        ['source_title', 'source_title'],
        ['journal_publisher_or_repository', 'journal_publisher_or_repository'],
        ['source_identifier_or_url', 'source_identifier_or_url'],
        ['project_or_collection_name', 'project_or_collection_name'],
        ['date_accessed', 'date_accessed'],
        ['citation_text', 'citation_text']
    ];

    // Pre-redesign form field names that can still sit in a browser's
    // sessionStorage (or the location carry-forward store) from before the
    // redesign, mapped to their replacement.
    const LEGACY_FIELD_RENAMES = {
        publication_id_num: 'data_source_id',
        publication_authors: 'authors_or_organization',
        publication_journal: 'journal_publisher_or_repository',
        publication_full_citation_apa: 'citation_text',
        publication_pub_source_code: 'data_source_type_id'
    };
    const OBSOLETE_FIELDS = ['publication_present', 'data_source_present'];

    function hasText(value) {
        return value !== undefined && value !== null && String(value).trim() !== '';
    }

    function trimmedOrNull(value) {
        return hasText(value) ? String(value).trim() : null;
    }

    // Next year (in-press work). UTC, so the form and the API (which share this
    // code) agree on the bound whatever the browser's and server's time zones.
    function getMaxPublicationYear() {
        return new Date().getUTCFullYear() + 1;
    }

    function isValidPublicationYear(text) {
        if (!/^\d{4}$/.test(text)) return false;
        const year = Number(text);
        return year >= MIN_PUBLICATION_YEAR && year <= getMaxPublicationYear();
    }

    function parseSourceTypeId(value) {
        const text = trimmedOrNull(value);
        return text !== null && PLAIN_INTEGER_PATTERN.test(text) ? Number(text) : null;
    }

    // Which detail fields apply to a source type: the year only for the
    // Published types, the access date only for type 4.
    function getSourceTypeRules(sourceTypeId) {
        const typeId = parseSourceTypeId(sourceTypeId);
        const isPublished = PUBLISHED_SOURCE_TYPE_IDS.includes(typeId);
        const isUnpublished = UNPUBLISHED_SOURCE_TYPE_IDS.includes(typeId);
        return {
            typeId: isPublished || isUnpublished ? typeId : null,
            isPublished,
            isUnpublished,
            requiresYear: isPublished,
            requiresDateAccessed: typeId === DATE_ACCESSED_SOURCE_TYPE_ID
        };
    }

    function isValidIsoDate(text) {
        const match = ISO_DATE_PATTERN.exec(text || '');
        if (!match) return false;
        const [year, month, day] = match.slice(1).map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day;
    }

    // Validates the details of a NEW data source. `input` uses the camelCase
    // keys of routes/api.js readDataSourceInput() (trimmed strings or null).
    function validateDataSourceDetails(input = {}) {
        const errors = [];
        const rules = getSourceTypeRules(input.sourceTypeId);
        const publicationYear = trimmedOrNull(input.publicationYear);
        const dateAccessed = trimmedOrNull(input.dateAccessed);

        if (rules.typeId === null) {
            errors.push(DATA_SOURCE_MESSAGES.typeRequired);
        }
        if (!hasText(input.sourceTitle)) {
            errors.push(DATA_SOURCE_MESSAGES.titleRequired);
        }
        if (!hasText(input.authorsOrOrganization)) {
            errors.push(DATA_SOURCE_MESSAGES.authorsRequired);
        }
        if (!hasText(input.journalPublisherOrRepository)) {
            errors.push(DATA_SOURCE_MESSAGES.journalRequired);
        }
        if (!hasText(input.citationText)) {
            errors.push(DATA_SOURCE_MESSAGES.citationRequired);
        }

        if (rules.isPublished) {
            if (!publicationYear) {
                errors.push(DATA_SOURCE_MESSAGES.yearRequired);
            } else if (!isValidPublicationYear(publicationYear)) {
                errors.push(DATA_SOURCE_MESSAGES.yearFormat);
            }
        } else if (rules.isUnpublished && publicationYear) {
            errors.push(DATA_SOURCE_MESSAGES.yearNotAllowed);
        }

        if (rules.requiresDateAccessed) {
            if (!dateAccessed) {
                errors.push(DATA_SOURCE_MESSAGES.dateAccessedRequired);
            } else if (!isValidIsoDate(dateAccessed)) {
                errors.push(DATA_SOURCE_MESSAGES.dateAccessedFormat);
            }
        } else if (rules.typeId !== null && dateAccessed) {
            errors.push(DATA_SOURCE_MESSAGES.dateAccessedNotAllowed);
        }

        Object.keys(DATA_SOURCE_TEXT_LIMITS).forEach(key => {
            const [label, maxLength] = DATA_SOURCE_TEXT_LIMITS[key];
            if (hasText(input[key]) && String(input[key]).trim().length > maxLength) {
                errors.push(`${label} must be ${maxLength} characters or fewer.`);
            }
        });

        return errors;
    }

    // Copies pre-redesign publication_* keys onto the new field names (never
    // overwriting a new-name value) and drops them, plus the retired yes/no
    // toggle. Returns a new object.
    function migrateLegacyDataSourceFields(state = {}) {
        const migrated = { ...state };
        Object.keys(LEGACY_FIELD_RENAMES).forEach(oldName => {
            if (!(oldName in migrated)) return;
            const newName = LEGACY_FIELD_RENAMES[oldName];
            if (!hasText(migrated[newName]) && hasText(migrated[oldName])) {
                migrated[newName] = migrated[oldName];
            }
            delete migrated[oldName];
        });
        OBSOLETE_FIELDS.forEach(name => { delete migrated[name]; });
        return migrated;
    }

    // Form state (new field names) -> the camelCase input validateDataSourceDetails() reads.
    function readDataSourceFormState(state = {}) {
        return {
            dataSourceId: trimmedOrNull(state.data_source_id),
            sourceTypeId: trimmedOrNull(state.data_source_type_id),
            authorsOrOrganization: trimmedOrNull(state.authors_or_organization),
            publicationYear: trimmedOrNull(state.publication_year),
            sourceTitle: trimmedOrNull(state.source_title),
            journalPublisherOrRepository: trimmedOrNull(state.journal_publisher_or_repository),
            sourceIdentifierOrUrl: trimmedOrNull(state.source_identifier_or_url),
            projectOrCollectionName: trimmedOrNull(state.project_or_collection_name),
            dateAccessed: trimmedOrNull(state.date_accessed),
            citationText: trimmedOrNull(state.citation_text)
        };
    }

    function hasDataSourceDetailInput(state = {}) {
        return DATA_SOURCE_DETAIL_FIELDS.some(field => hasText(state[field]));
    }

    // Front-end counterpart of routes/api.js validateDataSourceRules(): an
    // existing data source is enough; otherwise any detail input must form a
    // complete new source; with nothing entered, `required` decides.
    function validateDataSourceSelection(state = {}, { required = true } = {}) {
        const input = readDataSourceFormState(state);
        if (input.dataSourceId) {
            return [];
        }
        if (hasDataSourceDetailInput(state)) {
            return validateDataSourceDetails(input);
        }
        return required ? [DATA_SOURCE_MESSAGES.required] : [];
    }

    // Cleans the data-source part of a save payload: old field names are
    // migrated, and a year / access date the chosen type does not allow
    // (e.g. typed before switching type) is dropped rather than rejected.
    function normalizeDataSourcePayload(payload = {}) {
        const normalized = migrateLegacyDataSourceFields(payload);
        if (!hasText(normalized.data_source_id)) {
            const rules = getSourceTypeRules(normalized.data_source_type_id);
            if (rules.isUnpublished) normalized.publication_year = '';
            if (rules.typeId !== null && !rules.requiresDateAccessed) normalized.date_accessed = '';
        }
        return normalized;
    }

    function getDataSourceId(publication = {}) {
        return publication.data_source_id ?? publication.publication_id_num;
    }

    function getPublicationOptionLabel(publication = {}) {
        const citation = String(
            publication.citation_text || publication.publication_full_citation_apa || ''
        ).trim();
        if (citation) {
            return citation;
        }

        const fallbackParts = [
            publication.source_title,
            publication.authors_or_organization || publication.publication_authors,
            publication.publication_year,
            publication.journal_publisher_or_repository || publication.publication_journal
        ]
            .map(value => String(value ?? '').trim())
            .filter(Boolean);

        return fallbackParts.join(' - ') || 'Untitled data source';
    }

    function getPublicationSelectionState(publicationId, publications = []) {
        const selectedId = String(publicationId || '');
        const publication = publications.find(item =>
            String(getDataSourceId(item)) === selectedId
        );

        if (!selectedId || !publication) {
            return {
                publicationId: '',
                publication: null,
                locked: false,
                fields: {}
            };
        }

        const fields = {};
        PUBLICATION_FIELD_MAP.forEach(([fieldName, publicationKey]) => {
            const value = publication[publicationKey];
            fields[fieldName] = value === undefined || value === null ? '' : String(value);
        });

        return {
            publicationId: selectedId,
            publication,
            locked: true,
            fields
        };
    }

    function setPublicationFieldsLocked(elements, locked) {
        Array.from(elements || []).forEach(element => {
            if (!element) return;

            if (String(element.tagName || '').toUpperCase() === 'SELECT') {
                element.disabled = locked;
            } else if ('readOnly' in element) {
                element.readOnly = locked;
            }

            if (element.classList && typeof element.classList.toggle === 'function') {
                element.classList.toggle('is-autofilled', locked);
            }

            if (typeof element.setAttribute === 'function' &&
                typeof element.removeAttribute === 'function') {
                if (locked) {
                    element.setAttribute('aria-readonly', 'true');
                } else {
                    element.removeAttribute('aria-readonly');
                }
            }
        });
    }

    return {
        PUBLISHED_SOURCE_TYPE_IDS,
        UNPUBLISHED_SOURCE_TYPE_IDS,
        DATE_ACCESSED_SOURCE_TYPE_ID,
        DATA_SOURCE_MESSAGES,
        DATA_SOURCE_DETAIL_FIELDS,
        DATA_SOURCE_FORM_FIELDS,
        PUBLICATION_FIELD_MAP,
        LEGACY_FIELD_RENAMES,
        getSourceTypeRules,
        isValidIsoDate,
        validateDataSourceDetails,
        migrateLegacyDataSourceFields,
        readDataSourceFormState,
        hasDataSourceDetailInput,
        validateDataSourceSelection,
        normalizeDataSourcePayload,
        getPublicationOptionLabel,
        getPublicationSelectionState,
        setPublicationFieldsLocked
    };
}));

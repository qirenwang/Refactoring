'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const ejs = require('ejs');
const {
    DATA_SOURCE_FORM_FIELDS,
    DATA_SOURCE_MESSAGES,
    getPublicationOptionLabel,
    getPublicationSelectionState,
    getSourceTypeRules,
    migrateLegacyDataSourceFields,
    normalizeDataSourcePayload,
    setPublicationFieldsLocked,
    validateDataSourceSelection
} = require('../public/js/publication-form-utils');
const { getPublicationInputState, validateDataSourceRules } = require('../routes/api')._internals;

const projectRoot = path.join(__dirname, '..');

// Rows as GET /api/data-sources returns them (DataSourceReference columns).
const publications = [
    {
        data_source_id: 101,
        source_type_id: 1,
        publication_year: 2024,
        authors_or_organization: 'Allen Smith; Maria Chen',
        source_title: 'Microplastics in lakes',
        journal_publisher_or_repository: 'Water Research',
        citation_text: 'Smith, A., & Chen, M. (2024). Microplastics in lakes. Water Research, 10(2), 1–10.'
    },
    {
        data_source_id: 102,
        source_type_id: 1,
        publication_year: 2024,
        authors_or_organization: 'Allen Smith; Maria Chen',
        source_title: 'Microplastics in rivers',
        journal_publisher_or_repository: 'Water Research',
        citation_text: 'Smith, A., & Chen, M. (2024). Microplastics in rivers. Water Research, 11(1), 20–30.'
    }
];

test('same-author same-year publications are distinguished by full citation and ID', () => {
    assert.equal(
        getPublicationOptionLabel(publications[0]),
        publications[0].citation_text
    );
    assert.equal(
        getPublicationOptionLabel(publications[1]),
        publications[1].citation_text
    );
    assert.notEqual(
        getPublicationOptionLabel(publications[0]),
        getPublicationOptionLabel(publications[1])
    );

    const selection = getPublicationSelectionState('102', publications);
    assert.equal(selection.publicationId, '102');
    assert.equal(selection.locked, true);
    assert.equal(selection.fields.citation_text, publications[1].citation_text);
    assert.equal(selection.fields.authors_or_organization, 'Allen Smith; Maria Chen');
    assert.equal(selection.fields.source_title, 'Microplastics in rivers');
    assert.equal(selection.fields.data_source_type_id, '1');
    assert.equal(selection.fields.publication_year, '2024');
    // Fields the row does not carry are filled with '' so stale values clear.
    assert.equal(selection.fields.date_accessed, '');
});

test('a data source without a citation is labelled by title, authors, and year', () => {
    assert.equal(
        getPublicationOptionLabel({
            data_source_id: 7,
            source_title: 'Beach Microplastics Observations',
            authors_or_organization: 'Individual Volunteers',
            publication_year: null
        }),
        'Beach Microplastics Observations - Individual Volunteers'
    );
});

test('blank publication selection leaves details editable and empty', () => {
    assert.deepEqual(getPublicationSelectionState('', publications), {
        publicationId: '',
        publication: null,
        locked: false,
        fields: {}
    });
});

test('publication detail fields lock for an existing selection and unlock when cleared', () => {
    const classNames = new Set();
    const attributes = new Map();
    const input = {
        tagName: 'INPUT',
        readOnly: false,
        classList: {
            toggle(name, enabled) {
                if (enabled) classNames.add(name);
                else classNames.delete(name);
            }
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        }
    };
    const select = {
        tagName: 'SELECT',
        disabled: false,
        classList: input.classList,
        setAttribute: input.setAttribute,
        removeAttribute: input.removeAttribute
    };

    setPublicationFieldsLocked([input, select], true);
    assert.equal(input.readOnly, true);
    assert.equal(select.disabled, true);
    assert.equal(classNames.has('is-autofilled'), true);
    assert.equal(attributes.get('aria-readonly'), 'true');

    setPublicationFieldsLocked([input, select], false);
    assert.equal(input.readOnly, false);
    assert.equal(select.disabled, false);
    assert.equal(classNames.has('is-autofilled'), false);
    assert.equal(attributes.has('aria-readonly'), false);
});

test('data source form: mandatory type select plus the ten-field detail block', async () => {
    const html = await ejs.renderFile(
        path.join(projectRoot, 'views', 'data_forms', 'formpage2.ejs')
    );
    const normalizedHtml = html.replace(/\s+/g, ' ');

    assert.doesNotMatch(normalizedHtml, /name="publication_present"/, 'yes/no toggle is gone');
    assert.doesNotMatch(normalizedHtml, /name="publication_(?:id_num|authors|journal|full_citation_apa|pub_source_code)"/);
    DATA_SOURCE_FORM_FIELDS.forEach(field => {
        assert.match(normalizedHtml, new RegExp(`name="${field}"`), field);
    });
    assert.match(normalizedHtml, /Data Source \(<span class="required-marker">\*<\/span>\)/);
    assert.match(normalizedHtml, /Select Existing Data Source/);
    assert.match(normalizedHtml, /id="data-source-type-id"[^>]*class="[^"]*publication-source-select/);
    // Year and access date start hidden; the chosen type decides.
    assert.match(normalizedHtml, /id="publication-year-row" hidden/);
    assert.match(normalizedHtml, /id="date-accessed-row" hidden/);
    assert.match(normalizedHtml, /id="data-source-legacy-notice" role="status" hidden/);
    assert.match(
        normalizedHtml,
        /id="authors-or-organization"[^>]*aria-describedby="authors-or-organization-help"/
    );
    assert.match(normalizedHtml, /using the format First Last \(e\.g\., Allen Smith\)/);
});

test('source-type rules: year for types 1-4, access date only for type 4', () => {
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8].map(id => getSourceTypeRules(String(id)).requiresYear),
        [true, true, true, true, false, false, false, false]
    );
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8].map(id => getSourceTypeRules(id).requiresDateAccessed),
        [false, false, false, true, false, false, false, false]
    );
    assert.equal(getSourceTypeRules('9').typeId, null);
    assert.equal(getSourceTypeRules('').typeId, null);
});

const journalArticle = {
    data_source_type_id: '1',
    source_title: 'Microplastics in Great Lakes Tributaries',
    authors_or_organization: 'Smith, J. A., & Lee, B.',
    publication_year: '2025'
};

// Every case is checked by the form (validateDataSourceSelection) and by the
// API (validateDataSourceRules); both must give the same messages.
const parityCases = [
    ['nothing entered', {}],
    ['existing source', { data_source_id: '12' }],
    ['type 1 complete', journalArticle],
    ['type 1 without year', { ...journalArticle, publication_year: '' }],
    ['type 1 two-digit year', { ...journalArticle, publication_year: '25' }],
    ['type 4 without access date', { ...journalArticle, data_source_type_id: '4' }],
    ['type 4 bad access date', { ...journalArticle, data_source_type_id: '4', date_accessed: '2026-02-30' }],
    ['type 4 complete', { ...journalArticle, data_source_type_id: '4', date_accessed: '2026-10-15' }],
    ['type 3 with access date', { ...journalArticle, data_source_type_id: '3', date_accessed: '2026-10-15' }],
    ['type 8 with a year', { ...journalArticle, data_source_type_id: '8' }],
    ['type 8 complete', { ...journalArticle, data_source_type_id: '8', publication_year: '' }],
    ['only a title', { source_title: 'Something' }],
    ['title too long', { ...journalArticle, source_title: 'x'.repeat(501) }]
];

test('form and API give identical data-source messages (new sample)', () => {
    parityCases.forEach(([name, state]) => {
        assert.deepEqual(
            validateDataSourceSelection(state, { required: true }),
            validateDataSourceRules(state, { required: true }),
            name
        );
    });
    assert.deepEqual(validateDataSourceSelection({}, { required: true }), [DATA_SOURCE_MESSAGES.required]);
    assert.deepEqual(validateDataSourceSelection(journalArticle), []);
    assert.ok(validateDataSourceSelection({ ...journalArticle, data_source_type_id: '8' })
        .includes(DATA_SOURCE_MESSAGES.yearNotAllowed));
});

test('legacy sample edit: nothing entered is allowed, partial input is not', () => {
    assert.deepEqual(validateDataSourceSelection({}, { required: false }), []);
    assert.deepEqual(validateDataSourceRules({}, { required: false }), []);
    const partial = { source_title: 'Only a title' };
    assert.deepEqual(
        validateDataSourceSelection(partial, { required: false }),
        validateDataSourceRules(partial, { required: false })
    );
    assert.ok(validateDataSourceSelection(partial, { required: false }).length > 0);
});

test('pre-redesign session keys migrate to the new field names', () => {
    const migrated = migrateLegacyDataSourceFields({
        publication_present: 'yes',
        publication_id_num: '5',
        publication_authors: 'A. Author',
        publication_journal: 'J',
        publication_full_citation_apa: 'Cite',
        publication_pub_source_code: '1',
        publication_year: '2020',
        citation_text: 'Newer value wins',
        location_id: '3'
    });
    assert.deepEqual(migrated, {
        data_source_id: '5',
        authors_or_organization: 'A. Author',
        journal_publisher_or_repository: 'J',
        citation_text: 'Newer value wins',
        data_source_type_id: '1',
        publication_year: '2020',
        location_id: '3'
    });
});

test('save payload drops a year / access date the chosen type does not allow', () => {
    const payload = normalizeDataSourcePayload({
        ...journalArticle,
        data_source_type_id: '8',
        date_accessed: '2026-10-15',
        publication_present: 'yes'
    });
    assert.equal(payload.publication_year, '');
    assert.equal(payload.date_accessed, '');
    assert.equal('publication_present' in payload, false);
    assert.deepEqual(getPublicationInputState(payload).newPublicationErrors, []);

    const repository = normalizeDataSourcePayload({
        ...journalArticle, data_source_type_id: '4', date_accessed: '2026-10-15'
    });
    assert.equal(repository.publication_year, '2025');
    assert.equal(repository.date_accessed, '2026-10-15');

    // A reused source is sent as-is: the API ignores its details.
    const reused = normalizeDataSourcePayload({ data_source_id: '9', data_source_type_id: '8', publication_year: '2020' });
    assert.equal(reused.publication_year, '2020');
});

test('publication utilities load before the form handler', async () => {
    const view = await fs.readFile(
        path.join(projectRoot, 'views', 'enter_data_by_form.ejs'),
        'utf8'
    );

    assert.ok(
        view.indexOf('/js/publication-form-utils.js') <
        view.indexOf('/js/form-handler.js')
    );
});

test('dynamically loaded page 2 uses the publication-aware initializer', async () => {
    const handler = await fs.readFile(
        path.join(projectRoot, 'public', 'js', 'form-handler.js'),
        'utf8'
    );
    const definitions = handler.match(/function updatePage2Content\(\)/g) || [];

    assert.equal(definitions.length, 1);
    assert.match(
        handler,
        /async function updatePage2Content\(\)[\s\S]*?await initializeReferenceData\(\);[\s\S]*?syncPage2SectionVisibility\(\);/
    );
});

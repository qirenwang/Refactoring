'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const ejs = require('ejs');
const {
    getPublicationOptionLabel,
    getPublicationSelectionState,
    setPublicationFieldsLocked
} = require('../public/js/publication-form-utils');

const projectRoot = path.join(__dirname, '..');

const publications = [
    {
        publication_id_num: 101,
        publication_year: 2024,
        publication_authors: 'Allen Smith; Maria Chen',
        publication_journal: 'Water Research',
        publication_full_citation_apa: 'Smith, A., & Chen, M. (2024). Microplastics in lakes. Water Research, 10(2), 1–10.',
        publication_pub_source_code: 1
    },
    {
        publication_id_num: 102,
        publication_year: 2024,
        publication_authors: 'Allen Smith; Maria Chen',
        publication_journal: 'Water Research',
        publication_full_citation_apa: 'Smith, A., & Chen, M. (2024). Microplastics in rivers. Water Research, 11(1), 20–30.',
        publication_pub_source_code: 1
    }
];

test('same-author same-year publications are distinguished by full citation and ID', () => {
    assert.equal(
        getPublicationOptionLabel(publications[0]),
        publications[0].publication_full_citation_apa
    );
    assert.equal(
        getPublicationOptionLabel(publications[1]),
        publications[1].publication_full_citation_apa
    );
    assert.notEqual(
        getPublicationOptionLabel(publications[0]),
        getPublicationOptionLabel(publications[1])
    );

    const selection = getPublicationSelectionState('102', publications);
    assert.equal(selection.publicationId, '102');
    assert.equal(selection.locked, true);
    assert.equal(
        selection.fields.publication_full_citation_apa,
        publications[1].publication_full_citation_apa
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

test('publication form explains direct entry and the required author format', async () => {
    const html = await ejs.renderFile(
        path.join(projectRoot, 'views', 'data_forms', 'formpage2.ejs')
    );
    const normalizedHtml = html.replace(/\s+/g, ' ');

    assert.match(normalizedHtml, /-- Select Existing Publication --/);
    assert.match(
        normalizedHtml,
        /Select an existing publication to fill the fields below, or leave this blank to enter a new publication\./
    );
    assert.match(
        normalizedHtml,
        /id="publication-authors"[^>]*aria-describedby="publication-authors-help"/
    );
    assert.match(
        normalizedHtml,
        /Enter author names in the same order as they appear in the publication, using the format First Last \(e\.g\., Allen Smith\)\. Separate multiple authors with semicolons\./
    );
    assert.doesNotMatch(normalizedHtml, /Add a new publication/i);
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

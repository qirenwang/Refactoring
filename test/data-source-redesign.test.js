'use strict';

// Data-source redesign (db/20261105_redesign_data_source_tables.sql): eight
// source types (1-4 Published, 5-8 Unpublished), a 10-field DataSourceReference
// row, and a data source that is mandatory for new samples. These tests pin the
// app-level rules that mirror the table's CHECK constraints, the field-name
// aliases, and the migration's shape (guarded, remap, CHECKs).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    validateNewDataSource,
    validateDataSourceRules,
    validateNewSaveRules,
    getPublicationInputState,
    listDataSources
} = require('../routes/api')._internals;

const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', '20261105_redesign_data_source_tables.sql'),
    'utf8'
);

const journalArticle = {
    data_source_type_id: '1',
    source_title: 'Microplastics in Great Lakes Tributaries',
    authors_or_organization: 'Smith, J. A., & Lee, B.',
    publication_year: '2025',
    journal_publisher_or_repository: 'Journal of Great Lakes Research',
    citation_text: 'Smith, J. A., & Lee, B. (2025). Microplastics in Great Lakes Tributaries. Journal of Great Lakes Research.'
};

function errorsFor(formData) {
    return getPublicationInputState(formData).newPublicationErrors;
}

test('published types need a year, unpublished types must not have one', () => {
    assert.deepEqual(errorsFor(journalArticle), []);
    assert.ok(errorsFor({ ...journalArticle, publication_year: '' })
        .some(message => /Publication year is required/.test(message)));
    assert.ok(errorsFor({ ...journalArticle, publication_year: '25' })
        .some(message => /four-digit year/.test(message)));

    // 1900 through next year (in-press work); the upper bound tracks the calendar.
    const currentYear = new Date().getUTCFullYear();
    const yearRange = new RegExp(`from 1900 to ${currentYear + 1}\\.`);
    ['1899', String(currentYear + 2)].forEach(year => {
        assert.ok(errorsFor({ ...journalArticle, publication_year: year })
            .some(message => yearRange.test(message)), year);
    });
    ['1900', String(currentYear), String(currentYear + 1)].forEach(year => {
        assert.deepEqual(errorsFor({ ...journalArticle, publication_year: year }), [], year);
    });

    const research = { ...journalArticle, data_source_type_id: '5', publication_year: '' };
    assert.deepEqual(errorsFor(research), []);
    assert.ok(errorsFor({ ...research, publication_year: '2024' })
        .some(message => /Leave the publication year blank/.test(message)));
});

test('only type 4 carries a valid access date', () => {
    const repository = { ...journalArticle, data_source_type_id: '4', date_accessed: '2026-10-15' };
    assert.deepEqual(errorsFor(repository), []);
    assert.ok(errorsFor({ ...repository, date_accessed: '' })
        .some(message => /Date accessed is required/.test(message)));
    assert.ok(errorsFor({ ...repository, date_accessed: '2026-02-30' })
        .some(message => /valid date/.test(message)));
    assert.ok(errorsFor({ ...journalArticle, date_accessed: '2026-10-15' })
        .some(message => /only applies to Public Database/.test(message)));
});

test('type, title, authors/organization, journal, and citation are required; unknown type rejected', () => {
    const errors = validateNewDataSource({});
    assert.ok(errors.some(message => /Data source type is required/.test(message)));
    assert.ok(errors.some(message => /Source title is required/.test(message)));
    assert.ok(errors.some(message => /Authors or organization is required/.test(message)));
    assert.ok(errors.some(message => /Journal, publisher, or repository is required/.test(message)));
    assert.ok(errors.some(message => /Full citation \(APA\) is required/.test(message)));
    // Required for all eight types, published or not.
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(typeId => {
        const source = {
            ...journalArticle,
            data_source_type_id: String(typeId),
            publication_year: typeId <= 4 ? '2025' : '',
            date_accessed: typeId === 4 ? '2026-10-15' : ''
        };
        assert.deepEqual(errorsFor(source), [], `type ${typeId} complete`);
        assert.deepEqual(errorsFor({ ...source, journal_publisher_or_repository: '' }),
            ['Journal, publisher, or repository is required for the data source.'], `type ${typeId} journal`);
        assert.deepEqual(errorsFor({ ...source, citation_text: '  ' }),
            ['Full citation (APA) is required for the data source.'], `type ${typeId} citation`);
    });
    assert.ok(errorsFor({ ...journalArticle, data_source_type_id: '9' })
        .some(message => /one of the eight/.test(message)));
});

test('pre-redesign publication_* names still resolve as aliases', () => {
    const state = getPublicationInputState({
        publication_pub_source_code: '3',
        publication_year: '2024',
        publication_authors: 'Michigan Environmental Agency',
        publication_journal: 'Michigan Environmental Agency',
        publication_full_citation_apa: 'Michigan Environmental Agency. (2024). Microplastics Monitoring Report.',
        source_title: 'Microplastics Monitoring Report'
    });
    assert.equal(state.input.sourceTypeId, '3');
    assert.equal(state.input.authorsOrOrganization, 'Michigan Environmental Agency');
    assert.equal(state.input.journalPublisherOrRepository, 'Michigan Environmental Agency');
    assert.match(state.input.citationText, /Monitoring Report/);
    assert.equal(state.hasCompleteNewPublication, true);

    assert.equal(getPublicationInputState({ publication_id_num: '12' }).selectedPublication, 12);
    assert.equal(getPublicationInputState({ data_source_id: '7', publication_id_num: '12' }).selectedPublication, 7);
});

test('a new sample must carry a data source; edits of legacy samples are not blocked', () => {
    assert.match(validateDataSourceRules({}, { required: true })[0], /A data source is required/);
    assert.match(validateDataSourceRules({ data_source_present: 'no' }, { required: true })[0], /A data source is required/);
    assert.deepEqual(validateDataSourceRules({ data_source_id: '3' }, { required: true }), []);
    assert.deepEqual(validateDataSourceRules(journalArticle, { required: true }), []);

    // Edit path (required=false): a legacy sample with no data source saves.
    assert.deepEqual(validateDataSourceRules({ publication_present: 'no' }), []);
    assert.deepEqual(validateDataSourceRules({}), []);
    // ...but half-entered new details are still reported.
    assert.ok(validateDataSourceRules({ data_source_type_id: '5' }).length > 0);

    const result = validateNewSaveRules({ has_quantitative_data: 'no' }, { requireDataSource: true });
    assert.equal(result.isValid, false);
    assert.match(result.message, /A data source is required/);
    assert.equal(validateNewSaveRules({ has_quantitative_data: 'no' }).isValid, true);
});

test('migration renames the tables, keeps PublicationID_Num, and adds the PI CHECK rules', () => {
    assert.match(migration, /RENAME TABLE `PubSource_Ref` TO `DataSourceTypeReference`/);
    assert.match(migration, /RENAME TABLE `Publications` TO `DataSourceReference`/);
    assert.match(migration, /FOREIGN KEY \(`PublicationID_Num`\) REFERENCES `DataSourceReference` \(`data_source_id`\) ON UPDATE CASCADE/);
    assert.match(migration, /ADD CONSTRAINT `chk_publication_year`\s+CHECK \(\(`source_type_id` IN \(1, 2, 3, 4\) AND `publication_year` IS NOT NULL\)\s+OR \(`source_type_id` IN \(5, 6, 7, 8\) AND `publication_year` IS NULL\)\)/);
    assert.match(migration, /ADD CONSTRAINT `chk_date_accessed`\s+CHECK \(\(`source_type_id` = 4 AND `date_accessed` IS NOT NULL\)\s+OR \(`source_type_id` <> 4 AND `date_accessed` IS NULL\)\)/);
    // Legacy remap: old 1 -> 1, everything else (2-6) -> 3, gated on the old column.
    assert.match(migration, /`PubSource_Code` = CASE WHEN `PubSource_Code` = 1 THEN 1 ELSE 3 END/);
    assert.match(migration, /SET @sql = IF\(@legacy_pub_cols = 1,\s+'UPDATE `DataSourceReference`/);

    const typeRows = [...migration.matchAll(/^\s+\((\d), (\d+), '([^']+)',\s+'(Published|Unpublished)'/gm)]
        .map(([, id, sortOrder, name, status]) => ({ id: Number(id), sortOrder: Number(sortOrder), name, status }));
    assert.equal(typeRows.length, 8);
    typeRows.forEach((row, index) => {
        assert.equal(row.id, index + 1);
        assert.equal(row.sortOrder, (index + 1) * 10);
        assert.equal(row.status, row.id <= 4 ? 'Published' : 'Unpublished');
    });

    // Every DDL step is guarded (prepared IF(...)) so a re-run is a no-op.
    const unguarded = migration
        .split(';')
        .map(statement => statement.replace(/--.*$/gm, '').trim())
        .filter(statement => /^(ALTER TABLE|RENAME TABLE)/i.test(statement))
        .filter(statement => !/MODIFY COLUMN/i.test(statement));
    assert.deepEqual(unguarded, [], 'only idempotent MODIFY COLUMN statements run unguarded');
});

test('the data-source list holds only the user\'s own or already-cited data sources', async () => {
    const calls = [];
    const db = { query: async (sql, params) => { calls.push({ sql, params }); return [[]]; } };

    await listDataSources(db, '6');
    assert.match(calls[0].sql, /WHERE ds\.EnteredBy = \?\s+OR EXISTS \(SELECT 1 FROM SamplingEvent mine_se/);
    assert.match(calls[0].sql, /mine_se\.UserSamplingID = \?/);
    assert.deepEqual(calls[0].params, [6, 6, 6]);

    // Signed out: nothing is "mine", and no query runs.
    assert.deepEqual(await listDataSources(db, undefined), []);
    assert.equal(calls.length, 1);
});

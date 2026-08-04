'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    buildParticleSummary,
    getDetailMethodLabels,
    getPolymerSummaryEntries,
    hasSummaryValue,
    resolveMethodLabel,
    resolveSectionEditPage
} = require('../public/js/data-summary-utils');

const projectRoot = path.resolve(__dirname, '..');

const polymerReferences = [
    [1, 'PETE', 'Polyethylene Terephthalate', 1],
    [2, 'HDPE', 'High-Density Polyethylene', 2],
    [3, 'PVC', 'Polyvinyl Chloride', 3],
    [4, 'LDPE', 'Low-Density Polyethylene', 4],
    [5, 'PP', 'Polypropylene', 5],
    [6, 'PS', 'Polystyrene', 6],
    [7, 'PA', 'Polyamide / Nylon', null],
    [8, 'PC', 'Polycarbonate', null],
    [9, 'PLA', 'Polylactic Acid', null],
    [10, 'ABS', 'Acrylonitrile Butadiene Styrene', null],
    [11, 'EVA', 'Ethylene-vinyl Acetate', null],
    [12, 'PB', 'Polybutylene', null],
    [13, 'PE_UHMW', 'Ultra-high-molecular-weight Polyethylene', null],
    [14, 'PMMA', 'Polymethyl Methacrylate/Acrylic/Plexiglass', null],
    [15, 'HIPS', 'High Impact Polystyrene', null],
    [16, 'EPS', 'Expanded Polystyrene', null],
    [17, 'PAN', 'Polyacrylonitrile', null],
    [18, 'Rubber', 'Synthetic Rubber', null],
    [19, 'Bitumen', 'Bitumen/Asphalt', null],
    [20, 'Other', 'Other (specify in method)', 7]
].map(([PolymerUniqueID, Polymer_Code, Polymer_FullName, RecycleCode]) => ({
    PolymerUniqueID,
    Polymer_Code,
    Polymer_FullName,
    RecycleCode
}));

const methodReferences = [
    {
        MethodsUniqueID: 4,
        Method_Code: 'FTIR',
        Method_Label: 'Fourier Transform Infrared Spectroscopy'
    },
    {
        MethodsUniqueID: 14,
        Method_Code: 'Item_Count',
        Method_Label: 'Percent calculation based on item count'
    }
];

test('screenshot regression: every entered polymer remains in the polymer section', () => {
    const formState = {
        microplastics_count: '2718',
        micro_mass_mp_total: 0,
        micro_method_polymer_num: 4,
        micro_method_percent_estimate: '14',
        mp_polymer_pvc: '2.0000',
        mp_polymer_pp: '57.0000',
        mp_polymer_pe_uhmw: '18.0000',
        mp_polymer_rubber: '14.0000',
        mp_polymer_other: '9.0000'
    };

    const summary = buildParticleSummary(
        formState,
        {
            polymers: polymerReferences,
            methods: methodReferences
        }
    );
    const entries = summary.microplastics.polymers;

    assert.equal(summary.microplastics.count, '2718');
    assert.equal(summary.microplastics.mass, 0);
    assert.equal(
        summary.microplastics.polymerMethod,
        'Fourier Transform Infrared Spectroscopy'
    );
    assert.equal(
        summary.microplastics.percentMethod,
        'Percent calculation based on item count'
    );
    assert.deepEqual(
        entries.map(entry => entry.field),
        [
            'mp_polymer_pvc',
            'mp_polymer_pp',
            'mp_polymer_pe_uhmw',
            'mp_polymer_rubber',
            'mp_polymer_other'
        ]
    );
    assert.equal(entries.find(entry => entry.field === 'mp_polymer_pvc').label,
        'PVC - Polyvinyl Chloride #3 (%)');
    assert.equal(entries.find(entry => entry.field === 'mp_polymer_pe_uhmw').value, '18.0000');
});

test('all current and future reference-driven polymers appear exactly once', () => {
    const futureReference = {
        PolymerUniqueID: 21,
        Polymer_Code: 'NEW-POLYMER',
        Polymer_FullName: 'Future Polymer',
        RecycleCode: null
    };
    const references = [...polymerReferences, futureReference];
    const formState = Object.fromEntries(references.map((polymer, index) => [
        `mp_polymer_${String(polymer.Polymer_Code).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        String(index)
    ]));

    const entries = getPolymerSummaryEntries(formState, 'mp_polymer_', references);
    const fields = entries.map(entry => entry.field);

    assert.equal(entries.length, references.length);
    assert.equal(new Set(fields).size, references.length);
    assert.ok(fields.includes('mp_polymer_pete'));
    assert.ok(fields.includes('mp_polymer_new_polymer'));
    assert.equal(
        entries.find(entry => entry.field === 'mp_polymer_new_polymer').label,
        'NEW-POLYMER - Future Polymer (%)'
    );
});

test('fragments use the same complete reference-driven polymer mapping', () => {
    const summary = buildParticleSummary(
        {
            fragments_count: '100',
            fragments_mass_debris_total: '0',
            fragments_method_polymer_num: '4',
            fragments_method_percent_estimate: 14,
            fragment_polymer_pete: '40',
            fragment_polymer_pla: '60'
        },
        {
            polymers: polymerReferences,
            methods: methodReferences
        }
    );
    const entries = summary.fragments.polymers;

    assert.equal(summary.fragments.mass, '0');
    assert.equal(
        summary.fragments.polymerMethod,
        'Fourier Transform Infrared Spectroscopy'
    );
    assert.equal(
        summary.fragments.percentMethod,
        'Percent calculation based on item count'
    );
    assert.deepEqual(
        entries.map(entry => entry.field),
        ['fragment_polymer_pete', 'fragment_polymer_pla']
    );
});

test('method reference IDs render as their actual method labels', () => {
    assert.equal(
        resolveMethodLabel(4, methodReferences),
        'Fourier Transform Infrared Spectroscopy'
    );
    assert.equal(
        resolveMethodLabel('14', methodReferences),
        'Percent calculation based on item count'
    );
});

test('method labels have safe fallbacks when a reference is unavailable', () => {
    assert.equal(resolveMethodLabel('999', [], 'Archived laboratory method'),
        'Archived laboratory method');
    assert.equal(resolveMethodLabel('999', []), 'Unknown method (ID 999)');
});

test('detail-section methods include actual override labels without raw IDs', () => {
    assert.deepEqual(
        getDetailMethodLabels(
            [
                { method_percent_estimate: 14 },
                { methodPercentEstimate: '14' },
                { method_percent_estimate: 4 }
            ],
            methodReferences
        ),
        [
            'Percent calculation based on item count',
            'Fourier Transform Infrared Spectroscopy'
        ]
    );
});

test('summary Edit buttons route every additional-information section to Step 4', () => {
    [
        'Environmental Conditions',
        'Additional Water Information',
        'Additional Aquatic Sediment Information',
        'Additional Terrestrial Soil Information',
        'Additional Land Surface Information',
        'Additional Mixed Media Information',
        'Other Information'
    ].forEach(sectionTitle => {
        assert.equal(resolveSectionEditPage(sectionTitle), 4);
    });

    assert.equal(resolveSectionEditPage('Location Information'), 1);
    assert.equal(resolveSectionEditPage('Sampling Event Information'), 2);
    assert.equal(resolveSectionEditPage('Sampling Weather Conditions'), 2);
    assert.equal(resolveSectionEditPage('Media Information'), 3);
    assert.equal(resolveSectionEditPage('Microplastics Polymer Types'), 5);
    assert.equal(resolveSectionEditPage('Data Validation Status'), 6);
    assert.equal(resolveSectionEditPage('Submission Notes'), 6);
});

test('numeric and string zero values are not omitted from a complete summary', () => {
    assert.equal(hasSummaryValue(0), true);
    assert.equal(hasSummaryValue('0'), true);
    assert.equal(hasSummaryValue('0.0000'), true);
    assert.equal(hasSummaryValue(''), false);
    assert.equal(hasSummaryValue('   '), false);
    assert.equal(hasSummaryValue(null), false);
});

test('browser loads summary utilities before the form handler', () => {
    const view = fs.readFileSync(
        path.join(projectRoot, 'views', 'enter_data_by_form.ejs'),
        'utf8'
    );

    const utilityIndex = view.indexOf('/js/data-summary-utils.js');
    const handlerIndex = view.indexOf('/js/form-handler.js');

    assert.ok(utilityIndex >= 0);
    assert.ok(handlerIndex >= 0);
    assert.ok(utilityIndex < handlerIndex);
});

test('active media-specific fields are assigned to named summary sections', () => {
    const handler = fs.readFileSync(
        path.join(projectRoot, 'public', 'js', 'form-handler.js'),
        'utf8'
    );
    const summaryStart = handler.indexOf('async function generateSummary()');
    const summaryEnd = handler.indexOf('function submitFormDataAndIterate()', summaryStart);
    const summarySource = handler.slice(summaryStart, summaryEnd);
    const fieldGroupsStart = summarySource.indexOf('const fieldGroups =');
    const fieldGroupsEnd = summarySource.indexOf('const fieldLabels =', fieldGroupsStart);
    const fieldGroupsSource = summarySource.slice(fieldGroupsStart, fieldGroupsEnd);

    [
        'water_type_other_description',
        'sediment_type_other_description',
        'total_water_depth',
        'sample_water_depth',
        'water_flow_velocity',
        'turbidity',
        'total_suspended_solids',
        'dissolved_oxygen',
        'water_additional_notes',
        'sediment_depth',
        'sediment_dry_weight',
        'sediment_organic_matter',
        'soil_texture',
        'soil_texture_method',
        'sediment_additional_notes',
        'soil_depth',
        'soil_sample_dry_weight',
        'soil_additional_notes',
        'surface_area_sampled',
        'permeable_surfaces',
        'impermeable_surfaces',
        'surface_additional_notes',
        'mixed_additional_notes'
    ].forEach(field => {
        assert.match(fieldGroupsSource, new RegExp(`'${field}'`));
    });
});

test('summary renderer uses the complete model and suppresses edit-only metadata', () => {
    const handler = fs.readFileSync(
        path.join(projectRoot, 'public', 'js', 'form-handler.js'),
        'utf8'
    );
    const summaryStart = handler.indexOf('async function generateSummary()');
    const summaryEnd = handler.indexOf('function submitFormDataAndIterate()', summaryStart);
    const summarySource = handler.slice(summaryStart, summaryEnd);
    const fieldGroupsStart = summarySource.indexOf('const fieldGroups =');
    const fieldGroupsEnd = summarySource.indexOf('const fieldLabels =', fieldGroupsStart);
    const fieldGroupsSource = summarySource.slice(fieldGroupsStart, fieldGroupsEnd);

    assert.match(summarySource, /buildParticleSummary\(/);
    assert.match(summarySource, /getDetailMethodLabels\(/);
    assert.match(summarySource, /resolveSectionEditPage\(/);
    assert.match(summarySource, /input\[type="radio"\]\[name\]/);

    ['edit_mode', 'sample_id', 'sampling_event_id'].forEach(field => {
        assert.match(summarySource, new RegExp(`'${field}'`));
    });
    [
        'microplastics_sample_amount',
        'fragments_sample_amount',
        'packaging_sample_amount'
    ].forEach(legacyField => {
        assert.doesNotMatch(fieldGroupsSource, new RegExp(`'${legacyField}'`));
    });

    assert.doesNotMatch(
        summarySource,
        /if \(parseInt\(formData\['packaging_count'\]\) > 0\)/
    );
});

test('media changes clear every media-specific field that could otherwise be hidden', () => {
    const handler = fs.readFileSync(
        path.join(projectRoot, 'public', 'js', 'form-handler.js'),
        'utf8'
    );
    const fieldsStart = handler.indexOf('const PAGE4_ADDITIONAL_FIELDS =');
    const fieldsEnd = handler.indexOf('const POLYMER_PERCENTAGE_GROUPS', fieldsStart);
    const fieldListSource = handler.slice(fieldsStart, fieldsEnd);

    [
        'dissolved_oxygen',
        'water_additional_notes',
        'sediment_depth',
        'sediment_dry_weight',
        'sediment_organic_matter',
        'sediment_additional_notes',
        'soil_depth',
        'soil_sample_dry_weight',
        'soil_additional_notes',
        'surface_area_sampled',
        'permeable_surfaces',
        'impermeable_surfaces',
        'surface_additional_notes',
        'mixed_additional_notes'
    ].forEach(field => {
        assert.match(fieldListSource, new RegExp(`'${field}'`));
    });

    assert.match(handler, /const mediaSpecificFields = \[[\s\S]*\.\.\.PAGE4_ADDITIONAL_FIELDS/);
    assert.match(handler, /const additionalInfoFields = \[[\s\S]*\.\.\.PAGE4_ADDITIONAL_FIELDS/);
    assert.match(
        handler,
        /If older\/edit data[\s\S]*fields\.some\(field =>[\s\S]*hasSummaryValue/
    );
});

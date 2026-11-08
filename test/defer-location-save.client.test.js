// Client side of "a new location is saved only at the final Save".
//
// Page 1 no longer POSTs /api/locations in new entries. A new location is
// checked read-only (POST /api/locations/check), held in the form state as
// location_type 'new' + new_location, and created by /api/save-form-data in
// the sample's transaction. The pure state logic lives in
// public/js/location-form-utils.js (tested directly); the wiring in
// form-handler.js and the view is checked on the source text, as the other
// client tests do.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const utils = require('../public/js/location-form-utils');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

function page1Values(overrides = {}) {
    return {
        location_name: 'Clinton River Mouth',
        location_shortcode: 'RIV',
        location_description: 'River mouth at the lake',
        latitude: '42.586000',
        longitude: '-82.818000',
        streetaddress: '',
        city: '',
        state: '',
        country: '',
        zip_code: '',
        acres: '',
        ...overrides
    };
}

function checkedPayload(overrides = {}) {
    const result = utils.validateNewLocationValues(page1Values(overrides));
    assert.equal(result.isValid, true, result.message);
    return result.locationData;
}

// Function body of a named function in form-handler.js (up to the next
// top-level/closure function declaration at the same indentation).
function functionSource(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing ${signature}`);
    const indent = source.slice(source.lastIndexOf('\n', start) + 1, start);
    const rest = source.slice(start + signature.length);
    const next = rest.search(new RegExp(`\\n${indent}(?:async )?function \\w+\\(`));
    return signature + (next >= 0 ? rest.slice(0, next) : rest);
}

// ---------- validation / payload ----------

test('new-location payload has the exact POST /api/locations body shape', () => {
    const payload = checkedPayload({ acres: ' 12 ', city: '  ' });
    assert.deepEqual(Object.keys(payload), [
        'locationName', 'locationShortCode', 'locationDescription', 'latitude', 'longitude',
        'streetAddress', 'city', 'state', 'country', 'zipCode', 'acres'
    ]);
    assert.equal(payload.locationName, 'Clinton River Mouth');
    assert.equal(payload.acres, '12');
    assert.equal(payload.city, null);
    assert.equal(payload.zipCode, null);
});

test('new-location validation keeps the page-1 rules and messages', () => {
    assert.match(utils.validateNewLocationValues(page1Values({ location_name: ' ' })).message,
        /location name is required/);
    assert.match(utils.validateNewLocationValues(page1Values({ location_shortcode: '' })).message,
        /short code is required/);
    assert.match(utils.validateNewLocationValues(page1Values({ location_description: '' })).message,
        /description is required/);
    assert.match(utils.validateNewLocationValues(page1Values({ latitude: '', longitude: '' })).message,
        /coordinates, complete address, or zip code/);
    assert.match(utils.validateNewLocationValues(page1Values({ latitude: '95' })).message,
        /valid coordinates/);
    // A full address or a zip code is enough without coordinates.
    assert.equal(utils.validateNewLocationValues(page1Values({
        latitude: '', longitude: '', streetaddress: '1 Main St', city: 'Detroit', state: 'MI', country: 'USA'
    })).isValid, true);
    assert.equal(utils.validateNewLocationValues(page1Values({
        latitude: '', longitude: '', zip_code: '48201'
    })).isValid, true);
});

// ---------- contract C2: confirm on page 1 ----------

test('confirming a new location holds it in the form state and drops every location id', () => {
    const state = {
        location_id: '17',
        selected_location_id: '17',
        location_type: 'existing',
        event_location_description: 'old override',
        event_latitude: '1',
        event_longitude: '2',
        existing_location_description: 'x',
        start_year: '2026'
    };
    const payload = checkedPayload();
    utils.applyNewLocationConfirmation(state, payload);

    assert.equal(state.location_type, 'new');
    assert.deepEqual(state.new_location, payload);
    assert.notEqual(state.new_location, payload, 'stores a copy');
    assert.equal(state.location_name, 'Clinton River Mouth');
    assert.equal(state.location_shortcode, 'RIV');
    assert.equal(state.latitude, '42.586000');
    assert.equal(state.city, '');
    assert.equal('location_id' in state, false);
    assert.equal('selected_location_id' in state, false);
    assert.equal('event_location_description' in state, false);
    assert.equal('event_latitude' in state, false);
    assert.equal('existing_location_description' in state, false);
    assert.equal(state.start_year, '2026', 'other pages are untouched');
    assert.equal(utils.hasPendingNewLocation(state), true);
    assert.equal(utils.hasConfirmedLocation(state), true);
});

test('confirming an existing location drops a held new location (no stale save)', () => {
    const state = {};
    utils.applyNewLocationConfirmation(state, checkedPayload());
    utils.applyExistingLocationConfirmation(state, {
        locationId: 42,
        locationOverrides: { description: 'Event-level note', latitude: '42.1', longitude: '-82.1' }
    });
    assert.equal(state.location_type, 'existing');
    assert.equal(state.location_id, '42');
    assert.equal('new_location' in state, false);
    assert.equal(state.event_location_description, 'Event-level note');
    assert.equal(state.event_latitude, '42.1');
    assert.equal(utils.hasPendingNewLocation(state), false);

    utils.applyExistingLocationConfirmation(state, { locationId: 42, locationOverrides: null });
    assert.equal('event_location_description' in state, false);
    assert.equal('event_latitude' in state, false);
    assert.equal('event_longitude' in state, false);
});

// ---------- payload sent to /api/save-form-data ----------

test('the save payload carries location_type + new_location and never a location id for a new location', () => {
    const state = { media_type: 'water' };
    utils.applyNewLocationConfirmation(state, checkedPayload());
    // A stale id written by change tracking must not turn it into "existing".
    state.location_id = '';
    const payload = utils.prepareLocationForSubmission(state);
    assert.equal(payload.location_type, 'new');
    assert.equal(payload.new_location.locationName, 'Clinton River Mouth');
    assert.equal('location_id' in payload, false);
    assert.equal('selected_location_id' in payload, false);
    assert.equal(state.location_id, '', 'the form state itself is not mutated');

    const existing = utils.prepareLocationForSubmission({
        location_type: 'existing', location_id: '9', new_location: { locationName: 'stale' }
    });
    assert.equal(existing.location_id, '9');
    assert.equal('new_location' in existing, false);

    // Edit My Data (legacy): a location created on Continue keeps its id.
    const edit = utils.prepareLocationForSubmission({ location_type: 'new', location_id: '77' });
    assert.equal(edit.location_id, '77');
});

test('no confirmed location means Save is blocked', () => {
    assert.equal(utils.hasConfirmedLocation({}), false);
    assert.equal(utils.hasConfirmedLocation({ location_type: 'new' }), false);
    assert.equal(utils.hasConfirmedLocation({ location_type: 'new', new_location: { locationName: ' ' } }), false);
    assert.equal(utils.hasConfirmedLocation({ location_type: 'existing', location_id: '' }), false);
    assert.equal(utils.hasConfirmedLocation({ location_type: 'existing', location_id: '3' }), true);
});

// ---------- contract C4: after a successful save ----------

test('after Save the returned locationId replaces the held new location', () => {
    const state = { start_year: '2026' };
    utils.applyNewLocationConfirmation(state, checkedPayload());
    const result = utils.applySaveResponse(state, {
        success: true, samplingEventId: 5, sampleDetailsId: 6, locationId: 123, locationName: 'Clinton River Mouth'
    });
    assert.equal(result.created, true);
    assert.equal(result.locationId, '123');
    assert.equal(result.location.locationShortCode, 'RIV');
    assert.equal(state.location_id, '123');
    assert.equal(state.location_type, 'existing');
    assert.equal('new_location' in state, false);

    // Options B/C keep location_id + location_type, so the next Save reuses
    // the location instead of inserting it a second time.
    const preserved = {};
    ['location_id', 'location_type', 'location_name', 'latitude', 'longitude', 'start_year']
        .forEach(key => { if (key in state) preserved[key] = state[key]; });
    const nextPayload = utils.prepareLocationForSubmission(preserved);
    assert.equal(nextPayload.location_id, '123');
    assert.equal(nextPayload.location_type, 'existing');
    assert.equal('new_location' in nextPayload, false);
});

test('a save that used an existing location leaves the location state alone', () => {
    const state = { location_type: 'existing', location_id: '8' };
    const result = utils.applySaveResponse(state, { success: true, locationId: 8 });
    assert.equal(result.created, false);
    assert.equal(state.location_id, '8');

    const noId = { location_type: 'new', new_location: checkedPayload() };
    const noIdResult = utils.applySaveResponse(noId, { success: true });
    assert.equal(noIdResult.created, false);
    assert.equal(noId.location_type, 'new', 'without a locationId nothing is claimed');
});

test('the saved location becomes a dropdown option in the common.js format', () => {
    const option = utils.buildLocationOption(123, checkedPayload());
    assert.equal(option.value, '123');
    assert.equal(option.text, 'Clinton River Mouth (RIV)');
    assert.equal(option.attributes['data-name'], 'Clinton River Mouth');
    assert.equal(option.attributes['data-user-loc-id'], 'RIV');
    assert.equal(option.attributes['data-description'], 'River mouth at the lake');
    assert.equal(option.attributes['data-latitude'], '42.586000');
    assert.equal(option.attributes['data-zipcode'], '');
});

// ---------- going back to page 1 ----------

test('page-1 edits after Continue are detected at Save until Continue is pressed again', () => {
    const state = {};
    utils.applyNewLocationConfirmation(state, checkedPayload());

    const same = utils.validateNewLocationValues(page1Values({ location_name: ' Clinton River Mouth ' }));
    assert.equal(utils.compareConfirmedLocation(state, same).matches, true);

    const edited = utils.validateNewLocationValues(page1Values({ location_description: 'Changed' }));
    assert.equal(utils.compareConfirmedLocation(state, edited).matches, false);

    const switched = { isValid: true, isExistingLocation: true, locationId: '4', locationOverrides: null };
    assert.equal(utils.compareConfirmedLocation(state, switched).matches, false);

    // Continue again replaces the held location with the edited details.
    utils.applyNewLocationConfirmation(state, edited.locationData);
    assert.equal(state.new_location.locationDescription, 'Changed');
    assert.equal(utils.compareConfirmedLocation(state, edited).matches, true);

    assert.equal(utils.compareConfirmedLocation(state, { isValid: false }).matches, false);
});

test('existing-location overrides must match what was confirmed', () => {
    const state = {};
    utils.applyExistingLocationConfirmation(state, {
        locationId: '4', locationOverrides: { description: 'note' }
    });
    const current = { isValid: true, isExistingLocation: true, locationId: '4', locationOverrides: { description: 'note' } };
    assert.equal(utils.compareConfirmedLocation(state, current).matches, true);
    assert.equal(utils.compareConfirmedLocation(state, { ...current, locationOverrides: null }).matches, false);
    assert.equal(utils.compareConfirmedLocation(state, { ...current, locationId: '5' }).matches, false);
});

test('page 1 can be refilled from the held new location or the selected location', () => {
    const state = {};
    utils.applyNewLocationConfirmation(state, checkedPayload({ zip_code: '48045', acres: '3' }));
    // Later page-1 change tracking must not leak into the restore.
    state.location_name = 'typed but not confirmed';
    const restoreNew = utils.getPage1RestoreValues(state);
    assert.equal(restoreNew.mode, 'new');
    assert.equal(restoreNew.selectValue, '');
    assert.equal(restoreNew.values.location_name, 'Clinton River Mouth');
    assert.equal(restoreNew.values.zip_code, '48045');
    assert.equal(restoreNew.values.acres, '3');
    assert.deepEqual(Object.keys(restoreNew.values).sort(), [...utils.PAGE1_FORM_KEYS].sort());

    const existing = {
        location_type: 'existing', location_id: '4', location_name: 'Lake', location_description: 'base',
        latitude: '1', longitude: '2', event_location_description: 'event note'
    };
    const restoreExisting = utils.getPage1RestoreValues(existing);
    assert.equal(restoreExisting.mode, 'existing');
    assert.equal(restoreExisting.selectValue, '4');
    assert.equal(restoreExisting.values.location_description, 'event note');
    assert.equal(restoreExisting.values.latitude, '1');

    assert.equal(utils.getPage1RestoreValues({}).mode, null);
    assert.equal(utils.arePage1ValuesBlank(utils.getPage1RestoreValues({}).values), true);
    assert.equal(utils.arePage1ValuesBlank(page1Values()), false);
});

// ---------- page-6 summary ----------

test('the summary shows the held new location and marks it as not saved yet', () => {
    const state = {};
    utils.applyNewLocationConfirmation(state, checkedPayload());
    state.location_description = 'unconfirmed edit';
    assert.match(utils.getLocationSummaryValue(state, 'location_status'), /saved together with this sample when you click Save/);
    assert.equal(utils.getLocationSummaryValue(state, 'location_description'), 'River mouth at the lake');
    assert.equal(utils.getLocationSummaryValue(state, 'location_shortcode'), 'RIV');
    assert.equal(utils.getLocationSummaryValue(state, 'location_id'), '');

    const existing = { location_type: 'existing', location_id: '4', location_name: 'Lake' };
    assert.equal(utils.getLocationSummaryValue(existing, 'location_status'), '');
    assert.equal(utils.getLocationSummaryValue(existing, 'location_name'), 'Lake');
    assert.equal(utils.getLocationSummaryValue(existing, 'location_id'), '4');
});

test('duplicate-name messages are recognised for the friendly text', () => {
    assert.equal(utils.isDuplicateLocationMessage('A location with this name already exists'), true);
    assert.equal(utils.isDuplicateLocationMessage('Error saving data: A location with this name already exists'), true);
    assert.equal(utils.isDuplicateLocationMessage('Location is required'), false);
    assert.match(utils.DUPLICATE_LOCATION_HELP, /Select previously sampled location/);
});

// ---------- wiring in form-handler.js and the view ----------

test('new entries check the location read-only instead of creating it on Continue', () => {
    const source = read('public/js/form-handler.js');

    const check = functionSource(source, 'async function checkAndHoldNewLocation(');
    assert.match(check, /fetch\('\/api\/locations\/check'/);
    assert.match(check, /method: 'POST'/);
    assert.match(check, /locationFormUtils\.applyNewLocationConfirmation\(formData, payload\)/);
    assert.match(check, /sessionStorage\.setItem\(formStorageKey/);
    assert.doesNotMatch(check, /fetch\('\/api\/locations',/);
    assert.doesNotMatch(check, /has been saved/);
    assert.match(check, /will be saved together with your sample when you click \$\{finalSaveButtonLabel\(\)\}/);

    // Edit My Data uses the same deferred flow: no new location is created
    // on Continue in either mode.
    const dispatch = functionSource(source, 'async function showNewLocationConfirmation(');
    assert.doesNotMatch(dispatch, /isEditMode/);
    assert.match(dispatch, /await checkAndHoldNewLocation\(locationData\)/);
    assert.doesNotMatch(source, /showNewLocationConfirmationForEdit|saveNewLocationAndProceed/);
    // The only /api/locations request left is the read-only list refresh.
    assert.equal(source.split("fetch('/api/locations',").length - 1, 1);
    const refresh = functionSource(source, 'async function refreshLocationSelectOptions(');
    assert.match(refresh, /fetch\('\/api\/locations', \{ headers: \{ 'Accept': 'application\/json' \} \}\)/);
    assert.doesNotMatch(refresh, /method:/);
    assert.doesNotMatch(source, /has been saved successfully/);
    assert.match(functionSource(source, 'function finalSaveButtonLabel('), /isEditMode \? '"Update Data"' : '"Save"'/);

    // The location select no longer keeps an edit-mode id next to a held
    // new location.
    const savePage = functionSource(source, 'function saveCurrentPageData(');
    assert.doesNotMatch(savePage, /isEditMode && formData\.location_type === 'new'/);

    const existingConfirm = functionSource(source, 'async function showExistingLocationConfirmation(');
    assert.match(existingConfirm, /locationFormUtils\.applyExistingLocationConfirmation\(formData, locationData\)/);
});

test('Save validates the held location against page 1 and builds the payload with it', () => {
    const source = read('public/js/form-handler.js');

    const pre = functionSource(source, 'function preValidateBeforeSubmit(');
    assert.match(pre, /locationFormUtils\.hasConfirmedLocation\(state\)/);
    assert.match(pre, /compareConfirmedLocation\(state, validateLocationInput\(\)\)/);
    assert.doesNotMatch(pre, /if \(!state\.location_id\)/);

    const build = functionSource(source, 'function buildSubmissionPayload(');
    assert.match(build, /locationFormUtils\.prepareLocationForSubmission\(/);

    const friendly = functionSource(source, 'function buildFriendlySaveError(');
    assert.ok(friendly.indexOf('isDuplicateLocationMessage') < friendly.indexOf("// Missing location"),
        'the duplicate-name message is not hidden by the generic location text');
});

test('after a successful save the returned location id is applied before options B/C/D', () => {
    const source = read('public/js/form-handler.js');
    const submit = functionSource(source, 'function submitFormDataAndShowNextSteps(');
    const apply = submit.indexOf('applyLocationSaveResponse(data);');
    assert.ok(apply > 0);
    assert.ok(apply < submit.indexOf('handleSavedPublication(data)'));
    assert.ok(apply < submit.indexOf('showNextStepsOptions()'));
    const helper = functionSource(source, 'function applyLocationSaveResponse(');
    assert.match(helper, /locationFormUtils\.applySaveResponse\(formData, data\)/);
    assert.match(helper, /page1LocationUi\.selectSavedLocation\(savedLocation\.locationId, savedLocation\.location\)/);
    assert.match(helper, /sessionStorage\.setItem\(formStorageKey/);

    // Options B and C keep the location type with the id.
    const b = functionSource(source, 'function handleDifferentMedia(');
    const c = functionSource(source, 'function handleSameMediaSample(');
    [b, c].forEach(handler => {
        assert.match(handler, /'location_id',\s*'location_type',/);
        assert.doesNotMatch(handler, /'new_location'/);
    });
    // Options A and D start a blank, unlocked page 1.
    assert.match(functionSource(source, 'function handleNewLocationDate('), /page1LocationUi\.resetForNewCase\(\)/);
    assert.match(functionSource(source, 'function handleSamePublication('), /page1LocationUi\.resetForNewCase\(\)/);
});

test('going back does not erase entered pages', () => {
    const source = read('public/js/form-handler.js');

    // Changing the location on page 1 no longer wipes pages 2-6.
    assert.doesNotMatch(source, /clearDataFromPages2to6/);
    const interaction = functionSource(source, 'function setupLocationSelectionInteraction(');
    assert.match(interaction, /newLocationDraft/);
    assert.match(interaction, /handleLocationSelectionChange\(true\)/);

    // Back to New Media keeps pages 1-2 and only clears pages 3-6.
    const backToMedia = functionSource(source, 'function setupBackToNewMediaFunction(');
    assert.doesNotMatch(backToMedia, /formData = \{\}/);
    assert.doesNotMatch(backToMedia, /clearAllFormFields\(\)/);
    assert.match(backToMedia, /clearMediaSpecificFields\(\)/);

    // Returning to page 1 refills it if it was emptied.
    assert.match(functionSource(source, 'function scrollToPage('), /restorePage1FromFormData\(\)/);
    const restore = functionSource(source, 'function restorePage1FromFormData(');
    assert.match(restore, /isPage1LocationBlank\(\)/);
    assert.match(restore, /syncLocationMapFromInputs/);

    // "Find Address on Map" shares the .btn-continue class but must not
    // navigate past the page-1 location check.
    assert.match(source, /event\.target\.id !== 'find-address-on-map'/);

    // The summary treats a held new location as a location.
    assert.match(source, /'location_status',\s*'location_id', 'location_name'/);
    assert.match(source, /if \(!locationFormUtils\.hasConfirmedLocation\(formData\)\) \{\s*missingRequired\.push\(\{ key: 'location_id'/);
    assert.match(source, /'new_location',/);
});

test('the form view loads location-form-utils.js before form-handler.js', () => {
    const view = read('views/enter_data_by_form.ejs');
    const utilsIndex = view.indexOf('<script src="/js/location-form-utils.js"></script>');
    assert.ok(utilsIndex > 0);
    assert.ok(utilsIndex < view.indexOf('<script src="/js/form-handler.js"></script>'));
    assert.match(view, /saved together with your sample when you click "<%= locals\.editSampleId \? 'Update Data' : 'Save' %>"/);

    const map = read('public/js/map-data-entry.js');
    assert.match(map, /window\.resetDataEntryMap = function\(\)/);
});

// ---------- follow-up fixes (cross-check) ----------

const vm = require('node:vm');

// Runs top-level functions of form-handler.js in a sandbox with the given
// globals (state variables, stubs). Only self-contained helpers are loaded.
function loadFormHandlerFunctions(signatures, globals = {}, prelude = '') {
    const source = read('public/js/form-handler.js');
    const code = prelude + '\n' + signatures.map(signature => functionSource(source, signature)).join('\n');
    const context = vm.createContext({ locationFormUtils: utils, console, ...globals });
    vm.runInContext(code, context);
    return context;
}

function fakeLocationSelect(initialOptions = [], value = '') {
    const select = {
        options: [],
        value: '',
        appendChild(option) {
            option.index = this.options.length;
            option.remove = () => {
                this.options.splice(this.options.indexOf(option), 1);
                this.options.forEach((item, index) => { item.index = index; });
            };
            this.options.push(option);
        }
    };
    const createOption = (optionValue, text, name) => {
        const option = { value: optionValue, textContent: text, attributes: {} };
        option.setAttribute = (key, attr) => { option.attributes[key] = String(attr); };
        if (name !== undefined) option.setAttribute('data-name', name);
        return option;
    };
    select.appendChild(createOption('', '-- Select --'));
    initialOptions.forEach(item => select.appendChild(createOption(item.value, item.name, item.name)));
    select.value = value;
    return { select, createOption };
}

const DUPLICATE_HELPERS = [
    'function finalSaveButtonLabel(',
    'function normalizeLocationNameForMatch(',
    'function locationNameInList(',
    'function buildDuplicateLocationText(',
    'async function refreshLocationSelectOptions(',
    'async function describeDuplicateLocationName(',
    'async function buildSaveErrorMessage(',
    'function fetchSaveRequest(',
    'function buildFriendlySaveError('
];

function duplicateSandbox({ ownLocations = [], listFails = false, saveFails = false, selected = '' } = {}) {
    const { select, createOption } = fakeLocationSelect([{ value: '7', name: 'Old Pond' }], selected);
    const requests = [];
    const fetchStub = async (url, options = {}) => {
        requests.push({ url, method: options.method || 'GET' });
        if (url === '/api/locations') {
            if (listFails) throw new TypeError('Failed to fetch');
            return { ok: true, json: async () => ({ success: true, locations: ownLocations }) };
        }
        if (saveFails) throw new TypeError('Failed to fetch');
        return { ok: false, status: 400, json: async () => ({ success: false, message: 'A location with this name already exists' }) };
    };
    const context = loadFormHandlerFunctions(DUPLICATE_HELPERS, {
        fetch: fetchStub,
        document: {
            getElementById: id => (id === 'location-select' ? select : null),
            createElement: () => createOption('', '')
        }
    }, 'var saveOutcomeUncertain = false; var isEditMode = false;');
    return { context, select, requests };
}

const DUPLICATE_RESPONSE = { success: false, message: 'A location with this name already exists' };

test('a taken name at Save refreshes the location list and says whether it can be selected', async () => {
    const own = duplicateSandbox({
        ownLocations: [
            { id: 7, name: 'Old Pond', userLocId: 'POND' },
            { id: 12, name: 'Creek A', userLocId: 'CRK', description: 'Upstream', latitude: '42.1', longitude: '-83.2' }
        ],
        selected: ''
    });
    const ownText = await own.context.buildSaveErrorMessage(400, DUPLICATE_RESPONSE, {
        location_type: 'new', new_location: { locationName: ' creek a ' }
    });
    assert.deepEqual(own.requests, [{ url: '/api/locations', method: 'GET' }]);
    assert.match(ownText, /You already have a location "creek a"/);
    assert.match(ownText, /select it under "1\. Select previously sampled location" \(the list has been refreshed\)/);
    assert.match(ownText, /Nothing was saved by this attempt/);
    // The dropdown now lists the location (common.js option format).
    const creek = own.select.options.find(option => option.value === 12);
    assert.ok(creek, 'refreshed option added');
    assert.equal(creek.textContent, 'Creek A (CRK)');
    assert.equal(creek.attributes['data-name'], 'Creek A');
    assert.equal(creek.attributes['data-description'], 'Upstream');

    const other = duplicateSandbox({ ownLocations: [{ id: 7, name: 'Old Pond' }] });
    const otherText = await other.context.buildSaveErrorMessage(400, DUPLICATE_RESPONSE, {
        location_type: 'new', new_location: { locationName: 'Creek A' }
    });
    assert.match(otherText, /already used by another location \(it may have been entered by another account\)/);
    assert.doesNotMatch(otherText, /select it under/);

    const offline = duplicateSandbox({ listFails: true });
    const offlineText = await offline.context.buildSaveErrorMessage(400, DUPLICATE_RESPONSE, {
        location_type: 'new', new_location: { locationName: 'Creek A' }
    });
    assert.match(offlineText, new RegExp(utils.DUPLICATE_LOCATION_HELP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('refreshing the location list keeps the current selection', async () => {
    const { context, select } = duplicateSandbox({
        ownLocations: [{ id: '7', name: 'Old Pond' }, { id: '9', name: 'Lake' }],
        selected: '7'
    });
    const rows = await context.refreshLocationSelectOptions();
    assert.equal(rows.length, 2);
    assert.equal(select.value, '7');
    assert.deepEqual(select.options.map(option => option.value), ['', '7', '9']);
});

test('a duplicate after a lost Save response does not claim that nothing was saved', async () => {
    const { context, requests } = duplicateSandbox({ saveFails: true });
    await assert.rejects(
        context.fetchSaveRequest('/api/save-form-data', { method: 'POST' }),
        /not known whether this sample was saved\. Please check My Samples/
    );
    assert.equal(context.saveOutcomeUncertain, true);

    const text = await context.buildSaveErrorMessage(400, DUPLICATE_RESPONSE, {
        location_type: 'new', new_location: { locationName: 'Creek A' }
    });
    assert.match(text, /Your previous Save may have gone through/);
    assert.match(text, /check whether this sample was saved before you save it again/);
    assert.doesNotMatch(text, /Nothing was saved/);
    // The list is not even needed for that advice.
    assert.deepEqual(requests.map(r => r.url), ['/api/save-form-data']);
    // The sync fallback agrees.
    assert.doesNotMatch(context.buildFriendlySaveError(400, DUPLICATE_RESPONSE, {
        location_type: 'new', new_location: { locationName: 'Creek A' }
    }), /Nothing was saved/);

    const source = read('public/js/form-handler.js');
    // Every save request goes through the wrapper and the async message.
    assert.equal(source.split('fetch(saveRequest.url').length - 1, 0);
    assert.equal(source.split('fetchSaveRequest(saveRequest.url').length - 1, 4);
    assert.equal(source.split('await buildSaveErrorMessage(response.status, data, formData)').length - 1, 4);
    // A successful save or a new page-1 check clears the uncertainty.
    assert.match(functionSource(source, 'function markFormSaved('), /saveOutcomeUncertain = false/);
    assert.match(functionSource(source, 'async function checkAndHoldNewLocation('), /saveOutcomeUncertain = false;/);
    // The page-1 check uses the same refreshed-list advice.
    assert.match(functionSource(source, 'async function checkAndHoldNewLocation('),
        /await describeDuplicateLocationName\(payload && payload\.locationName\)/);
});

test('leaving the page with unsaved input (or a held new location) asks first', () => {
    const source = read('public/js/form-handler.js');
    assert.match(source, /window\.addEventListener\('beforeunload', function\(event\) \{\s*if \(!formHasUnsavedChanges\) return;\s*event\.preventDefault\(\);\s*event\.returnValue = '';/);
    const tracking = functionSource(source, 'function setupFormFieldTracking(');
    assert.match(tracking, /addEventListener\('input'[\s\S]*markFormDirty\(\)/);
    assert.match(tracking, /if \(!isEditMode\) markFormDirty\(\);/);
    assert.match(functionSource(source, 'async function checkAndHoldNewLocation('), /markFormDirty\(\);/);

    // Cleared after every successful save, before the next-step options.
    const submit = functionSource(source, 'function submitFormDataAndShowNextSteps(');
    assert.ok(submit.indexOf('markFormSaved();') > 0);
    assert.ok(submit.indexOf('markFormSaved();') < submit.indexOf('showNextStepsOptions()'));
    assert.ok(submit.indexOf('markFormSaved();') < submit.indexOf("window.location.href = '/my-samples'"));
    assert.equal(source.split('markFormSaved();').length - 1, 4);
});

test('options B and C keep (and save) every page-2 value that stays on screen', () => {
    const source = read('public/js/form-handler.js');
    const b = functionSource(source, 'function handleDifferentMedia(');
    const c = functionSource(source, 'function handleSameMediaSample(');
    [b, c].forEach(handler => {
        assert.match(handler, /\.\.\.capturePage2FieldNames\(\)/);
        assert.ok(handler.indexOf('capturePage2FieldNames()') < handler.indexOf('formData = preservedData'));
    });
    const capture = functionSource(source, 'function capturePage2FieldNames(');
    assert.match(capture, /savePageData\(2\)/);
    assert.match(capture, /page2\.querySelectorAll\('\[name\]'\)/);

    // The page-2 view really has the fields that used to be dropped.
    const page2 = read('views/data_forms/formpage2.ejs');
    ['sample_description', 'air_temp', 'current_conditions', 'rainfall'].forEach(name => {
        assert.match(page2, new RegExp(`name="${name}"`));
    });
});

test('Continue saves the page it is on and Save captures every loaded page', () => {
    const source = read('public/js/form-handler.js');

    // savePageData points saveCurrentPageData at one page and restores currentPage.
    let saved = [];
    const context = loadFormHandlerFunctions(['function savePageData('], {
        document: { getElementById: id => (/^form-page[2-6]$/.test(id) ? {} : null) },
        saveCurrentPageData: () => { saved.push(context.currentPage); }
    }, 'var currentPage = 4;');
    assert.equal(context.savePageData(2), true);
    assert.equal(context.savePageData(1), false);
    assert.deepEqual(saved, [2]);
    assert.equal(context.currentPage, 4);

    saved = [];
    const all = loadFormHandlerFunctions(['function savePageData(', 'function captureLoadedFormPages('], {
        document: { getElementById: id => (/^form-page[2-5]$/.test(id) ? {} : null) },
        saveCurrentPageData: () => { saved.push(all.currentPage); }
    }, 'var currentPage = 2;');
    all.captureLoadedFormPages();
    assert.deepEqual(saved, [2, 3, 4, 5], 'page 1 (held location) is not re-read; missing pages are skipped');
    assert.equal(all.currentPage, 2);

    const nav = functionSource(source, 'function setupNavigationButtons(');
    assert.match(nav, /const ownerPage = ownerMatch \? parseInt\(ownerMatch\[1\], 10\) : currentPage;/);
    assert.match(nav, /if \(!savePageData\(ownerPage\)\) saveCurrentPageData\(\);/);
    assert.match(nav, /: ownerPage \+ 1;/);
    assert.match(nav, /if \(isEditMode\) \{\s*saveCurrentPageData\(\);\s*\} else \{\s*captureLoadedFormPages\(\);\s*\}/);
    assert.match(functionSource(source, 'function validatePage2('), /savePageData\(2\);/);
});

test('the data source carry-forward never replaces a source already entered on page 2', () => {
    const context = loadFormHandlerFunctions(['function hasAnyDataSourceInput('], {
        DATA_SOURCE_FORM_FIELDS: ['data_source_id', 'data_source_type_id', 'source_title']
    });
    assert.equal(context.hasAnyDataSourceInput({}), false);
    assert.equal(context.hasAnyDataSourceInput({ data_source_id: '', data_source_type_id: '  ', source_title: null }), false);
    assert.equal(context.hasAnyDataSourceInput({ data_source_id: '', source_title: 'T' }), true);
    assert.equal(context.hasAnyDataSourceInput({ data_source_type_id: '3' }), true);

    const carry = functionSource(read('public/js/form-handler.js'), 'function applyPublicationCarryForward(');
    assert.match(carry, /if \(!hasAnyDataSourceInput\(formData\)\) \{\s*Object\.entries\(publicationData\)/);
});

test('changing the existing location after Continue is caught at Save and keeps confirmed overrides', () => {
    const source = read('public/js/form-handler.js');

    // The change tracker no longer rewrites the confirmed location id.
    const tracking = functionSource(source, 'function setupFormFieldTracking(');
    assert.match(tracking, /if \(element\.name === 'location_id' && !isEditMode\) \{\s*return;\s*\}/);

    // So switching A -> B without Continue no longer matches.
    const state = utils.applyExistingLocationConfirmation({}, {
        locationId: '5', locationOverrides: { description: 'Event description' }
    });
    assert.equal(utils.compareConfirmedLocation(state, {
        isValid: true, isExistingLocation: true, locationId: '6', locationOverrides: null
    }).matches, false);

    // In new entries the select keeps event_* with the confirmed location...
    const interaction = functionSource(source, 'function setupLocationSelectionInteraction(');
    assert.match(interaction, /locationSelect\.addEventListener\('change', function\(\) \{[\s\S]*?if \(isEditMode\) \{\s*delete formData\['event_location_description'\];/);
    // ...and shows them again when the confirmed location is re-selected.
    assert.match(interaction, /const confirmedOverrides = getConfirmedOverridesForLocation\(selectedOption\.value\);/);

    const overrides = loadFormHandlerFunctions(['function getConfirmedOverridesForLocation('], {}, 'var isEditMode = false; var formData = {};');
    overrides.formData = state;
    vm.runInContext('formData = this.formData', overrides);
    assert.deepEqual({ ...overrides.getConfirmedOverridesForLocation('5') }, { description: 'Event description' });
    assert.deepEqual({ ...overrides.getConfirmedOverridesForLocation('6') }, {});
    state.event_latitude = '42.5';
    state.event_longitude = '-83.1';
    assert.deepEqual({ ...overrides.getConfirmedOverridesForLocation('5') },
        { description: 'Event description', latitude: '42.5', longitude: '-83.1' });
    // Matching the re-filled page 1 against the confirmation succeeds.
    assert.equal(utils.compareConfirmedLocation(state, {
        isValid: true, isExistingLocation: true, locationId: '5',
        locationOverrides: { description: 'Event description', latitude: '42.5', longitude: '-83.1' }
    }).matches, true);
});

test('Edit My Data also holds a new location and checks page 1 against it at Save', () => {
    const source = read('public/js/form-handler.js');
    const pre = functionSource(source, 'function preValidateBeforeSubmit(');
    assert.match(pre, /\(!isEditMode \|\| locationFormUtils\.hasPendingNewLocation\(state\)\) &&\s*document\.getElementById\('form-page1'\)/);
    // PUT /api/my-samples/:id/form-data receives the held location the same way.
    assert.match(functionSource(source, 'function getSaveRequestConfig('), /\/api\/my-samples\//);
    assert.match(functionSource(source, 'function buildSubmissionPayload('), /prepareLocationForSubmission/);
});

// ---------- Edit My Data: the held location is written by Update ----------

function saveResponseSandbox({ isEditMode }) {
    const stored = {};
    const selected = [];
    const context = loadFormHandlerFunctions(['function applyLocationSaveResponse('], {
        sessionStorage: { setItem: (key, value) => { stored[key] = value; } },
        page1LocationUi: {
            selectSavedLocation: (locationId, location) => { selected.push({ locationId, location }); return true; }
        }
    }, `var formData = {}; var formStorageKey = 'microplastics_form_data'; var isEditMode = ${isEditMode};`);
    return { context, stored, selected };
}

test('Edit My Data applies the returned locationId after a successful Update', () => {
    const { context, stored, selected } = saveResponseSandbox({ isEditMode: true });
    // An edited sample whose page 1 was switched to a new location: the
    // loaded location id was dropped when the new location was confirmed.
    context.formData = { sample_id: '55', edit_mode: 'true', location_id: '9', location_type: 'existing' };
    utils.applyNewLocationConfirmation(context.formData, checkedPayload());

    // What PUT /api/my-samples/:id/form-data receives.
    const payload = utils.prepareLocationForSubmission(context.formData);
    assert.equal(payload.location_type, 'new');
    assert.equal(payload.new_location.locationName, 'Clinton River Mouth');
    assert.equal('location_id' in payload, false);

    const result = context.applyLocationSaveResponse({
        success: true, sampleId: 55, locationId: 321, locationName: 'Clinton River Mouth'
    });
    assert.equal(result.created, true);
    assert.equal(context.formData.location_id, '321');
    assert.equal(context.formData.location_type, 'existing');
    assert.equal('new_location' in context.formData, false);
    assert.deepEqual(selected.map(item => item.locationId), ['321']);
    assert.equal(JSON.parse(stored.microplastics_form_data).location_id, '321');

    // A second Update click before the redirect reuses the location.
    const repeat = utils.prepareLocationForSubmission(context.formData);
    assert.equal(repeat.location_id, '321');
    assert.equal('new_location' in repeat, false);
});

test('Edit My Data keeps its existing location when Update succeeds without a new one', () => {
    const { context, selected } = saveResponseSandbox({ isEditMode: true });
    context.formData = { sample_id: '55', location_id: '9', location_type: 'existing' };
    const result = context.applyLocationSaveResponse({ success: true, locationId: 9 });
    assert.equal(result.created, false);
    assert.equal(context.formData.location_id, '9');
    assert.deepEqual(selected, []);
});

test('every save path applies the save response in both modes before the redirect', () => {
    const source = read('public/js/form-handler.js');
    // One call per successful save request, right after markFormSaved().
    assert.equal(source.split('markFormSaved();\n').length - 1, 4);
    assert.equal(source.split(/markFormSaved\(\);\n\s*(?:\/\/[^\n]*\n\s*)*applyLocationSaveResponse\(data\);/).length - 1, 4);

    const submit = functionSource(source, 'function submitFormDataAndShowNextSteps(');
    // Not limited to new entries any more...
    assert.doesNotMatch(submit, /if \(!isEditMode\) \{\s*(?:\/\/[^\n]*\s*)*const savedLocation/);
    // ...and done before the Edit My Data redirect.
    const apply = submit.indexOf('applyLocationSaveResponse(data);');
    assert.ok(apply > 0);
    assert.ok(apply < submit.indexOf("window.location.href = '/my-samples'"));

    // Update goes to the PUT endpoint with the same payload builder.
    const config = functionSource(source, 'function getSaveRequestConfig(');
    assert.match(config, /isEditMode && editSampleId[\s\S]*\/api\/my-samples\/\$\{encodeURIComponent\(editSampleId\)\}\/form-data[\s\S]*method: 'PUT'/);
    assert.match(submit, /const requestPayload = buildSubmissionPayload\(formData\);/);
});

test('the page text names the final button of the current mode', () => {
    const state = {};
    utils.applyNewLocationConfirmation(state, checkedPayload());
    assert.match(utils.getLocationSummaryValue(state, 'location_status', { saveLabel: 'Update Data' }),
        /saved together with this sample when you click Update Data\)$/);
    assert.match(utils.getLocationSummaryValue(state, 'location_status'), /when you click Save\)$/);
    assert.equal(utils.NEW_LOCATION_STATUS_TEXT, utils.newLocationStatusText('Save'));

    const source = read('public/js/form-handler.js');
    assert.match(source, /locationFormUtils\.getLocationSummaryValue\(formData, field, \{\s*saveLabel: isEditMode \? 'Update Data' : 'Save'\s*\}\)/);
    const check = functionSource(source, 'async function checkAndHoldNewLocation(');
    assert.match(check, /when you click \$\{finalSaveButtonLabel\(\)\}/);
    // The edit page relabels the final button "Update Data".
    assert.match(functionSource(source, 'async function initializeEditModeIfNeeded('),
        /saveButton\.textContent = 'Update Data';/);
});

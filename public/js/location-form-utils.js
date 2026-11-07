// Page-1 (sampling location) state helpers for the data-entry form.
//
// A new location is NOT written to the database when page 1 is confirmed.
// Its details are checked read-only (POST /api/locations/check) and held in
// the form state as `location_type: 'new'` plus `new_location` (the same
// camelCase object POST /api/locations takes). The final save request then
// inserts the Location row in the same transaction as the sample (POST
// /api/save-form-data for a new entry, PUT /api/my-samples/:id/form-data in
// Edit My Data), so a failed save leaves no orphan location. These helpers keep that state consistent;
// they are pure (no DOM, no fetch) so they can be unit-tested with node:test.
(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.LocationFormUtils = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // payloadKey: the POST /api/locations(/check) body key.
    // formKey: the page-1 input name (and the snake_case form-state key).
    const NEW_LOCATION_FIELDS = [
        { payloadKey: 'locationName', formKey: 'location_name', label: 'Location Name' },
        { payloadKey: 'locationShortCode', formKey: 'location_shortcode', label: 'Location Short Code' },
        { payloadKey: 'locationDescription', formKey: 'location_description', label: 'Location Description' },
        { payloadKey: 'latitude', formKey: 'latitude', label: 'Latitude' },
        { payloadKey: 'longitude', formKey: 'longitude', label: 'Longitude' },
        { payloadKey: 'streetAddress', formKey: 'streetaddress', label: 'Street Address' },
        { payloadKey: 'city', formKey: 'city', label: 'City' },
        { payloadKey: 'state', formKey: 'state', label: 'State' },
        { payloadKey: 'country', formKey: 'country', label: 'Country' },
        { payloadKey: 'zipCode', formKey: 'zip_code', label: 'Zip Code' },
        { payloadKey: 'acres', formKey: 'acres', label: 'Area (acres)' }
    ];

    const PAGE1_FORM_KEYS = NEW_LOCATION_FIELDS.map(field => field.formKey);
    const EVENT_OVERRIDE_KEYS = ['event_location_description', 'event_latitude', 'event_longitude'];
    const EXISTING_SNAPSHOT_KEYS = [
        'existing_location_description',
        'existing_location_latitude',
        'existing_location_longitude'
    ];

    // saveLabel: the final button ("Save" for a new entry, "Update Data" in
    // Edit My Data).
    function newLocationStatusText(saveLabel) {
        const label = String(saveLabel || '').trim() || 'Save';
        return `New location (not saved yet: it will be saved together with this sample when you click ${label})`;
    }

    const NEW_LOCATION_STATUS_TEXT = newLocationStatusText('Save');

    function text(value) {
        if (value === null || value === undefined) return '';
        return String(value).trim();
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    // Reads the page-1 values (keyed by formKey) out of any object that holds
    // them by input name, e.g. the snake_case form state.
    function pickPage1Values(source) {
        const values = {};
        PAGE1_FORM_KEYS.forEach(key => {
            values[key] = text(source && source[key]);
        });
        return values;
    }

    function arePage1ValuesBlank(values) {
        return PAGE1_FORM_KEYS.every(key => text(values && values[key]) === '');
    }

    // Builds the POST /api/locations(/check) body from page-1 values. Optional
    // empty fields are null, exactly as the client has always sent them.
    function buildNewLocationPayload(values) {
        const payload = {};
        NEW_LOCATION_FIELDS.forEach(field => {
            const value = text(values && values[field.formKey]);
            const required = field.payloadKey === 'locationName' ||
                field.payloadKey === 'locationShortCode' ||
                field.payloadKey === 'locationDescription';
            payload[field.payloadKey] = required ? value : (value || null);
        });
        return payload;
    }

    function isValidCoordinatePair(latitude, longitude) {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        return !(isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180);
    }

    // Client-side pre-check for a new location (Option 2 on page 1). The
    // server repeats the same rules on /api/locations/check and on Save.
    function validateNewLocationValues(values) {
        const v = pickPage1Values(values);

        if (!v.location_name) {
            return {
                isValid: false,
                message: 'A location name is required for new locations. Or select an existing location to continue.'
            };
        }
        if (!v.location_shortcode) {
            return { isValid: false, message: 'Location short code is required for new locations.' };
        }
        if (!v.location_description) {
            return { isValid: false, message: 'Location description is required for new locations.' };
        }

        const hasCoordinates = v.latitude && v.longitude;
        const hasAddress = v.streetaddress && v.city && v.state && v.country;
        if (!hasCoordinates && !hasAddress && !v.zip_code) {
            return {
                isValid: false,
                message: 'Please provide either coordinates, complete address, or zip code for the new location.'
            };
        }

        if ((v.latitude || v.longitude) && !isValidCoordinatePair(v.latitude, v.longitude)) {
            return {
                isValid: false,
                message: 'Please provide valid coordinates (latitude: -90 to 90, longitude: -180 to 180).'
            };
        }

        return {
            isValid: true,
            isExistingLocation: false,
            locationData: buildNewLocationPayload(v)
        };
    }

    // Normalised comparison of two new-location payloads (null, '' and
    // surrounding spaces are treated alike).
    function sameNewLocation(a, b) {
        if (!isPlainObject(a) || !isPlainObject(b)) return false;
        return NEW_LOCATION_FIELDS.every(field =>
            text(a[field.payloadKey]) === text(b[field.payloadKey])
        );
    }

    function clearEventOverrides(state) {
        EVENT_OVERRIDE_KEYS.forEach(key => { delete state[key]; });
    }

    // Page-1 confirm of a NEW location (contract C2). Nothing is written to
    // the database here; the details travel with the sample to Save.
    function applyNewLocationConfirmation(state, payload) {
        const copy = {};
        NEW_LOCATION_FIELDS.forEach(field => {
            const value = payload ? payload[field.payloadKey] : null;
            copy[field.payloadKey] = value === undefined ? null : value;
        });

        state.location_type = 'new';
        state.new_location = copy;
        state.location_name = text(copy.locationName);
        // Mirror the snake_case keys so the summary and the post-save options
        // see the same values that will be saved.
        NEW_LOCATION_FIELDS.forEach(field => {
            state[field.formKey] = text(copy[field.payloadKey]);
        });

        delete state.location_id;
        delete state.selected_location_id;
        clearEventOverrides(state);
        EXISTING_SNAPSHOT_KEYS.forEach(key => { delete state[key]; });
        return state;
    }

    // Page-1 confirm of an EXISTING location (contract C2).
    function applyExistingLocationConfirmation(state, selection) {
        const locationId = selection && selection.locationId;
        const overrides = (selection && selection.locationOverrides) || null;

        state.location_id = String(locationId);
        state.location_type = 'existing';
        delete state.new_location;
        delete state.selected_location_id;

        if (overrides && overrides.description) {
            state.event_location_description = overrides.description;
        } else {
            delete state.event_location_description;
        }
        if (overrides && overrides.latitude && overrides.longitude) {
            state.event_latitude = overrides.latitude;
            state.event_longitude = overrides.longitude;
        } else {
            delete state.event_latitude;
            delete state.event_longitude;
        }
        return state;
    }

    function hasPendingNewLocation(state) {
        return Boolean(state) &&
            state.location_type === 'new' &&
            isPlainObject(state.new_location) &&
            text(state.new_location.locationName) !== '';
    }

    function hasConfirmedLocation(state) {
        if (!state) return false;
        return hasPendingNewLocation(state) ||
            Boolean(text(state.location_id) || text(state.selected_location_id));
    }

    // Keeps the location part of the save request unambiguous: a pending new
    // location never travels with a location id, and an existing location
    // never carries stale new-location details.
    function prepareLocationForSubmission(payload) {
        const result = { ...payload };
        if (result.location_type === 'new' && isPlainObject(result.new_location)) {
            // The new location is what page 1 confirmed last; any id left
            // next to it is stale.
            delete result.location_id;
            delete result.selected_location_id;
            return result;
        }
        delete result.new_location;
        return result;
    }

    // After a successful save or update (contract C4): the location now
    // exists, so the follow-up options (same location) and a repeated
    // Save/Update must reuse its id and never try to create it again.
    function applySaveResponse(state, response) {
        const wasNew = hasPendingNewLocation(state);
        const savedLocation = wasNew ? { ...state.new_location } : null;
        const rawId = response && response.locationId;
        const hasId = rawId !== undefined && rawId !== null && text(rawId) !== '';

        if (!hasId) {
            return { created: false, locationId: text(state && state.location_id) || null, location: null };
        }

        if (wasNew || !text(state.location_id)) {
            state.location_id = String(rawId);
            state.location_type = 'existing';
            delete state.new_location;
            delete state.selected_location_id;
            if (response.locationName && !text(state.location_name)) {
                state.location_name = String(response.locationName);
            }
        }

        return {
            created: wasNew,
            locationId: String(state.location_id),
            location: savedLocation
                ? { ...savedLocation, locationName: text(response.locationName) || savedLocation.locationName }
                : null
        };
    }

    // Compares what page 1 shows now (the validateLocationInput() result)
    // with what was confirmed with Continue. Edits made on page 1 after
    // Continue have not been checked, so Save must not pick them up silently.
    function compareConfirmedLocation(state, current) {
        if (!current || !current.isValid) {
            return { matches: false, reason: 'invalid' };
        }

        if (current.isExistingLocation) {
            if (!state || state.location_type === 'new' ||
                text(state.location_id) !== text(current.locationId)) {
                return { matches: false, reason: 'location-changed' };
            }
            const overrides = current.locationOverrides || {};
            const sameDescription = text(overrides.description) === text(state.event_location_description);
            const sameLatitude = text(overrides.latitude) === text(state.event_latitude);
            const sameLongitude = text(overrides.longitude) === text(state.event_longitude);
            if (!sameDescription || !sameLatitude || !sameLongitude) {
                return { matches: false, reason: 'overrides-changed' };
            }
            return { matches: true };
        }

        if (!hasPendingNewLocation(state)) {
            return { matches: false, reason: 'location-changed' };
        }
        if (!sameNewLocation(state.new_location, current.locationData)) {
            return { matches: false, reason: 'new-location-edited' };
        }
        return { matches: true };
    }

    // What page 1 should show for the confirmed location (used when page 1
    // has to be refilled from the form state).
    function getPage1RestoreValues(state) {
        if (hasPendingNewLocation(state)) {
            const values = {};
            NEW_LOCATION_FIELDS.forEach(field => {
                values[field.formKey] = text(state.new_location[field.payloadKey]);
            });
            return { mode: 'new', selectValue: '', values };
        }

        if (state && text(state.location_id)) {
            const values = pickPage1Values(state);
            if (text(state.event_location_description)) {
                values.location_description = text(state.event_location_description);
            }
            if (text(state.event_latitude) && text(state.event_longitude)) {
                values.latitude = text(state.event_latitude);
                values.longitude = text(state.event_longitude);
            }
            return { mode: 'existing', selectValue: text(state.location_id), values };
        }

        return { mode: null, selectValue: '', values: pickPage1Values({}) };
    }

    // Location rows of the page-6 summary. For a pending new location the
    // rows show the confirmed new-location details (what Save will create).
    // options.saveLabel names the final button in the status row.
    function getLocationSummaryValue(state, field, options) {
        const pending = hasPendingNewLocation(state);
        if (field === 'location_status') {
            return pending ? newLocationStatusText(options && options.saveLabel) : '';
        }
        if (!pending) {
            return state ? state[field] : undefined;
        }
        if (field === 'location_id') {
            return '';
        }
        const mapped = NEW_LOCATION_FIELDS.find(item => item.formKey === field);
        if (mapped) {
            return text(state.new_location[mapped.payloadKey]);
        }
        if (EVENT_OVERRIDE_KEYS.includes(field)) {
            return '';
        }
        return state[field];
    }

    function buildNewLocationConfirmationDetails(payload) {
        const p = payload || {};
        const address = text(p.streetAddress)
            ? [p.streetAddress, p.city, p.state, p.country].map(text).filter(Boolean).join(', ')
            : '';
        return [
            `Location Name: ${text(p.locationName) || 'Not specified'}`,
            `Location Short Code: ${text(p.locationShortCode) || 'Not specified'}`,
            `Location Description: ${text(p.locationDescription) || 'Not specified'}`,
            `Latitude: ${text(p.latitude) || 'Not specified'}`,
            `Longitude: ${text(p.longitude) || 'Not specified'}`,
            `Address: ${address || 'Not specified'}`,
            `Zip Code: ${text(p.zipCode) || 'Not specified'}`,
            `Area (acres): ${text(p.acres) || 'Not specified'}`
        ].join('\n');
    }

    // Option for the "Select previously sampled location" dropdown, in the
    // same shape public/js/common.js builds from GET /api/locations.
    function buildLocationOption(locationId, payload) {
        const p = payload || {};
        const name = text(p.locationName);
        const shortCode = text(p.locationShortCode);
        return {
            value: String(locationId),
            text: shortCode ? `${name} (${shortCode})` : name,
            attributes: {
                'data-name': name,
                'data-user-loc-id': shortCode,
                'data-description': text(p.locationDescription),
                'data-city': text(p.city),
                'data-state': text(p.state),
                'data-zipcode': text(p.zipCode),
                'data-latitude': text(p.latitude),
                'data-longitude': text(p.longitude)
            }
        };
    }

    // Friendly message for a failed location check or a failed Save caused
    // by the location name being taken.
    function isDuplicateLocationMessage(message) {
        return /location with this name already exists/i.test(String(message || ''));
    }

    const DUPLICATE_LOCATION_HELP =
        'A location with this name already exists. If you re-visited the same location (repeat sampling), ' +
        'select it under "1. Select previously sampled location" instead. Otherwise enter a different location name.';

    return {
        NEW_LOCATION_FIELDS,
        PAGE1_FORM_KEYS,
        EVENT_OVERRIDE_KEYS,
        EXISTING_SNAPSHOT_KEYS,
        NEW_LOCATION_STATUS_TEXT,
        newLocationStatusText,
        DUPLICATE_LOCATION_HELP,
        pickPage1Values,
        arePage1ValuesBlank,
        buildNewLocationPayload,
        validateNewLocationValues,
        sameNewLocation,
        applyNewLocationConfirmation,
        applyExistingLocationConfirmation,
        hasPendingNewLocation,
        hasConfirmedLocation,
        prepareLocationForSubmission,
        applySaveResponse,
        compareConfirmedLocation,
        getPage1RestoreValues,
        getLocationSummaryValue,
        buildNewLocationConfirmationDetails,
        buildLocationOption,
        isDuplicateLocationMessage
    };
}));

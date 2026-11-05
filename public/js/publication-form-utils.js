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

    // [form field name, key in a /api/data-sources row]. The form still posts
    // the pre-redesign publication_* field names (the API accepts both); the
    // values come from the DataSourceReference columns
    // (db/20261105_redesign_data_source_tables.sql).
    const PUBLICATION_FIELD_MAP = [
        ['publication_year', 'publication_year'],
        ['publication_authors', 'authors_or_organization'],
        ['publication_journal', 'journal_publisher_or_repository'],
        ['publication_full_citation_apa', 'citation_text'],
        ['publication_pub_source_code', 'source_type_id']
    ];

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
            publication.publication_year,
            publication.authors_or_organization || publication.publication_authors,
            publication.source_title,
            publication.journal_publisher_or_repository || publication.publication_journal
        ]
            .map(value => String(value || '').trim())
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
            fields[fieldName] = publication[publicationKey] ?? '';
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
        PUBLICATION_FIELD_MAP,
        getPublicationOptionLabel,
        getPublicationSelectionState,
        setPublicationFieldsLocked
    };
}));

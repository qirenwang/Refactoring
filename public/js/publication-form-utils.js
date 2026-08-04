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

    const PUBLICATION_FIELD_MAP = [
        ['publication_year', 'publication_year'],
        ['publication_authors', 'publication_authors'],
        ['publication_journal', 'publication_journal'],
        ['publication_full_citation_apa', 'publication_full_citation_apa'],
        ['publication_pub_source_code', 'publication_pub_source_code']
    ];

    function getPublicationOptionLabel(publication = {}) {
        const citation = String(publication.publication_full_citation_apa || '').trim();
        if (citation) {
            return citation;
        }

        const fallbackParts = [
            publication.publication_year,
            publication.publication_authors,
            publication.publication_journal
        ]
            .map(value => String(value || '').trim())
            .filter(Boolean);

        return fallbackParts.join(' - ') || 'Untitled publication';
    }

    function getPublicationSelectionState(publicationId, publications = []) {
        const selectedId = String(publicationId || '');
        const publication = publications.find(item =>
            String(item.publication_id_num) === selectedId
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

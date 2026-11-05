-- Data-source redesign: PubSource_Ref -> DataSourceTypeReference (8 types) and
-- Publications -> DataSourceReference (10-field structure), per the PI's
-- Comments-20261103 request.
--
-- Why: the old "publication" model only described peer-reviewed / agency
-- publications (Year, Authors and Journal were all NOT NULL), so unpublished
-- research, community and citizen-science data could not be described at all.
-- The PI asked for eight source types split into Published (1-4) and
-- Unpublished (5-8), and for a data-source record that fits both. The PI and
-- the team browse the tables in phpMyAdmin, so the PI's table and column names
-- are adopted verbatim.
--
-- What this migration does (every step is guarded, so re-running it is a no-op):
--
--   1. RENAME TABLE PubSource_Ref -> DataSourceTypeReference and
--      Publications -> DataSourceReference. RENAME keeps the data and every
--      foreign key that points at the tables.
--   2. Remaps the source type of existing data-source rows (only while the
--      legacy column PubSource_Code still exists, i.e. exactly once):
--        old 1 Peer-reviewed publication           -> 1 Journal Article
--        old 2 Federal agency                      -> 3 Government or Technical Report
--        old 3 State or provincial agency          -> 3
--        old 4 Local or regional government agency -> 3
--        old 5 Non-governmental Organization       -> 3
--        old 6 Other                               -> 3  (REVIEW BY HAND after deploy;
--                                                         the pre-flight below lists them)
--      The old code is kept in PubSource_Legacy (the code itself when the
--      column is empty or already holds it, otherwise appended as
--      " [PubSource_Ref <n>]"), so the original category is never lost.
--      All remapped rows land on Published types (1/3), so their existing year
--      satisfies the new CHECK rules.
--   3. Renames / adds DataSourceReference columns (PI §A2):
--        PublicationUniqueID -> data_source_id
--        PubSource_Code      -> source_type_id                 (NOT NULL, FK)
--        Authors             -> authors_or_organization        (now NULL-able)
--        Year                -> publication_year               (now NULL-able)
--        (new)                  source_title                   (NOT NULL; back-filled)
--        Journal             -> journal_publisher_or_repository (now NULL-able)
--        (new)                  source_identifier_or_url
--        (new)                  project_or_collection_name
--        (new)                  date_accessed
--        FullCitation_APA    -> citation_text                  (now NULL-able)
--        PubSource_Legacy       kept, now NULL-able (new rows leave it NULL)
--        (new)                  EnteredBy -> users.User_UniqueID (per-user reuse list)
--        DateEntered            kept
--      source_title is back-filled from the citation: the title segment of an
--      APA citation (the text after "(YYYY). " up to the next ". "), else the
--      whole citation, else Journal, else 'Untitled source'.
--      EnteredBy is back-filled from SamplingEvent.UserSamplingID where every
--      event that cites the source was entered by the same user; sources cited
--      by several users stay NULL.
--   4. Renames DataSourceTypeReference columns (PubSourceUniqueID ->
--      source_type_id, PubSourceLabel -> source_type_name, PubSourceDescription
--      -> description), adds publication_status, and replaces the six old rows
--      with the PI's eight (ids 1-6 are rewritten in place, 7-8 inserted;
--      SortOrder 10..80).
--   5. SamplingEvent.PublicationID_Num keeps its name. Its foreign key
--      FK_Event_Publication is dropped and re-created identically (same name,
--      ON UPDATE CASCADE) around the parent-column rename so the rename works
--      the same on MariaDB 10.6 and MySQL 8+.
--   6. Adds the PI's CHECK rules (MariaDB syntax):
--        chk_publication_year : types 1-4 need a year, types 5-8 must not have one
--        chk_date_accessed    : type 4 needs an access date, other types must not
--        chk_source_type_publication_status : 'Published' / 'Unpublished'
--      The source-type foreign key is re-created WITHOUT ON UPDATE CASCADE
--      (FK_DataSource_SourceType): MySQL refuses CHECK constraints on a column
--      with a cascading FK action, and the eight type IDs are fixed anyway.
--
-- Deployment order:
--   1. Back up the database (node scripts/backup-database.js).
--   2. Run this migration: node scripts/update-database.js db/20261105_redesign_data_source_tables.sql
--      (the runner does not print SELECT results; run the pre-flight and
--      post-migration SELECTs by hand in phpMyAdmin if you want to see them).
--   3. Review the rows that were old type 6 "Other" (moved to type 3):
--        SELECT * FROM DataSourceReference
--        WHERE PubSource_Legacy = '6' OR PubSource_Legacy LIKE '%[PubSource_Ref 6]';
--      and set the right source_type_id by hand (mind the CHECK rules: types
--      5-8 need publication_year = NULL, type 4 needs date_accessed).
--   4. Deploy routes/api.js (and the data-entry form) in the same window. The
--      old routes/api.js reads PubSource_Ref / Publications and fails with
--      "Table ... doesn't exist" until it is replaced; the new routes/api.js
--      fails the same way against an un-migrated database.

-- ---------------------------------------------------------------------------
-- Pre-flight: current layout, and the legacy rows whose type changes meaning.
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME, TABLE_ROWS
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('PubSource_Ref', 'Publications', 'DataSourceTypeReference', 'DataSourceReference')
ORDER BY TABLE_NAME;

SET @legacy_pub_table = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Publications' AND COLUMN_NAME = 'PubSource_Code');
SET @sql = IF(@legacy_pub_table = 1,
    'SELECT PubSource_Code AS legacy_type, COUNT(*) AS rows_before_remap,
            CASE PubSource_Code WHEN 1 THEN ''-> 1 Journal Article''
                                WHEN 6 THEN ''-> 3 (legacy_type_other: REVIEW BY HAND)''
                                ELSE ''-> 3 Government or Technical Report'' END AS remap
     FROM `Publications` GROUP BY PubSource_Code ORDER BY PubSource_Code',
    'SELECT ''Publications already migrated'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(@legacy_pub_table = 1,
    'SELECT PublicationUniqueID AS legacy_type_other_id, Year, Authors, FullCitation_APA
     FROM `Publications` WHERE PubSource_Code = 6 ORDER BY PublicationUniqueID',
    'SELECT ''Publications already migrated'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 1: rename the tables (foreign keys that reference them follow along).
-- ---------------------------------------------------------------------------
SET @old_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PubSource_Ref');
SET @new_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceTypeReference');
SET @sql = IF(@old_exists = 1 AND @new_exists = 0,
    'RENAME TABLE `PubSource_Ref` TO `DataSourceTypeReference`',
    IF(@old_exists = 1,
       'SELECT ''WARNING: both PubSource_Ref and DataSourceTypeReference exist; nothing renamed, drop the stale one by hand'' AS notice',
       'SELECT ''PubSource_Ref already renamed to DataSourceTypeReference'' AS notice'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Publications');
SET @new_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference');
SET @sql = IF(@old_exists = 1 AND @new_exists = 0,
    'RENAME TABLE `Publications` TO `DataSourceReference`',
    IF(@old_exists = 1,
       'SELECT ''WARNING: both Publications and DataSourceReference exist; nothing renamed, drop the stale one by hand'' AS notice',
       'SELECT ''Publications already renamed to DataSourceReference'' AS notice'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 2: drop the foreign keys that sit on columns about to be renamed.
-- Both are re-created in step 6.
-- ---------------------------------------------------------------------------
SET @has_fk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference'
                 AND CONSTRAINT_NAME = 'FK_Publication_Source' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@has_fk = 1,
    'ALTER TABLE `DataSourceReference` DROP FOREIGN KEY `FK_Publication_Source`',
    'SELECT ''FK_Publication_Source already dropped'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK_Event_Publication is only dropped while the parent column still has its
-- old name, i.e. while the rename below is still pending.
SET @has_old_pk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'PublicationUniqueID');
SET @has_fk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'SamplingEvent'
                 AND CONSTRAINT_NAME = 'FK_Event_Publication' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@has_old_pk = 1 AND @has_fk = 1,
    'ALTER TABLE `SamplingEvent` DROP FOREIGN KEY `FK_Event_Publication`',
    'SELECT ''FK_Event_Publication left in place'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 3: remap legacy source types. Runs only while PubSource_Code still
-- exists (the rename in step 4 retires it), so new-style type 5-8 rows are
-- never touched by a re-run. The mapping is also idempotent on its own
-- (1 -> 1, 3 -> 3), so a crash between this UPDATE and the rename is safe.
-- ---------------------------------------------------------------------------
SET @legacy_pub_cols = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'PubSource_Code');
SET @sql = IF(@legacy_pub_cols = 1,
    'UPDATE `DataSourceReference`
     SET `PubSource_Legacy` = CASE
             WHEN `PubSource_Legacy` IS NULL OR TRIM(`PubSource_Legacy`) = ''''
                 THEN CAST(`PubSource_Code` AS CHAR)
             WHEN TRIM(`PubSource_Legacy`) = CAST(`PubSource_Code` AS CHAR) COLLATE utf8mb4_unicode_ci
                 THEN `PubSource_Legacy`
             ELSE CONCAT(`PubSource_Legacy`, '' [PubSource_Ref '', `PubSource_Code`, '']'' COLLATE utf8mb4_unicode_ci) END,
         `PubSource_Code` = CASE WHEN `PubSource_Code` = 1 THEN 1 ELSE 3 END',
    'SELECT ''Legacy source types already remapped'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 4a: DataSourceReference columns (one guarded statement per column).
-- ---------------------------------------------------------------------------
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'PublicationUniqueID');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceReference` CHANGE COLUMN `PublicationUniqueID` `data_source_id` INT NOT NULL
         COMMENT ''Unique data-source record ID (SamplingEvent.PublicationID_Num points here)''',
    'SELECT ''data_source_id already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'PubSource_Code');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceReference` CHANGE COLUMN `PubSource_Code` `source_type_id` INT NOT NULL
         COMMENT ''DataSourceTypeReference.source_type_id (1-4 Published, 5-8 Unpublished)''
         AFTER `data_source_id`',
    'SELECT ''source_type_id already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'Authors');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceReference` CHANGE COLUMN `Authors` `authors_or_organization` MEDIUMTEXT NULL
         COMMENT ''Authors or responsible organization''
         AFTER `source_type_id`',
    'SELECT ''authors_or_organization already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'Year');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceReference` CHANGE COLUMN `Year` `publication_year` INT NULL
         COMMENT ''Publication year; required for types 1-4, must be NULL for types 5-8''
         AFTER `authors_or_organization`',
    'SELECT ''publication_year already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'source_title');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `DataSourceReference` ADD COLUMN `source_title` VARCHAR(500) NULL
         COMMENT ''Article, report, dataset or project title''
         AFTER `publication_year`',
    'SELECT ''source_title already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'Journal');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceReference` CHANGE COLUMN `Journal` `journal_publisher_or_repository` MEDIUMTEXT NULL
         COMMENT ''Journal, publisher, agency, or repository''
         AFTER `source_title`',
    'SELECT ''journal_publisher_or_repository already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'source_identifier_or_url');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `DataSourceReference` ADD COLUMN `source_identifier_or_url` VARCHAR(500) NULL
         COMMENT ''DOI, ISBN, report number, dataset ID, or URL''
         AFTER `journal_publisher_or_repository`',
    'SELECT ''source_identifier_or_url already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'project_or_collection_name');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `DataSourceReference` ADD COLUMN `project_or_collection_name` VARCHAR(255) NULL
         COMMENT ''Associated project or collection name''
         AFTER `source_identifier_or_url`',
    'SELECT ''project_or_collection_name already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'date_accessed');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `DataSourceReference` ADD COLUMN `date_accessed` DATE NULL
         COMMENT ''Access date; required only for type 4 (Public Database or Data Repository)''
         AFTER `project_or_collection_name`',
    'SELECT ''date_accessed already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'FullCitation_APA');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceReference` CHANGE COLUMN `FullCitation_APA` `citation_text` MEDIUMTEXT NULL
         COMMENT ''Complete APA-style citation''
         AFTER `date_accessed`',
    'SELECT ''citation_text already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- PubSource_Legacy: keep the history, but new rows have nothing to put there.
ALTER TABLE `DataSourceReference` MODIFY COLUMN `PubSource_Legacy` MEDIUMTEXT NULL
    COMMENT 'Pre-2026-11 PubSource_Ref code of migrated rows; NULL for rows entered after the redesign';

SET @has_entered_by = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference' AND COLUMN_NAME = 'EnteredBy');
SET @sql = IF(@has_entered_by = 0,
    'ALTER TABLE `DataSourceReference` ADD COLUMN `EnteredBy` INT NULL
         COMMENT ''users.User_UniqueID of the user who entered this data source (drives the per-user reuse list)''
         AFTER `PubSource_Legacy`',
    'SELECT ''EnteredBy already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Back-fill EnteredBy once (only in the run that created the column): the
-- single user whose sampling events cite the source. Sources cited by events of
-- several users, or by none, stay NULL.
SET @sql = IF(@has_entered_by = 0,
    'UPDATE `DataSourceReference` ds
     JOIN (SELECT `PublicationID_Num` AS data_source_id, MIN(`UserSamplingID`) AS user_id
           FROM `SamplingEvent`
           WHERE `PublicationID_Num` IS NOT NULL
           GROUP BY `PublicationID_Num`
           HAVING COUNT(DISTINCT `UserSamplingID`) = 1) owner
       ON owner.data_source_id = ds.`data_source_id`
     JOIN `users` u ON u.`User_UniqueID` = owner.user_id
     SET ds.`EnteredBy` = owner.user_id
     WHERE ds.`EnteredBy` IS NULL',
    'SELECT ''EnteredBy back-fill already done'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 4b: back-fill source_title, then make it mandatory.
-- ---------------------------------------------------------------------------
-- Citations pasted from publishers often use non-breaking spaces (U+00A0)
-- after the periods; normalise them before looking for ". ".
SET @nbsp = CONVERT(X'C2A0' USING utf8mb4);
UPDATE `DataSourceReference`
SET `source_title` = LEFT(TRIM(COALESCE(
        -- Title segment of an APA citation: "... (2016). <Title>. <Journal>, ..."
        NULLIF(TRIM(CASE
            WHEN LOCATE('). ', REPLACE(`citation_text`, @nbsp, ' ')) > 0
            THEN SUBSTRING_INDEX(
                     SUBSTRING(REPLACE(`citation_text`, @nbsp, ' '),
                               LOCATE('). ', REPLACE(`citation_text`, @nbsp, ' ')) + 3),
                     '. ', 1)
        END), ''),
        NULLIF(TRIM(`citation_text`), ''),
        NULLIF(TRIM(`journal_publisher_or_repository`), ''),
        'Untitled source'
    )), 500)
WHERE `source_title` IS NULL OR TRIM(`source_title`) = '';

ALTER TABLE `DataSourceReference` MODIFY COLUMN `source_title` VARCHAR(500) NOT NULL
    COMMENT 'Article, report, dataset or project title';

-- ---------------------------------------------------------------------------
-- Step 5: DataSourceTypeReference — the PI's eight types.
-- ---------------------------------------------------------------------------
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceTypeReference' AND COLUMN_NAME = 'publication_status');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `DataSourceTypeReference` ADD COLUMN `publication_status` VARCHAR(20) NULL
         COMMENT ''Published (types 1-4) or Unpublished (types 5-8)''',
    'SELECT ''publication_status already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rewrite the six legacy rows in place (ids 1-6 keep their primary keys), only
-- while the legacy PubSourceLabel column still exists, so a later manual edit
-- of a label or SortOrder is never overwritten by a re-run.
SET @legacy_type_cols = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceTypeReference' AND COLUMN_NAME = 'PubSourceLabel');
SET @sql = IF(@legacy_type_cols = 1,
    'UPDATE `DataSourceTypeReference`
     SET `SortOrder` = `PubSourceUniqueID` * 10,
         `DateEntered` = CURDATE(),
         `PubSourceLabel` = CASE `PubSourceUniqueID`
             WHEN 1 THEN ''Journal Article''
             WHEN 2 THEN ''Book or Conference Publication''
             WHEN 3 THEN ''Government or Technical Report''
             WHEN 4 THEN ''Public Database or Data Repository''
             WHEN 5 THEN ''Research or Laboratory Data''
             WHEN 6 THEN ''Government or Industry Data'' END,
         `publication_status` = IF(`PubSourceUniqueID` <= 4, ''Published'', ''Unpublished''),
         `PubSourceDescription` = CASE `PubSourceUniqueID`
             WHEN 1 THEN ''Peer-reviewed journal articles''
             WHEN 2 THEN ''Books, book chapters, conference papers, and proceedings''
             WHEN 3 THEN ''Published government, agency, and industry reports''
             WHEN 4 THEN ''Publicly accessible datasets and data repositories''
             WHEN 5 THEN ''University research projects, laboratory experiments, and researcher-led field sampling''
             WHEN 6 THEN ''Unpublished data from government agencies, utilities, and industry partners'' END
     WHERE `PubSourceUniqueID` BETWEEN 1 AND 6',
    'SELECT ''Legacy source-type rows already rewritten'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceTypeReference' AND COLUMN_NAME = 'PubSourceUniqueID');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceTypeReference` CHANGE COLUMN `PubSourceUniqueID` `source_type_id` INT NOT NULL
         COMMENT ''Data-source type ID (1-4 Published, 5-8 Unpublished)''',
    'SELECT ''source_type_id already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceTypeReference' AND COLUMN_NAME = 'PubSourceLabel');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceTypeReference` CHANGE COLUMN `PubSourceLabel` `source_type_name` VARCHAR(100) NOT NULL
         COMMENT ''Data-source type shown on the form''
         AFTER `SortOrder`',
    'SELECT ''source_type_name already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceTypeReference' AND COLUMN_NAME = 'PubSourceDescription');
SET @sql = IF(@has_col = 1,
    'ALTER TABLE `DataSourceTypeReference` CHANGE COLUMN `PubSourceDescription` `description` VARCHAR(255) NOT NULL
         COMMENT ''What the type covers''
         AFTER `source_type_name`',
    'SELECT ''description already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Insert whichever of the eight rows is missing (7 and 8 on the first run;
-- all eight on a database that never had PubSource_Ref rows). Existing rows
-- are left alone.
INSERT IGNORE INTO `DataSourceTypeReference`
    (`source_type_id`, `SortOrder`, `source_type_name`, `publication_status`, `description`, `DateEntered`)
VALUES
    (1, 10, 'Journal Article',                             'Published',   'Peer-reviewed journal articles', CURDATE()),
    (2, 20, 'Book or Conference Publication',              'Published',   'Books, book chapters, conference papers, and proceedings', CURDATE()),
    (3, 30, 'Government or Technical Report',              'Published',   'Published government, agency, and industry reports', CURDATE()),
    (4, 40, 'Public Database or Data Repository',          'Published',   'Publicly accessible datasets and data repositories', CURDATE()),
    (5, 50, 'Research or Laboratory Data',                 'Unpublished', 'University research projects, laboratory experiments, and researcher-led field sampling', CURDATE()),
    (6, 60, 'Government or Industry Data',                 'Unpublished', 'Unpublished data from government agencies, utilities, and industry partners', CURDATE()),
    (7, 70, 'Community-Collected Data',                    'Unpublished', 'Data collected collaboratively with community organizations, NGOs, watershed groups, and local partners', CURDATE()),
    (8, 80, 'Citizen Science or Personal Collection Data', 'Unpublished', 'Data collected by individual citizens, volunteers, students, or citizen-science participants', CURDATE());

ALTER TABLE `DataSourceTypeReference` MODIFY COLUMN `publication_status` VARCHAR(20) NOT NULL
    COMMENT 'Published (types 1-4) or Unpublished (types 5-8)'
    AFTER `source_type_name`;

-- ---------------------------------------------------------------------------
-- Step 6: foreign keys.
-- ---------------------------------------------------------------------------
-- The index MariaDB/MySQL created for the old FK keeps its old name; give it
-- the new one so phpMyAdmin shows a consistent picture.
SET @has_idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference'
                  AND INDEX_NAME = 'FK_Publication_Source');
SET @sql = IF(@has_idx > 0,
    'ALTER TABLE `DataSourceReference` RENAME INDEX `FK_Publication_Source` TO `FK_DataSource_SourceType`',
    'SELECT ''source-type index already renamed'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- No ON UPDATE action: MySQL rejects CHECK constraints on a column whose FK
-- cascades, and the type IDs never change.
SET @has_fk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference'
                 AND CONSTRAINT_NAME = 'FK_DataSource_SourceType' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@has_fk = 0,
    'ALTER TABLE `DataSourceReference` ADD CONSTRAINT `FK_DataSource_SourceType`
         FOREIGN KEY (`source_type_id`) REFERENCES `DataSourceTypeReference` (`source_type_id`)',
    'SELECT ''FK_DataSource_SourceType already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference'
                 AND CONSTRAINT_NAME = 'FK_DataSource_EnteredBy' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@has_fk = 0,
    'ALTER TABLE `DataSourceReference` ADD CONSTRAINT `FK_DataSource_EnteredBy`
         FOREIGN KEY (`EnteredBy`) REFERENCES `users` (`User_UniqueID`) ON UPDATE CASCADE ON DELETE SET NULL',
    'SELECT ''FK_DataSource_EnteredBy already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Re-create the SamplingEvent link exactly as before (name and actions).
SET @has_fk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'SamplingEvent'
                 AND CONSTRAINT_NAME = 'FK_Event_Publication' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@has_fk = 0,
    'ALTER TABLE `SamplingEvent` ADD CONSTRAINT `FK_Event_Publication`
         FOREIGN KEY (`PublicationID_Num`) REFERENCES `DataSourceReference` (`data_source_id`) ON UPDATE CASCADE',
    'SELECT ''FK_Event_Publication already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 7: CHECK constraints. First show any row that would violate them (expect
-- zero: every legacy row was remapped to a Published type and keeps its year).
-- ---------------------------------------------------------------------------
SELECT 'chk_publication_year' AS rule_name, COUNT(*) AS violating_rows
FROM `DataSourceReference`
WHERE NOT ((`source_type_id` IN (1, 2, 3, 4) AND `publication_year` IS NOT NULL)
        OR (`source_type_id` IN (5, 6, 7, 8) AND `publication_year` IS NULL))
UNION ALL
SELECT 'chk_date_accessed', COUNT(*)
FROM `DataSourceReference`
WHERE NOT ((`source_type_id` = 4 AND `date_accessed` IS NOT NULL)
        OR (`source_type_id` <> 4 AND `date_accessed` IS NULL))
UNION ALL
SELECT 'chk_source_type_publication_status', COUNT(*)
FROM `DataSourceTypeReference`
WHERE `publication_status` NOT IN ('Published', 'Unpublished');

SET @has_chk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'chk_source_type_publication_status');
SET @sql = IF(@has_chk = 0,
    'ALTER TABLE `DataSourceTypeReference` ADD CONSTRAINT `chk_source_type_publication_status`
         CHECK (`publication_status` IN (''Published'', ''Unpublished''))',
    'SELECT ''chk_source_type_publication_status already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_chk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'chk_publication_year');
SET @sql = IF(@has_chk = 0,
    'ALTER TABLE `DataSourceReference` ADD CONSTRAINT `chk_publication_year`
         CHECK ((`source_type_id` IN (1, 2, 3, 4) AND `publication_year` IS NOT NULL)
             OR (`source_type_id` IN (5, 6, 7, 8) AND `publication_year` IS NULL))',
    'SELECT ''chk_publication_year already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_chk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'chk_date_accessed');
SET @sql = IF(@has_chk = 0,
    'ALTER TABLE `DataSourceReference` ADD CONSTRAINT `chk_date_accessed`
         CHECK ((`source_type_id` = 4 AND `date_accessed` IS NOT NULL)
             OR (`source_type_id` <> 4 AND `date_accessed` IS NULL))',
    'SELECT ''chk_date_accessed already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Post-migration check: the eight types, the data-source column layout, the
-- per-type row counts, and the foreign keys / CHECKs now in place.
-- ---------------------------------------------------------------------------
SELECT `source_type_id`, `SortOrder`, `source_type_name`, `publication_status`, `description`
FROM `DataSourceTypeReference`
ORDER BY `SortOrder`, `source_type_id`;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataSourceReference'
ORDER BY ORDINAL_POSITION;

SELECT `source_type_id`, COUNT(*) AS data_sources, SUM(`EnteredBy` IS NULL) AS without_entered_by
FROM `DataSourceReference`
GROUP BY `source_type_id`
ORDER BY `source_type_id`;

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND (TABLE_NAME IN ('DataSourceReference', 'DataSourceTypeReference')
       OR CONSTRAINT_NAME = 'FK_Event_Publication')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
